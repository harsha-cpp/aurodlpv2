"""Extension enrollment token issuance and verification."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass
from uuid import UUID

from aurodlpv2_backend.utils.uuid import uuid7

TOKEN_PREFIX = "auro_ext"
TOKEN_SEPARATOR = "."


class ExtensionTokenError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class IssuedExtensionToken:
    client_id: UUID
    raw_token: str
    token_hash: bytes


def issue_extension_token() -> IssuedExtensionToken:
    client_id = uuid7()
    secret = secrets.token_urlsafe(48)
    raw_token = f"{TOKEN_PREFIX}_{client_id}{TOKEN_SEPARATOR}{secret}"
    return IssuedExtensionToken(
        client_id=client_id,
        raw_token=raw_token,
        token_hash=_digest(secret),
    )


def parse_extension_token(raw_token: str) -> tuple[UUID, str]:
    token_id, separator, secret = raw_token.strip().partition(TOKEN_SEPARATOR)
    expected_prefix = f"{TOKEN_PREFIX}_"
    if not separator or not secret or not token_id.startswith(expected_prefix):
        raise ExtensionTokenError("invalid extension token")
    try:
        return UUID(token_id.removeprefix(expected_prefix)), secret
    except ValueError as exc:
        raise ExtensionTokenError("invalid extension token") from exc


def verify_extension_secret(secret: str, token_hash: bytes) -> bool:
    return hmac.compare_digest(_digest(secret), token_hash)


def _digest(secret: str) -> bytes:
    return hashlib.sha256(secret.encode("utf-8")).digest()
