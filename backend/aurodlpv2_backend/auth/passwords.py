from __future__ import annotations

import re

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, VerifyMismatchError
from argon2.low_level import Type

from aurodlpv2_backend.auth.common_passwords import COMMON_PASSWORDS

MIN_PASSWORD_LENGTH = 12
MAX_PASSWORD_LENGTH = 128
_MIN_LOCAL_PART_LENGTH = 3
_MIN_STEM_LENGTH = 4
_MIN_DISTINCT_CHARS = 5
_NON_ALNUM = re.compile(r"[^a-z0-9]+")
_EDGE_DIGITS = re.compile(r"^\d+|\d+$")

_PASSWORD_HASHER = PasswordHasher(type=Type.ID)


class PasswordPolicyError(ValueError):
    pass


def hash_password(plain: str) -> bytes:
    return _PASSWORD_HASHER.hash(plain).encode("utf-8")


def verify_password(plain: str, hashed: bytes) -> bool:
    try:
        return _PASSWORD_HASHER.verify(hashed.decode("utf-8"), plain)
    except (UnicodeDecodeError, VerificationError, VerifyMismatchError):
        return False


def validate_password(password: str, *, email: str | None = None) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"password must be at least {MIN_PASSWORD_LENGTH} characters")
    if len(password) > MAX_PASSWORD_LENGTH:
        raise PasswordPolicyError(f"password must be at most {MAX_PASSWORD_LENGTH} characters")

    if len(set(password)) < _MIN_DISTINCT_CHARS:
        raise PasswordPolicyError("password repeats too few characters")
    if password.isdigit():
        raise PasswordPolicyError("password must not be only digits")

    lowered = password.lower()
    collapsed = _NON_ALNUM.sub("", lowered)
    stem = _EDGE_DIGITS.sub("", collapsed)
    for candidate, minimum in ((lowered, 1), (collapsed, 1), (stem, _MIN_STEM_LENGTH)):
        if len(candidate) >= minimum and candidate in COMMON_PASSWORDS:
            raise PasswordPolicyError("password is too common, choose something less guessable")

    if email:
        local_part = email.split("@", 1)[0].strip().lower()
        if len(local_part) >= _MIN_LOCAL_PART_LENGTH and local_part in lowered:
            raise PasswordPolicyError("password must not contain your email address")
