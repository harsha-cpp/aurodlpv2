"""Reusable FastAPI dependencies."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.auth.jwt import TokenError, decode_access_token
from aurodlpv2_backend.db.models import MemberRole, OrgMember
from aurodlpv2_backend.db.session import get_session


@dataclass(frozen=True, slots=True)
class Principal:
    member_id: UUID
    org_id: UUID
    email: str
    role: MemberRole


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


def require_role(*allowed: MemberRole) -> Callable[[Principal], Awaitable[Principal]]:
    async def _gate(member: CurrentMember) -> Principal:
        if member.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="insufficient role")
        return member

    return _gate


OwnerOnly = Annotated[Principal, Depends(require_role("owner"))]
OwnerOrAdmin = Annotated[Principal, Depends(require_role("owner", "admin"))]
DomainEditor = Annotated[Principal, Depends(require_role("owner", "admin", "analyst"))]
