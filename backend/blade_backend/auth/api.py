from __future__ import annotations

import asyncio
import re
import secrets
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from blade_backend.audit.service import write_audit_event
from blade_backend.auth.jwt import (
    TokenError,
    issue_access_token,
    issue_refresh_token,
    parse_refresh_token,
    verify_refresh_secret,
)
from blade_backend.auth.mfa import CHALLENGE_TTL_SECONDS, issue_challenge_token
from blade_backend.auth.passwords import (
    PasswordPolicyError,
    hash_password,
    validate_password,
    verify_password,
)
from blade_backend.auth.rate_limit import login_rate_limiter
from blade_backend.auth.session import (
    AuthResponse,
    MemberView,
    MfaChallengeResponse,
    OrganizationView,
    clear_refresh_cookie,
    issue_session,
    read_refresh_cookie,
    request_ip,
    request_user_agent,
    serialize_member,
    serialize_org,
    set_refresh_cookie,
)
from blade_backend.auth.tokens import (
    EMAIL_VERIFY_PREFIX,
    PASSWORD_RESET_PREFIX,
    TokenFormatError,
    issue_token,
    parse_token,
    verify_token_secret,
)
from blade_backend.db.models import (
    EmailVerificationToken,
    MemberMfa,
    Organization,
    OrgMember,
    PasswordResetToken,
    RefreshToken,
)
from blade_backend.deps import CurrentMember, DbSession
from blade_backend.email import get_mailer, send_quietly
from blade_backend.email.templates import email_verification_email, password_reset_email
from blade_backend.settings import get_settings

router = APIRouter()

_ORG_CODE_BYTES = 18
_SLUG_RE = re.compile(r"[^a-z0-9]+")

__all__ = ["AuthResponse", "MemberView", "OrganizationView", "router"]


def _slugify(name: str) -> str:
    base = _SLUG_RE.sub("-", name.lower()).strip("-")
    return base or "org"


def _generate_org_code() -> str:
    suffix = secrets.token_urlsafe(_ORG_CODE_BYTES).replace("-", "").replace("_", "")
    return "BLD-" + suffix.upper()


async def _unique_slug(session: AsyncSession, base: str) -> str:
    for suffix in [""] + [f"-{secrets.token_hex(2)}" for _ in range(5)]:
        candidate = f"{base}{suffix}"
        existing = await session.scalar(
            select(Organization.id).where(Organization.slug == candidate)
        )
        if existing is None:
            return candidate
    return f"{base}-{secrets.token_hex(4)}"


async def _unique_org_code(session: AsyncSession) -> str:
    for _ in range(10):
        code = _generate_org_code()
        existing = await session.scalar(
            select(Organization.id).where(Organization.org_code == code)
        )
        if existing is None:
            return code
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="unable to allocate org code")


async def _mfa_enabled(session: AsyncSession, member_id: UUID) -> bool:
    confirmed = await session.scalar(
        select(MemberMfa.confirmed_at).where(MemberMfa.member_id == member_id)
    )
    return confirmed is not None


def _enforce_password_policy(password: str, email: str) -> None:
    try:
        validate_password(password, email=email)
    except PasswordPolicyError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc)) from exc


class SignupRequest(BaseModel):
    org_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    org_slug: str | None = Field(default=None, min_length=2, max_length=120)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)
    password: str = Field(min_length=12, max_length=128)


class VerifyEmailRequest(BaseModel):
    token: str = Field(min_length=16, max_length=512)


class SwitchOrgRequest(BaseModel):
    org_id: UUID


class SessionOut(BaseModel):
    id: str
    created_at: str
    last_used_at: str | None
    user_agent: str | None
    ip_address: str | None
    current: bool


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(
    payload: SignupRequest,
    response: Response,
    request: Request,
    session: DbSession,
) -> AuthResponse:
    settings = get_settings()
    if not settings.allow_open_signup:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="open signup is disabled")

    email = str(payload.email).lower().strip()
    _enforce_password_policy(payload.password, email)
    slug = await _unique_slug(session, _slugify(payload.org_name))
    org_code = await _unique_org_code(session)
    password_hash = await asyncio.to_thread(hash_password, payload.password)

    try:
        org = Organization(name=payload.org_name.strip(), slug=slug, org_code=org_code)
        session.add(org)
        await session.flush()

        member = OrgMember(
            org_id=org.id,
            email=email,
            name=payload.name,
            password_hash=password_hash,
            role="owner",
            status="active",
        )
        session.add(member)
        await session.flush()
        await _send_verification_email(session, member)
        return await issue_session(session, response, member, org, request=request)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="organization or member already exists"
        ) from exc


@router.post(
    "/login",
    response_model=AuthResponse | MfaChallengeResponse,
    response_model_exclude_none=True,
)
async def login(
    payload: LoginRequest,
    response: Response,
    request: Request,
    session: DbSession,
) -> AuthResponse | MfaChallengeResponse:
    email = str(payload.email).lower().strip()
    limit = await login_rate_limiter.check(request, email)
    if not limit.allowed:
        await _audit_login_lockout(
            session,
            email=email,
            org_slug=payload.org_slug,
            retry_after_seconds=limit.retry_after_seconds,
        )
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            detail="too many login attempts",
            headers={"Retry-After": str(limit.retry_after_seconds)},
        )
    members = await _login_members(session, email, payload.org_slug)
    if not members:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    verified_members: list[OrgMember] = []
    for candidate in members:
        if candidate.password_hash is None:
            continue
        password_ok = await asyncio.to_thread(
            verify_password,
            payload.password,
            candidate.password_hash,
        )
        if password_ok:
            verified_members.append(candidate)

    if not verified_members:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
    if payload.org_slug is None and len(verified_members) > 1:
        choices = await _org_choices(session, verified_members)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail={
                "code": "org_selection_required",
                "organizations": [choice.model_dump() for choice in choices],
            },
        )

    member = verified_members[0]
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="organization missing")

    if await _mfa_enabled(session, member.id):
        return MfaChallengeResponse(
            challenge_token=issue_challenge_token(member.id, org.id),
            expires_in=CHALLENGE_TTL_SECONDS,
        )
    return await issue_session(session, response, member, org, request=request)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(response: Response, request: Request, session: DbSession) -> AuthResponse:
    """Rotate the refresh token and mint a new access token.

    The old token stays usable for ``refresh_rotation_grace_seconds`` so two
    dashboard tabs refreshing at once do not sign each other out. Presented
    after that window it can only have been copied, so the whole family - every
    descendant of that login - is revoked.
    """
    settings = get_settings()
    refresh_cookie = read_refresh_cookie(request, settings)
    if not refresh_cookie:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing refresh token")
    try:
        token_id, secret = parse_refresh_token(refresh_cookie)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token") from exc

    record = await session.get(RefreshToken, token_id)
    if record is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")
    secret_ok = await asyncio.to_thread(verify_refresh_secret, secret, record.token_hash)
    if not secret_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")

    now = datetime.now(UTC)
    if record.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="refresh token expired")
    if record.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="refresh token revoked")

    member = await session.get(OrgMember, record.member_id)
    if member is None or member.status != "active":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="member inactive")
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="organization missing")

    replayed = record.rotated_at is not None and now - record.rotated_at > timedelta(
        seconds=settings.refresh_rotation_grace_seconds
    )
    if replayed:
        await _revoke_family(session, record, now)
        await write_audit_event(
            session,
            org_id=org.id,
            actor=f"member:{member.email}",
            category="auth",
            action="refresh_token_reuse_detected",
            metadata={"family_id": str(record.family_id), "token_id": str(record.id)},
        )
        await session.commit()
        clear_refresh_cookie(response, settings)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="refresh token reuse detected")

    mfa_enabled = await _mfa_enabled(session, member.id)
    access_token = issue_access_token(str(member.id), str(org.id), member.role)
    record.last_used_at = now

    if record.rotated_at is None:
        issued = await asyncio.to_thread(
            issue_refresh_token, ttl_days=settings.jwt_refresh_ttl_days
        )
        record.rotated_at = now
        session.add(
            RefreshToken(
                id=issued.id,
                member_id=member.id,
                family_id=record.family_id,
                token_hash=issued.token_hash,
                expires_at=issued.expires_at,
                last_used_at=now,
                user_agent=request_user_agent(request),
                ip_address=request_ip(request),
            )
        )
        await session.commit()
        set_refresh_cookie(response, issued.raw_token, settings, issued.expires_at)
    else:
        await session.commit()

    return AuthResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_ttl_seconds,
        member=serialize_member(member, mfa_enabled=mfa_enabled),
        organization=serialize_org(org, viewer_role=member.role),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, request: Request, session: DbSession) -> Response:
    settings = get_settings()
    refresh_cookie = read_refresh_cookie(request, settings)
    if refresh_cookie:
        try:
            token_id, _ = parse_refresh_token(refresh_cookie)
            record = await session.get(RefreshToken, token_id)
            if record is not None:
                await _revoke_family(session, record, datetime.now(UTC))
                await session.commit()
        except TokenError:
            pass
    clear_refresh_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(
    member: CurrentMember, request: Request, session: DbSession
) -> list[SessionOut]:
    """Active refresh tokens for the caller, newest first."""
    settings = get_settings()
    current_id: UUID | None = None
    cookie = read_refresh_cookie(request, settings)
    if cookie:
        try:
            current_id, _ = parse_refresh_token(cookie)
        except TokenError:
            current_id = None

    now = datetime.now(UTC)
    rows = (
        await session.scalars(
            select(RefreshToken)
            .where(
                RefreshToken.member_id == member.member_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.rotated_at.is_(None),
                RefreshToken.expires_at > now,
            )
            .order_by(RefreshToken.created_at.desc())
        )
    ).all()
    return [
        SessionOut(
            id=str(row.id),
            created_at=row.created_at.isoformat(),
            last_used_at=row.last_used_at.isoformat() if row.last_used_at else None,
            user_agent=row.user_agent,
            ip_address=row.ip_address,
            current=row.id == current_id,
        )
        for row in rows
    ]


@router.post("/sessions/revoke-all", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_all_sessions(
    member: CurrentMember, response: Response, session: DbSession
) -> Response:
    """Sign the member out everywhere.

    Logging out only killed the device you were holding, which is useless when
    the reason you are logging out is that a different device was stolen.
    """
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.member_id == member.member_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="auth",
        action="sessions_revoked_all",
        metadata={},
    )
    await session.commit()
    clear_refresh_cookie(response, get_settings())
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/switch-org", response_model=AuthResponse)
async def switch_org(
    payload: SwitchOrgRequest,
    member: CurrentMember,
    response: Response,
    request: Request,
    session: DbSession,
) -> AuthResponse:
    """Move the session to another org the same email belongs to.

    Switching used to mean logging in again, so staff who cover two hospitals
    re-typed their password all day and learned to pick a weak one.
    """
    target = await session.scalar(
        select(OrgMember).where(
            OrgMember.org_id == payload.org_id,
            OrgMember.email == member.email,
            OrgMember.status == "active",
        )
    )
    if target is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="no active membership in that org")
    org = await session.get(Organization, target.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="organization missing")

    mfa_enabled = await _mfa_enabled(session, target.id)
    await write_audit_event(
        session,
        org_id=org.id,
        actor=f"member:{member.email}",
        category="auth",
        action="org_switched",
        metadata={"from_org_id": str(member.org_id)},
    )
    return await issue_session(
        session, response, target, org, request=request, mfa_enabled=mfa_enabled
    )


@router.post("/forgot-password", status_code=status.HTTP_204_NO_CONTENT)
async def forgot_password(
    payload: ForgotPasswordRequest,
    request: Request,
    session: DbSession,
) -> Response:
    """Mail a single-use reset link.

    Always 204, whatever the address. Any difference in status, body or timing
    between a known and an unknown address turns this into a directory of who
    works at the hospital.
    """
    email = str(payload.email).lower().strip()
    limit = await login_rate_limiter.check(request, f"forgot:{email}")
    if limit.allowed:
        member = await session.scalar(
            select(OrgMember)
            .where(OrgMember.email == email, OrgMember.status == "active")
            .order_by(OrgMember.created_at.asc())
            .limit(1)
        )
        if member is not None:
            await _send_password_reset_email(session, member)
            await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(payload: ResetPasswordRequest, session: DbSession) -> Response:
    now = datetime.now(UTC)
    try:
        token_id, secret = parse_token(PASSWORD_RESET_PREFIX, payload.token.strip())
    except TokenFormatError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid reset token") from exc

    record = await session.get(PasswordResetToken, token_id)
    if record is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid reset token")
    secret_ok = await asyncio.to_thread(verify_token_secret, secret, record.token_hash)
    if not secret_ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid reset token")
    if record.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="reset token already used")
    if record.expires_at <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="reset token expired")

    member = await session.get(OrgMember, record.member_id)
    if member is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid reset token")
    _enforce_password_policy(payload.password, member.email)

    password_hash = await asyncio.to_thread(hash_password, payload.password)
    record.used_at = now
    siblings = (
        await session.scalars(select(OrgMember).where(OrgMember.email == member.email))
    ).all()
    for sibling in siblings:
        sibling.password_hash = password_hash
        if sibling.status == "invited":
            sibling.status = "active"
            sibling.invite_token = None
            sibling.invite_expires_at = None
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.member_id.in_([sibling.id for sibling in siblings]),
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=now)
    )
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="auth",
        action="password_reset",
        metadata={"member_id": str(member.id)},
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/verify-email", status_code=status.HTTP_204_NO_CONTENT)
async def verify_email(payload: VerifyEmailRequest, session: DbSession) -> Response:
    now = datetime.now(UTC)
    try:
        token_id, secret = parse_token(EMAIL_VERIFY_PREFIX, payload.token.strip())
    except TokenFormatError as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="invalid verification token"
        ) from exc

    record = await session.get(EmailVerificationToken, token_id)
    if record is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid verification token")
    secret_ok = await asyncio.to_thread(verify_token_secret, secret, record.token_hash)
    if not secret_ok:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid verification token")
    if record.used_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="verification token already used")
    if record.expires_at <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="verification token expired")

    member = await session.get(OrgMember, record.member_id)
    if member is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid verification token")

    record.used_at = now
    siblings = (
        await session.scalars(select(OrgMember).where(OrgMember.email == member.email))
    ).all()
    for sibling in siblings:
        if sibling.email_verified_at is None:
            sibling.email_verified_at = now
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/resend-verification", status_code=status.HTTP_204_NO_CONTENT)
async def resend_verification(member: CurrentMember, session: DbSession) -> Response:
    """Re-send the verification mail for the caller's own address.

    Authenticated rather than taking an email in the body: an open endpoint
    would both enumerate accounts and let anyone mail-bomb a staff address.
    """
    db_member = await session.get(OrgMember, member.member_id)
    if db_member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="member missing")
    if db_member.email_verified_at is None:
        await _send_verification_email(session, db_member)
        await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=AuthResponse)
async def me(member: CurrentMember, session: DbSession) -> AuthResponse:
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="organization missing")
    db_member = await session.get(OrgMember, member.member_id)
    if db_member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="member missing")
    return AuthResponse(
        access_token="",
        expires_in=0,
        member=serialize_member(db_member, mfa_enabled=await _mfa_enabled(session, db_member.id)),
        organization=serialize_org(org, viewer_role=db_member.role),
    )


class OrgListItem(BaseModel):
    id: str
    name: str
    slug: str
    role: str


@router.get("/my-orgs", response_model=list[OrgListItem])
async def my_orgs(member: CurrentMember, session: DbSession) -> list[OrgListItem]:
    """List organizations for the authenticated member's email."""
    members = (
        await session.scalars(
            select(OrgMember).where(
                OrgMember.email == member.email,
                OrgMember.status == "active",
            )
        )
    ).all()
    return await _org_choices(session, list(members))


async def _org_choices(session: AsyncSession, members: list[OrgMember]) -> list[OrgListItem]:
    results: list[OrgListItem] = []
    for m in members:
        org = await session.get(Organization, m.org_id)
        if org:
            results.append(
                OrgListItem(
                    id=str(org.id),
                    name=org.name,
                    slug=org.slug,
                    role=m.role,
                )
            )
    return results


async def _login_members(
    session: AsyncSession, email: str, org_slug: str | None
) -> list[OrgMember]:
    if org_slug:
        org_id = await session.scalar(
            select(Organization.id).where(Organization.slug == _slugify(org_slug))
        )
        if org_id is None:
            return []
        member = await session.scalar(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.email == email,
                OrgMember.status == "active",
            )
        )
        return [member] if member is not None else []

    rows = (
        await session.scalars(
            select(OrgMember).where(OrgMember.email == email, OrgMember.status == "active")
        )
    ).all()
    return list(rows)


async def _audit_login_lockout(
    session: AsyncSession,
    *,
    email: str,
    org_slug: str | None,
    retry_after_seconds: int,
) -> None:
    members = await _login_members(session, email, org_slug)
    seen_orgs: set[object] = set()
    for member in members:
        if member.org_id in seen_orgs:
            continue
        seen_orgs.add(member.org_id)
        await write_audit_event(
            session,
            org_id=member.org_id,
            actor=f"login:{email}",
            category="auth",
            action="login_rate_limited",
            metadata={"email": email, "retry_after_seconds": retry_after_seconds},
        )
    if seen_orgs:
        await session.commit()


async def _revoke_family(session: AsyncSession, record: RefreshToken, now: datetime) -> None:
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.family_id == record.family_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )


async def _send_password_reset_email(session: AsyncSession, member: OrgMember) -> None:
    settings = get_settings()
    issued = await asyncio.to_thread(
        issue_token,
        PASSWORD_RESET_PREFIX,
        ttl=timedelta(seconds=settings.password_reset_ttl_seconds),
    )
    session.add(
        PasswordResetToken(
            id=issued.id,
            member_id=member.id,
            token_hash=issued.token_hash,
            expires_at=issued.expires_at,
        )
    )
    subject, body = password_reset_email(
        base_url=settings.app_base_url,
        token=issued.raw_token,
        ttl_seconds=settings.password_reset_ttl_seconds,
    )
    await send_quietly(get_mailer(), to=member.email, subject=subject, body=body)


async def _send_verification_email(session: AsyncSession, member: OrgMember) -> None:
    settings = get_settings()
    issued = await asyncio.to_thread(
        issue_token,
        EMAIL_VERIFY_PREFIX,
        ttl=timedelta(hours=settings.email_verification_ttl_hours),
    )
    session.add(
        EmailVerificationToken(
            id=issued.id,
            member_id=member.id,
            token_hash=issued.token_hash,
            expires_at=issued.expires_at,
        )
    )
    subject, body = email_verification_email(
        base_url=settings.app_base_url,
        token=issued.raw_token,
        ttl_hours=settings.email_verification_ttl_hours,
    )
    await send_quietly(get_mailer(), to=member.email, subject=subject, body=body)
