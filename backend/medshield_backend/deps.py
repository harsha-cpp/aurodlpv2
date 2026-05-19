"""Reusable FastAPI dependencies."""

from __future__ import annotations

from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from medshield_backend.auth.jwt import TokenError, decode_access_token
from medshield_backend.db.models import User, UserRole, Workspace
from medshield_backend.db.session import get_session


@dataclass(frozen=True, slots=True)
class Principal:
    user_id: UUID
    workspace_id: UUID
    email: str
    role: UserRole


async def db_session() -> AsyncIterator[AsyncSession]:
    async for session in get_session():
        yield session


DbSession = Annotated[AsyncSession, Depends(db_session)]


async def current_user(
    session: DbSession,
    authorization: Annotated[str | None, Header()] = None,
) -> Principal:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")

    _scheme, _separator, token = authorization.partition(" ")
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    token = token.strip()
    try:
        claims = decode_access_token(token)
        user_id = UUID(claims.sub)
        workspace_id = UUID(claims.workspace_id)
    except (TokenError, ValueError) as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid bearer token") from exc

    user = await session.scalar(
        select(User).where(
            User.id == user_id,
            User.workspace_id == workspace_id,
        )
    )
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="unknown user")

    workspace = await session.scalar(select(Workspace.id).where(Workspace.id == workspace_id))
    if workspace is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="unknown workspace")

    return Principal(
        user_id=user.id,
        workspace_id=user.workspace_id,
        email=user.email,
        role=user.role,
    )


CurrentUser = Annotated[Principal, Depends(current_user)]


def require_role(*allowed: UserRole) -> Callable[[Principal], Awaitable[Principal]]:
    async def _gate(user: CurrentUser) -> Principal:
        if user.role not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="insufficient role")
        return user

    return _gate
