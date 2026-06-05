"""Auth API (orgs + members) — email/password signup, login, refresh, logout, me."""

from __future__ import annotations

import asyncio
import re
import secrets
from datetime import UTC, datetime

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from argon2.low_level import Type
from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.auth.jwt import (
    TokenError,
    issue_access_token,
    issue_refresh_token,
    parse_refresh_token,
    verify_refresh_secret,
)
from aurodlpv2_backend.db.models import Organization, OrgMember, RefreshToken
from aurodlpv2_backend.deps import CurrentMember, DbSession
from aurodlpv2_backend.settings import Settings, get_settings

router = APIRouter()

_PASSWORD_HASHER = PasswordHasher(type=Type.ID)
_ORG_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _hash_password(plain: str) -> bytes:
    return _PASSWORD_HASHER.hash(plain).encode("utf-8")


def _verify_password(plain: str, hashed: bytes) -> bool:
    try:
        return _PASSWORD_HASHER.verify(hashed.decode("utf-8"), plain)
    except (UnicodeDecodeError, VerificationError, VerifyMismatchError):
        return False


def _slugify(name: str) -> str:
    base = _SLUG_RE.sub("-", name.lower()).strip("-")
    return base or "org"


def _generate_org_code() -> str:
    return "AUR-" + "".join(secrets.choice(_ORG_CODE_ALPHABET) for _ in range(6))


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


def _serialize_member(member: OrgMember) -> MemberView:
    return MemberView(
        id=str(member.id),
        email=member.email,
        name=member.name,
        role=member.role,
    )


def _serialize_org(org: Organization) -> OrganizationView:
    return OrganizationView(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        org_code=org.org_code,
        plan=org.plan,
    )


class SignupRequest(BaseModel):
    org_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    org_slug: str | None = Field(default=None, min_length=2, max_length=120)


class MemberView(BaseModel):
    id: str
    email: str
    name: str | None
    role: str


class OrganizationView(BaseModel):
    id: str
    name: str
    slug: str
    org_code: str
    plan: str


class AuthResponse(BaseModel):
    access_token: str
    expires_in: int
    member: MemberView
    organization: OrganizationView


def _set_refresh_cookie(
    response: Response, token: str, settings: Settings, expires: datetime
) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        expires=expires,
        path="/api/v1/auth",
    )


def _clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.refresh_cookie_name,
        path="/api/v1/auth",
    )


def _refresh_cookie(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(settings.refresh_cookie_name)


async def _issue_session(
    session: AsyncSession,
    response: Response,
    member: OrgMember,
    org: Organization,
) -> AuthResponse:
    settings = get_settings()
    access_token = issue_access_token(str(member.id), str(org.id), member.role)
    issued = await asyncio.to_thread(issue_refresh_token, ttl_days=settings.jwt_refresh_ttl_days)
    session.add(
        RefreshToken(
            id=issued.id,
            member_id=member.id,
            token_hash=issued.token_hash,
            expires_at=issued.expires_at,
        )
    )
    member.last_login_at = datetime.now(UTC)
    await session.commit()
    _set_refresh_cookie(response, issued.raw_token, settings, issued.expires_at)
    return AuthResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_ttl_seconds,
        member=_serialize_member(member),
        organization=_serialize_org(org),
    )


async def _login_member(
    session: AsyncSession, email: str, org_slug: str | None
) -> OrgMember | None:
    if org_slug:
        org_id = await session.scalar(
            select(Organization.id).where(Organization.slug == _slugify(org_slug))
        )
        if org_id is None:
            return None
        return await session.scalar(
            select(OrgMember).where(
                OrgMember.org_id == org_id,
                OrgMember.email == email,
                OrgMember.status == "active",
            )
        )

    rows = (
        await session.scalars(
            select(OrgMember).where(OrgMember.email == email, OrgMember.status == "active").limit(2)
        )
    ).all()
    members = list(rows)
    if len(members) > 1:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="email belongs to multiple organizations; include org_slug",
        )
    return members[0] if members else None


@router.post("/signup", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
async def signup(payload: SignupRequest, response: Response, session: DbSession) -> AuthResponse:
    email = str(payload.email).lower().strip()
    slug = await _unique_slug(session, _slugify(payload.org_name))
    org_code = await _unique_org_code(session)
    password_hash = await asyncio.to_thread(_hash_password, payload.password)

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
        return await _issue_session(session, response, member, org)
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="organization or member already exists"
        ) from exc


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, session: DbSession) -> AuthResponse:
    email = str(payload.email).lower().strip()
    member = await _login_member(session, email, payload.org_slug)
    if member is None or member.password_hash is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    password_ok = await asyncio.to_thread(_verify_password, payload.password, member.password_hash)
    if not password_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")

    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="organization missing")
    return await _issue_session(session, response, member, org)


@router.post("/refresh", response_model=AuthResponse)
async def refresh(response: Response, request: Request, session: DbSession) -> AuthResponse:
    """Validate refresh cookie → issue new access token. Does NOT rotate the
    refresh token — the same cookie stays valid until expiry or explicit logout.
    This eliminates race conditions from concurrent/double refresh calls."""
    settings = get_settings()
    refresh_cookie = _refresh_cookie(request, settings)
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

    # Issue new access token only — refresh token stays as-is.
    access_token = issue_access_token(str(member.id), str(org.id), member.role)
    return AuthResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_ttl_seconds,
        member=_serialize_member(member),
        organization=_serialize_org(org),
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(response: Response, request: Request, session: DbSession) -> Response:
    settings = get_settings()
    refresh_cookie = _refresh_cookie(request, settings)
    if refresh_cookie:
        try:
            token_id, _ = parse_refresh_token(refresh_cookie)
            record = await session.get(RefreshToken, token_id)
            if record is not None and record.revoked_at is None:
                record.revoked_at = datetime.now(UTC)
                await session.commit()
        except TokenError:
            pass
    _clear_refresh_cookie(response, settings)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


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
        member=_serialize_member(db_member),
        organization=_serialize_org(org),
    )


class OrgListItem(BaseModel):
    id: str
    name: str
    slug: str
    org_code: str
    role: str


@router.get("/my-orgs")
async def my_orgs(email: str, session: DbSession) -> list[OrgListItem]:
    """List all organizations an email belongs to (unauthenticated, for org picker)."""
    normalized = email.lower().strip()
    members = (
        await session.scalars(
            select(OrgMember).where(
                OrgMember.email == normalized,
                OrgMember.status == "active",
            )
        )
    ).all()
    results: list[OrgListItem] = []
    for m in members:
        org = await session.get(Organization, m.org_id)
        if org:
            results.append(
                OrgListItem(
                    id=str(org.id),
                    name=org.name,
                    slug=org.slug,
                    org_code=org.org_code,
                    role=m.role,
                )
            )
    return results
