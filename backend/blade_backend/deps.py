from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from blade_backend.auth.jwt import TokenError, decode_access_token
from blade_backend.auth.tokens import (
    DEVICE_TOKEN_PREFIX,
    TokenFormatError,
    parse_token,
    verify_token_secret,
)
from blade_backend.db.models import DeviceToken, MemberRole, OrgMember
from blade_backend.db.session import get_session

_DEVICE_LAST_SEEN_INTERVAL = timedelta(minutes=5)


@dataclass(frozen=True, slots=True)
class Principal:
    member_id: UUID
    org_id: UUID
    email: str
    role: MemberRole


@dataclass(frozen=True, slots=True)
class DevicePrincipal:
    device_id: UUID
    org_id: UUID
    member_id: UUID | None
    email: str | None


async def db_session() -> AsyncIterator[AsyncSession]:
    async for session in get_session():
        yield session


DbSession = Annotated[AsyncSession, Depends(db_session)]


async def current_member(
    session: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    scheme, _separator, token = authorization.partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    try:
        claims = decode_access_token(token)
        member_id = UUID(claims.sub)
        org_id = UUID(claims.org_id)
    except (TokenError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid bearer token") from exc

    member = await session.scalar(
        select(OrgMember).where(
            OrgMember.id == member_id,
            OrgMember.org_id == org_id,
            OrgMember.status == "active",
        )
    )
    if member is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="unknown member")

    return Principal(
        member_id=member.id,
        org_id=member.org_id,
        email=member.email,
        role=member.role,
    )


CurrentMember = Annotated[Principal, Depends(current_member)]


async def current_device(
    session: DbSession,
    x_blade_device_token: Annotated[str | None, Header()] = None,
) -> DevicePrincipal:
    if not x_blade_device_token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing device token")
    try:
        device_id, secret = parse_token(DEVICE_TOKEN_PREFIX, x_blade_device_token.strip())
    except TokenFormatError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid device token") from exc

    device = await session.get(DeviceToken, device_id)
    if device is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid device token")
    secret_ok = await asyncio.to_thread(verify_token_secret, secret, device.token_hash)
    if not secret_ok:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid device token")

    now = datetime.now(UTC)
    if device.revoked_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="device token revoked")
    if device.expires_at <= now:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="device token expired")

    if device.last_seen_at is None or now - device.last_seen_at > _DEVICE_LAST_SEEN_INTERVAL:
        device.last_seen_at = now
        await session.commit()

    return DevicePrincipal(
        device_id=device.id,
        org_id=device.org_id,
        member_id=device.member_id,
        email=device.member_email,
    )


CurrentDevice = Annotated[DevicePrincipal, Depends(current_device)]


def require_role(*allowed: MemberRole) -> Callable[[Principal], Awaitable[Principal]]:
    async def _gate(member: CurrentMember) -> Principal:
        if member.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="insufficient role")
        return member

    return _gate


OwnerOnly = Annotated[Principal, Depends(require_role("owner"))]
OwnerOrAdmin = Annotated[Principal, Depends(require_role("owner", "admin"))]
DomainEditor = Annotated[Principal, Depends(require_role("owner", "admin", "analyst"))]
QuarantineReviewer = Annotated[Principal, Depends(require_role("owner", "admin", "analyst"))]
