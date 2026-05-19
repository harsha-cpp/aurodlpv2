"""Auth endpoints."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Body, Cookie, Header, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import any_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from medshield_backend.audit.writer import write_event
from medshield_backend.auth.google_oauth import (
    GoogleIdentity,
    GoogleTokenError,
    verify_google_id_token,
)
from medshield_backend.auth.jwt import (
    TokenError,
    issue_access_token,
    issue_refresh_token,
    parse_refresh_token,
    refresh_token_is_active,
    verify_refresh_secret,
)
from medshield_backend.db.models import RefreshToken, User, Workspace
from medshield_backend.deps import CurrentUser, DbSession
from medshield_backend.settings import get_settings

REFRESH_COOKIE_NAME = "medshield_refresh"

router = APIRouter()


class GoogleTokenRequest(BaseModel):
    id_token: str = Field(min_length=1)


class AuthTokens(BaseModel):
    access_token: str
    expires_in: int
    token_type: Literal["Bearer"] = "Bearer"


class UserProfile(BaseModel):
    user_id: str
    email: str
    name: str
    workspace_id: str
    role: str


@router.post("/google", status_code=status.HTTP_200_OK)
async def exchange_google_token(
    response: Response,
    session: DbSession,
    payload: Annotated[GoogleTokenRequest | None, Body()] = None,
    authorization: Annotated[str | None, Header()] = None,
) -> AuthTokens:
    id_token = _google_token_from_request(payload, authorization)
    try:
        identity = await verify_google_id_token(id_token)
    except GoogleTokenError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Google token rejected") from exc

    workspace = await _workspace_for_domain(session, identity.hd)
    if workspace is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="workspace domain is not allowed")

    user = await _get_or_create_user(session, workspace, identity)
    tokens = await _issue_session_tokens(session, response, user)
    await write_event(
        session=session,
        workspace_id=workspace.id,
        actor_type="user",
        actor_id=str(user.id),
        actor_email=user.email,
        action="auth.login",
        category="auth",
        resource_type="user",
        resource_id=str(user.id),
        after_state={"email": user.email, "role": user.role},
        metadata={"google_hd": identity.hd},
    )
    await session.commit()
    return tokens


@router.post("/refresh")
async def refresh_token(
    response: Response,
    session: DbSession,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> AuthTokens:
    if not refresh_cookie:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="missing refresh token")

    token_row, secret = await _load_refresh_token(session, refresh_cookie)
    user = await session.scalar(select(User).where(User.id == token_row.user_id))
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="unknown refresh user")

    now = datetime.now(UTC)
    token_row.revoked_at = now
    tokens = await _issue_session_tokens(session, response, user)
    await write_event(
        session=session,
        workspace_id=user.workspace_id,
        actor_type="user",
        actor_id=str(user.id),
        actor_email=user.email,
        action="auth.refresh",
        category="auth",
        resource_type="refresh_token",
        resource_id=str(token_row.id),
        before_state={"revoked": False},
        after_state={"revoked": True},
        metadata={"rotated": True, "secret_verified": bool(secret)},
    )
    await session.commit()
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    session: DbSession,
    refresh_cookie: Annotated[str | None, Cookie(alias=REFRESH_COOKIE_NAME)] = None,
) -> None:
    response.delete_cookie(REFRESH_COOKIE_NAME)
    if not refresh_cookie:
        return
    try:
        token_id, _secret = parse_refresh_token(refresh_cookie)
    except TokenError:
        return

    token_row = await session.scalar(select(RefreshToken).where(RefreshToken.id == token_id))
    if token_row is None or token_row.revoked_at is not None:
        return

    token_row.revoked_at = datetime.now(UTC)
    user = await session.scalar(select(User).where(User.id == token_row.user_id))
    if user is not None:
        await write_event(
            session=session,
            workspace_id=user.workspace_id,
            actor_type="user",
            actor_id=str(user.id),
            actor_email=user.email,
            action="auth.logout",
            category="auth",
            resource_type="refresh_token",
            resource_id=str(token_row.id),
            before_state={"revoked": False},
            after_state={"revoked": True},
        )
    await session.commit()


@router.get("/me")
async def me(user: CurrentUser) -> UserProfile:
    return UserProfile(
        user_id=str(user.user_id),
        email=user.email,
        name=user.email,
        workspace_id=str(user.workspace_id),
        role=user.role,
    )


def _google_token_from_request(
    payload: GoogleTokenRequest | None,
    authorization: str | None,
) -> str:
    if payload is not None:
        return payload.id_token
    if authorization and authorization.lower().startswith("bearer "):
        _scheme, _separator, token = authorization.partition(" ")
        if token:
            return token
    raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="missing Google ID token")


async def _workspace_for_domain(session: AsyncSession, domain: str) -> Workspace | None:
    return await session.scalar(select(Workspace).where(any_(Workspace.google_domains) == domain))


async def _get_or_create_user(
    session: AsyncSession,
    workspace: Workspace,
    identity: GoogleIdentity,
) -> User:
    user = await session.scalar(
        select(User).where(
            User.workspace_id == workspace.id,
            User.email == identity.email,
        )
    )
    if user is not None:
        return user

    user = User(workspace_id=workspace.id, email=identity.email, role="user")
    session.add(user)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(
            select(User).where(
                User.workspace_id == workspace.id,
                User.email == identity.email,
            )
        )
        if existing is None:
            raise
        return existing

    await write_event(
        session=session,
        workspace_id=workspace.id,
        actor_type="user",
        actor_id=str(user.id),
        actor_email=user.email,
        action="user.created",
        category="auth",
        resource_type="user",
        resource_id=str(user.id),
        after_state={"email": user.email, "role": user.role},
    )
    return user


async def _issue_session_tokens(
    session: AsyncSession,
    response: Response,
    user: User,
) -> AuthTokens:
    settings = get_settings()
    refresh = await asyncio.to_thread(issue_refresh_token, ttl_days=settings.jwt_refresh_ttl_days)
    session.add(
        RefreshToken(
            id=refresh.id,
            user_id=user.id,
            token_hash=refresh.token_hash,
            expires_at=refresh.expires_at,
        )
    )
    access_token = issue_access_token(
        str(user.id),
        str(user.workspace_id),
        user.role,
        settings=settings,
    )
    response.set_cookie(
        REFRESH_COOKIE_NAME,
        refresh.raw_token,
        max_age=settings.jwt_refresh_ttl_days * 24 * 60 * 60,
        httponly=True,
        secure=True,
        samesite="strict",
    )
    return AuthTokens(
        access_token=access_token,
        expires_in=settings.jwt_access_ttl_seconds,
    )


async def _load_refresh_token(
    session: AsyncSession,
    raw_token: str,
) -> tuple[RefreshToken, str]:
    try:
        token_id, secret = parse_refresh_token(raw_token)
    except TokenError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token") from exc

    token_row = await session.scalar(select(RefreshToken).where(RefreshToken.id == token_id))
    now = datetime.now(UTC)
    if token_row is None or not refresh_token_is_active(
        expires_at=token_row.expires_at,
        revoked_at=token_row.revoked_at,
        now=now,
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="expired refresh token")

    is_valid = await asyncio.to_thread(verify_refresh_secret, secret, token_row.token_hash)
    if not is_valid:
        await session.execute(
            update(RefreshToken).where(RefreshToken.id == token_row.id).values(revoked_at=now)
        )
        user = await session.scalar(select(User).where(User.id == token_row.user_id))
        if user is not None:
            await write_event(
                session=session,
                workspace_id=user.workspace_id,
                actor_type="user",
                actor_id=str(user.id),
                actor_email=user.email,
                action="auth.refresh_rejected",
                category="auth",
                resource_type="refresh_token",
                resource_id=str(token_row.id),
                before_state={"revoked": False},
                after_state={"revoked": True},
                metadata={"reason": "invalid_secret"},
            )
        await session.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="invalid refresh token")

    return token_row, secret
