from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from fastapi import Request, Response
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.auth.jwt import issue_access_token, issue_refresh_token
from aurodlpv2_backend.db.models import Organization, OrgMember, RefreshToken
from aurodlpv2_backend.observability.security import resolve_client_ip
from aurodlpv2_backend.settings import Settings, get_settings
from aurodlpv2_backend.utils.uuid import uuid7

_USER_AGENT_MAX_LENGTH = 256

REFRESH_COOKIE_PATH = "/api/v1/auth"

ORG_CODE_ROLES: frozenset[str] = frozenset({"owner", "admin"})


class MemberView(BaseModel):
    id: str
    email: str
    name: str | None
    role: str
    email_verified: bool = True
    mfa_enabled: bool = False


class OrganizationView(BaseModel):
    id: str
    name: str
    slug: str
    org_code: str | None = None
    plan: str


class AuthResponse(BaseModel):
    access_token: str
    expires_in: int
    member: MemberView
    organization: OrganizationView
    mfa_required: bool = False


class MfaChallengeResponse(BaseModel):
    mfa_required: bool = True
    challenge_token: str
    expires_in: int


def serialize_member(
    member: OrgMember, *, mfa_enabled: bool = False, include_verification: bool = True
) -> MemberView:
    return MemberView(
        id=str(member.id),
        email=member.email,
        name=member.name,
        role=member.role,
        email_verified=member.email_verified_at is not None if include_verification else True,
        mfa_enabled=mfa_enabled,
    )


def serialize_org(org: Organization, *, viewer_role: str | None = None) -> OrganizationView:
    return OrganizationView(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        org_code=org.org_code if viewer_role in ORG_CODE_ROLES else None,
        plan=org.plan,
    )


def set_refresh_cookie(
    response: Response, token: str, settings: Settings, expires: datetime
) -> None:
    response.set_cookie(
        key=settings.refresh_cookie_name,
        value=token,
        httponly=True,
        secure=settings.refresh_cookie_secure,
        samesite=settings.refresh_cookie_samesite,
        expires=expires,
        path=REFRESH_COOKIE_PATH,
    )


def clear_refresh_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(key=settings.refresh_cookie_name, path=REFRESH_COOKIE_PATH)


def read_refresh_cookie(request: Request, settings: Settings) -> str | None:
    return request.cookies.get(settings.refresh_cookie_name)


def request_user_agent(request: Request | None) -> str | None:
    if request is None:
        return None
    agent = request.headers.get("user-agent")
    return agent[:_USER_AGENT_MAX_LENGTH] if agent else None


def request_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    return resolve_client_ip(request, get_settings().trusted_proxy_count)


async def issue_session(
    session: AsyncSession,
    response: Response,
    member: OrgMember,
    org: Organization,
    *,
    request: Request | None = None,
    mfa_enabled: bool = False,
) -> AuthResponse:
    settings = get_settings()
    access_token = issue_access_token(str(member.id), str(org.id), member.role)
    issued = await asyncio.to_thread(issue_refresh_token, ttl_days=settings.jwt_refresh_ttl_days)
    now = datetime.now(UTC)
    session.add(
        RefreshToken(
            id=issued.id,
            member_id=member.id,
            family_id=uuid7(),
            token_hash=issued.token_hash,
            expires_at=issued.expires_at,
            last_used_at=now,
            user_agent=request_user_agent(request),
            ip_address=request_ip(request),
        )
    )
    member.last_login_at = now
    await session.commit()
    set_refresh_cookie(response, issued.raw_token, settings, issued.expires_at)
    return AuthResponse(
        access_token=access_token,
        expires_in=settings.jwt_access_ttl_seconds,
        member=serialize_member(member, mfa_enabled=mfa_enabled),
        organization=serialize_org(org, viewer_role=member.role),
    )
