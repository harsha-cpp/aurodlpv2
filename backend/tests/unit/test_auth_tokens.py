from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import SecretStr

from medshield_backend.auth.jwt import (
    TokenExpiredError,
    decode_access_token,
    issue_access_token,
    issue_refresh_token,
    parse_refresh_token,
    refresh_token_is_active,
    verify_refresh_secret,
)
from medshield_backend.settings import Settings


@pytest.mark.unit
def test_access_token_round_trip() -> None:
    settings = Settings(
        jwt_secret=SecretStr("test-secret-that-is-long-enough-for-hs256"),
        jwt_access_ttl_seconds=60,
    )

    token = issue_access_token(
        "018f2f2a-0000-7000-8000-000000000001",
        "018f2f2a-0000-7000-8000-000000000002",
        "admin",
        settings=settings,
    )
    claims = decode_access_token(token, settings=settings)

    assert claims.sub == "018f2f2a-0000-7000-8000-000000000001"
    assert claims.workspace_id == "018f2f2a-0000-7000-8000-000000000002"
    assert claims.role == "admin"


@pytest.mark.unit
def test_expired_access_token_rejected() -> None:
    settings = Settings(
        jwt_secret=SecretStr("test-secret-that-is-long-enough-for-hs256"),
        jwt_access_ttl_seconds=-1,
    )
    token = issue_access_token(
        "018f2f2a-0000-7000-8000-000000000001",
        "018f2f2a-0000-7000-8000-000000000002",
        "user",
        settings=settings,
        now=datetime.now(UTC) - timedelta(minutes=5),
    )

    with pytest.raises(TokenExpiredError):
        decode_access_token(token, settings=settings)


@pytest.mark.unit
def test_refresh_token_hash_verifies_secret() -> None:
    issued = issue_refresh_token(ttl_days=30)
    _token_id, secret = parse_refresh_token(issued.raw_token)

    assert verify_refresh_secret(secret, issued.token_hash)


@pytest.mark.unit
def test_expired_refresh_token_inactive() -> None:
    now = datetime.now(UTC)

    assert not refresh_token_is_active(
        expires_at=now - timedelta(seconds=1),
        revoked_at=None,
        now=now,
    )
