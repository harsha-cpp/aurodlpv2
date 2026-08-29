from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.auth.mfa import (
    MfaError,
    consume_backup_code,
    decode_challenge_token,
    decrypt_secret,
    encrypt_secret,
    generate_backup_codes,
    generate_secret,
    hash_backup_code,
    provisioning_uri,
    verify_totp,
)
from aurodlpv2_backend.auth.session import AuthResponse, issue_session
from aurodlpv2_backend.db.models import MemberMfa, Organization, OrgMember
from aurodlpv2_backend.deps import CurrentMember, DbSession
from aurodlpv2_backend.settings import get_settings

router = APIRouter()


class MfaStatus(BaseModel):
    enrolled: bool
    confirmed: bool
    backup_codes_remaining: int


class EnrollResponse(BaseModel):
    otpauth_uri: str
    secret: str


class CodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=32)


class ConfirmResponse(BaseModel):
    backup_codes: list[str]


class MfaVerifyRequest(BaseModel):
    challenge_token: str = Field(min_length=16, max_length=2048)
    code: str = Field(min_length=6, max_length=32)


async def _load_mfa(session: DbSession, member_id: UUID) -> MemberMfa | None:
    return await session.scalar(select(MemberMfa).where(MemberMfa.member_id == member_id))


@router.get("", response_model=MfaStatus)
async def mfa_status(member: CurrentMember, session: DbSession) -> MfaStatus:
    record = await _load_mfa(session, member.member_id)
    if record is None:
        return MfaStatus(enrolled=False, confirmed=False, backup_codes_remaining=0)
    return MfaStatus(
        enrolled=True,
        confirmed=record.confirmed_at is not None,
        backup_codes_remaining=len(record.backup_codes),
    )


@router.post("/enroll", response_model=EnrollResponse)
async def enroll_mfa(member: CurrentMember, session: DbSession) -> EnrollResponse:
    """Start enrolment and hand back the provisioning URI."""
    record = await _load_mfa(session, member.member_id)
    if record is not None and record.confirmed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="mfa already enabled")

    settings = get_settings()
    secret = generate_secret()
    encrypted = encrypt_secret(secret, settings=settings)
    if record is None:
        record = MemberMfa(member_id=member.member_id, secret_encrypted=encrypted)
        session.add(record)
    else:
        record.secret_encrypted = encrypted
        record.backup_codes = []
    await session.commit()

    return EnrollResponse(
        otpauth_uri=provisioning_uri(secret, email=member.email, issuer=settings.mfa_issuer),
        secret=secret,
    )


@router.post("/confirm", response_model=ConfirmResponse)
async def confirm_mfa(
    payload: CodeRequest, member: CurrentMember, session: DbSession
) -> ConfirmResponse:
    record = await _load_mfa(session, member.member_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="mfa enrolment not started")
    if record.confirmed_at is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="mfa already enabled")

    secret = _decrypt_or_409(record)
    if not verify_totp(secret, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid code")

    codes = generate_backup_codes()
    record.backup_codes = [hash_backup_code(code) for code in codes]
    record.confirmed_at = datetime.now(UTC)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="auth",
        action="mfa_enabled",
        metadata={"member_id": str(member.member_id)},
    )
    await session.commit()
    return ConfirmResponse(backup_codes=codes)


@router.post("/disable", status_code=status.HTTP_204_NO_CONTENT)
async def disable_mfa(payload: CodeRequest, member: CurrentMember, session: DbSession) -> Response:
    """Turn MFA off. Requires a current code, not just a live session.

    A hijacked access token would otherwise be enough to strip the second
    factor and lock the real owner out.
    """
    record = await _load_mfa(session, member.member_id)
    if record is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="mfa not enabled")
    if record.confirmed_at is not None and not _accepts_code(record, payload.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid code")

    await session.delete(record)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="auth",
        action="mfa_disabled",
        metadata={"member_id": str(member.member_id)},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify", response_model=AuthResponse)
async def verify_mfa(
    payload: MfaVerifyRequest,
    response: Response,
    request: Request,
    session: DbSession,
) -> AuthResponse:
    """Exchange a login challenge plus a code for a session."""
    try:
        challenge = decode_challenge_token(payload.challenge_token)
    except MfaError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid mfa challenge") from exc

    db_member = await session.get(OrgMember, challenge.member_id)
    if db_member is None or db_member.status != "active" or db_member.org_id != challenge.org_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid mfa challenge")
    org = await session.get(Organization, db_member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="organization missing")

    record = await _load_mfa(session, db_member.id)
    if record is None or record.confirmed_at is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="mfa not enabled")
    if not _accepts_code(record, payload.code):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid code")

    record.last_used_at = datetime.now(UTC)
    return await issue_session(session, response, db_member, org, request=request, mfa_enabled=True)


def _decrypt_or_409(record: MemberMfa) -> str:
    try:
        return decrypt_secret(record.secret_encrypted)
    except MfaError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="mfa secret unreadable, re-enrol required"
        ) from exc


def _accepts_code(record: MemberMfa, code: str) -> bool:
    secret = _decrypt_or_409(record)
    if verify_totp(secret, code):
        return True
    remaining = consume_backup_code(record.backup_codes, code)
    if remaining is None:
        return False
    record.backup_codes = remaining
    return True
