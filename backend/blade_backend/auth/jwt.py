from __future__ import annotations

import secrets
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from argon2.low_level import Type

from blade_backend.db.models import MemberRole
from blade_backend.settings import Settings, get_settings
from blade_backend.utils.uuid import uuid7

TOKEN_TYPE = "access"
REFRESH_SEPARATOR = "."
_REFRESH_HASHER = PasswordHasher(type=Type.ID)
JwtDecoder = Callable[..., Mapping[object, object]]


class TokenError(ValueError):
    pass


class TokenExpiredError(TokenError):
    pass


@dataclass(frozen=True, slots=True)
class AccessClaims:
    sub: str
    workspace_id: str
    role: MemberRole
    exp: int

    @property
    def org_id(self) -> str:
        return self.workspace_id


@dataclass(frozen=True, slots=True)
class IssuedRefreshToken:
    id: UUID
    raw_token: str
    token_hash: bytes
    expires_at: datetime


def issue_access_token(
    user_id: str,
    workspace_id: str,
    role: MemberRole,
    *,
    settings: Settings | None = None,
    now: datetime | None = None,
) -> str:
    resolved_settings = settings or get_settings()
    issued_at = now or datetime.now(UTC)
    expires_at = issued_at + timedelta(seconds=resolved_settings.jwt_access_ttl_seconds)
    payload: dict[str, object] = {
        "sub": user_id,
        "workspace_id": workspace_id,
        "org_id": workspace_id,
        "role": role,
        "type": TOKEN_TYPE,
        "iat": int(issued_at.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    return jwt.encode(
        payload,
        resolved_settings.jwt_secret_value,
        algorithm=resolved_settings.jwt_algorithm,
    )


def decode_access_token(token: str, *, settings: Settings | None = None) -> AccessClaims:
    resolved_settings = settings or get_settings()
    try:
        decoder = cast(JwtDecoder, jwt.decode)
        decoded = decoder(
            token,
            resolved_settings.jwt_secret_value,
            algorithms=[resolved_settings.jwt_algorithm],
            options={"require": ["exp", "sub", "role", "type"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise TokenExpiredError("access token expired") from exc
    except jwt.InvalidTokenError as exc:
        raise TokenError("invalid access token") from exc

    payload = _string_key_dict(decoded)
    if payload.get("type") != TOKEN_TYPE:
        raise TokenError("invalid token type")

    role = _role_claim(payload.get("role"))
    return AccessClaims(
        sub=_str_claim(payload, "sub"),
        workspace_id=_str_claim(payload, "org_id", fallback_key="workspace_id"),
        role=role,
        exp=_int_claim(payload, "exp"),
    )


def issue_refresh_token(
    *,
    ttl_days: int,
    now: datetime | None = None,
) -> IssuedRefreshToken:
    token_id = uuid7()
    secret = secrets.token_urlsafe(48)
    raw_token = f"{token_id}{REFRESH_SEPARATOR}{secret}"
    token_hash = _REFRESH_HASHER.hash(secret).encode("utf-8")
    issued_at = now or datetime.now(UTC)
    return IssuedRefreshToken(
        id=token_id,
        raw_token=raw_token,
        token_hash=token_hash,
        expires_at=issued_at + timedelta(days=ttl_days),
    )


def parse_refresh_token(raw_token: str) -> tuple[UUID, str]:
    token_id, separator, secret = raw_token.partition(REFRESH_SEPARATOR)
    if not separator or not secret:
        raise TokenError("invalid refresh token")
    try:
        return UUID(token_id), secret
    except ValueError as exc:
        raise TokenError("invalid refresh token") from exc


def verify_refresh_secret(secret: str, token_hash: bytes) -> bool:
    try:
        return _REFRESH_HASHER.verify(token_hash.decode("utf-8"), secret)
    except (UnicodeDecodeError, VerificationError, VerifyMismatchError):
        return False


def refresh_token_is_active(
    *,
    expires_at: datetime,
    revoked_at: datetime | None,
    now: datetime | None = None,
) -> bool:
    checked_at = now or datetime.now(UTC)
    return revoked_at is None and expires_at > checked_at


def _string_key_dict(payload: Mapping[object, object]) -> dict[str, object]:
    return {key: value for key, value in payload.items() if isinstance(key, str)}


def _str_claim(payload: dict[str, object], key: str, *, fallback_key: str | None = None) -> str:
    value = payload.get(key)
    if value is None and fallback_key is not None:
        value = payload.get(fallback_key)
    if not isinstance(value, str) or not value:
        raise TokenError(f"missing {key} claim")
    return value


def _int_claim(payload: dict[str, object], key: str) -> int:
    value = payload.get(key)
    if not isinstance(value, int):
        raise TokenError(f"missing {key} claim")
    return value


def _role_claim(value: object) -> MemberRole:
    if value in {"owner", "admin", "analyst", "viewer"}:
        return cast(MemberRole, value)
    raise TokenError("invalid role claim")
