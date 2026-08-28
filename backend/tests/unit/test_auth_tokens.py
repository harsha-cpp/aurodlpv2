from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest

from aurodlpv2_backend.auth.tokens import (
    DEVICE_TOKEN_PREFIX,
    PASSWORD_RESET_PREFIX,
    TokenFormatError,
    issue_token,
    parse_token,
    verify_token_secret,
)


@pytest.mark.unit
def test_issued_token_parses_back_to_its_id_and_secret() -> None:
    issued = issue_token(DEVICE_TOKEN_PREFIX, ttl=timedelta(days=1))

    token_id, secret = parse_token(DEVICE_TOKEN_PREFIX, issued.raw_token)

    assert token_id == issued.id
    assert verify_token_secret(secret, issued.token_hash) is True


@pytest.mark.unit
def test_raw_token_is_prefixed_and_the_hash_does_not_contain_it() -> None:
    issued = issue_token(DEVICE_TOKEN_PREFIX, ttl=timedelta(days=1))

    assert issued.raw_token.startswith("aurodev_")
    # Only the hash reaches the database; a dump must not yield the secret.
    assert issued.raw_token.encode("utf-8") not in issued.token_hash


@pytest.mark.unit
def test_token_of_one_kind_is_not_accepted_as_another() -> None:
    issued = issue_token(PASSWORD_RESET_PREFIX, ttl=timedelta(hours=1))

    with pytest.raises(TokenFormatError):
        parse_token(DEVICE_TOKEN_PREFIX, issued.raw_token)


@pytest.mark.unit
@pytest.mark.parametrize("raw", ["aurodev_", "aurodev_notauuid.secret", "aurodev_abc"])
def test_malformed_tokens_are_rejected(raw: str) -> None:
    with pytest.raises(TokenFormatError):
        parse_token(DEVICE_TOKEN_PREFIX, raw)


@pytest.mark.unit
def test_tampered_secret_fails_verification() -> None:
    issued = issue_token(DEVICE_TOKEN_PREFIX, ttl=timedelta(days=1))
    _, secret = parse_token(DEVICE_TOKEN_PREFIX, issued.raw_token)

    assert verify_token_secret(secret[:-1] + "x", issued.token_hash) is False


@pytest.mark.unit
def test_expiry_is_measured_from_the_issue_time() -> None:
    issued_at = datetime(2026, 6, 10, 9, 0, tzinfo=UTC)

    issued = issue_token(DEVICE_TOKEN_PREFIX, ttl=timedelta(days=365), now=issued_at)

    assert issued.expires_at == issued_at + timedelta(days=365)
