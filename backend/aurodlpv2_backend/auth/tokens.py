from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from argon2.low_level import Type

from aurodlpv2_backend.utils.uuid import uuid7

DEVICE_TOKEN_PREFIX = "aurodev"
PASSWORD_RESET_PREFIX = "auroreset"
EMAIL_VERIFY_PREFIX = "auroverify"

_SEPARATOR = "."
_SECRET_BYTES = 48
_HASHER = PasswordHasher(type=Type.ID)


class TokenFormatError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class IssuedToken:
    id: UUID
    raw_token: str
    token_hash: bytes
    expires_at: datetime


def issue_token(prefix: str, *, ttl: timedelta, now: datetime | None = None) -> IssuedToken:
    token_id = uuid7()
    secret = secrets.token_urlsafe(_SECRET_BYTES)
    issued_at = now or datetime.now(UTC)
    return IssuedToken(
        id=token_id,
        raw_token=f"{prefix}_{token_id}{_SEPARATOR}{secret}",
        token_hash=_HASHER.hash(secret).encode("utf-8"),
        expires_at=issued_at + ttl,
    )


def parse_token(prefix: str, raw_token: str) -> tuple[UUID, str]:
    expected_prefix = f"{prefix}_"
    if not raw_token.startswith(expected_prefix):
        raise TokenFormatError("unexpected token prefix")
    body = raw_token[len(expected_prefix) :]
    token_id, separator, secret = body.partition(_SEPARATOR)
    if not separator or not secret:
        raise TokenFormatError("malformed token")
    try:
        return UUID(token_id), secret
    except ValueError as exc:
        raise TokenFormatError("malformed token") from exc


def verify_token_secret(secret: str, token_hash: bytes) -> bool:
    try:
        return _HASHER.verify(token_hash.decode("utf-8"), secret)
    except (UnicodeDecodeError, VerificationError, VerifyMismatchError):
        return False


def hash_token_secret(secret: str) -> bytes:
    return _HASHER.hash(secret).encode("utf-8")
