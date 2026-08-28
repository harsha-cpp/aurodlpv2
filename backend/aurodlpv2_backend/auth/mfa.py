"""TOTP second factor: secret storage, code checks, and the login challenge."""

from __future__ import annotations

import hashlib
import hmac
import os
import secrets
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import cast
from uuid import UUID

import jwt
import pyotp
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from aurodlpv2_backend.settings import Settings, get_settings

CHALLENGE_TOKEN_TYPE = "mfa_challenge"
#: Long enough to open an authenticator app, short enough that a challenge
#: token lifted from a browser log is useless by the time it is read.
CHALLENGE_TTL_SECONDS = 300
BACKUP_CODE_COUNT = 10
_BACKUP_CODE_BYTES = 5
_NONCE_BYTES = 12
#: One step either side, so a workstation clock a few seconds off still works.
_TOTP_VALID_WINDOW = 1


class MfaError(ValueError):
    """The submitted second factor could not be accepted."""


@dataclass(frozen=True, slots=True)
class MfaChallenge:
    member_id: UUID
    org_id: UUID


def generate_secret() -> str:
    return pyotp.random_base32()


def provisioning_uri(secret: str, *, email: str, issuer: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(  # pyright: ignore[reportUnknownMemberType]
        name=email, issuer_name=issuer
    )


def verify_totp(secret: str, code: str) -> bool:
    cleaned = code.strip().replace(" ", "")
    if not cleaned.isdigit():
        return False
    return pyotp.TOTP(secret).verify(cleaned, valid_window=_TOTP_VALID_WINDOW)


def _encryption_key(settings: Settings) -> bytes:
    # AES-GCM needs exactly 32 bytes; the configured value is an arbitrary
    # passphrase, so widen it deterministically rather than demanding a
    # correctly sized key in the environment.
    return hashlib.sha256(settings.mfa_encryption_key_value.encode("utf-8")).digest()


def encrypt_secret(secret: str, *, settings: Settings | None = None) -> bytes:
    resolved = settings or get_settings()
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = AESGCM(_encryption_key(resolved)).encrypt(nonce, secret.encode("utf-8"), None)
    return nonce + ciphertext


def decrypt_secret(blob: bytes, *, settings: Settings | None = None) -> str:
    resolved = settings or get_settings()
    if len(blob) <= _NONCE_BYTES:
        raise MfaError("stored mfa secret is unreadable")
    try:
        plaintext = AESGCM(_encryption_key(resolved)).decrypt(
            blob[:_NONCE_BYTES], blob[_NONCE_BYTES:], None
        )
    except InvalidTag as exc:
        # Wrong key, or the row was tampered with. Either way the member must
        # re-enrol; a silent failure here would lock them out with no signal.
        raise MfaError("stored mfa secret is unreadable") from exc
    return plaintext.decode("utf-8")


def generate_backup_codes(count: int = BACKUP_CODE_COUNT) -> list[str]:
    return [secrets.token_hex(_BACKUP_CODE_BYTES) for _ in range(count)]


def hash_backup_code(code: str) -> str:
    # SHA-256 rather than argon2: these are full-entropy random codes, so there
    # is no guessable plaintext for a slow hash to protect.
    return hashlib.sha256(_normalize_backup_code(code).encode("utf-8")).hexdigest()


def consume_backup_code(hashed_codes: Sequence[str], submitted: str) -> list[str] | None:
    """Return the remaining hashes once a code is spent, or None if it is wrong.

    Compared in constant time and removed on use, so a backup code written on a
    sticky note cannot be replayed after it has been used once.
    """
    candidate = hash_backup_code(submitted)
    for index, stored in enumerate(hashed_codes):
        if hmac.compare_digest(stored, candidate):
            return [*hashed_codes[:index], *hashed_codes[index + 1 :]]
    return None


def _normalize_backup_code(code: str) -> str:
    return code.strip().replace("-", "").replace(" ", "").lower()


def issue_challenge_token(
    member_id: UUID,
    org_id: UUID,
    *,
    settings: Settings | None = None,
    now: datetime | None = None,
) -> str:
    """Short-lived proof that the password step already passed.

    Returned instead of a session so the password and the code are never both
    required in one request — the client can prompt for the code without
    holding the password in memory.
    """
    resolved = settings or get_settings()
    issued_at = now or datetime.now(UTC)
    payload: dict[str, object] = {
        "sub": str(member_id),
        "org_id": str(org_id),
        "type": CHALLENGE_TOKEN_TYPE,
        "iat": int(issued_at.timestamp()),
        "exp": int((issued_at + timedelta(seconds=CHALLENGE_TTL_SECONDS)).timestamp()),
    }
    return jwt.encode(payload, resolved.jwt_secret_value, algorithm=resolved.jwt_algorithm)


def decode_challenge_token(token: str, *, settings: Settings | None = None) -> MfaChallenge:
    resolved = settings or get_settings()
    try:
        decoded = cast(
            Mapping[str, object],
            jwt.decode(  # pyright: ignore[reportUnknownMemberType]
                token,
                resolved.jwt_secret_value,
                algorithms=[resolved.jwt_algorithm],
                options={"require": ["exp", "sub", "type"]},
            ),
        )
    except jwt.InvalidTokenError as exc:
        raise MfaError("invalid mfa challenge") from exc
    if decoded.get("type") != CHALLENGE_TOKEN_TYPE:
        raise MfaError("invalid mfa challenge")
    subject = decoded.get("sub")
    org = decoded.get("org_id")
    if not isinstance(subject, str) or not isinstance(org, str):
        raise MfaError("invalid mfa challenge")
    try:
        return MfaChallenge(member_id=UUID(subject), org_id=UUID(org))
    except ValueError as exc:
        raise MfaError("invalid mfa challenge") from exc
