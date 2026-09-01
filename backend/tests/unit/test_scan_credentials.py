from __future__ import annotations

from typing import Any
from uuid import uuid4

import pytest

from blade_backend.policy.store import parse_policy_set
from blade_backend.scan.credentials import ScanPrincipal
from blade_backend.scan.limits import MAX_TRACKED_KEYS, CredentialRateLimiter


def _device(email: str = "doctor@hospital.in") -> ScanPrincipal:
    return ScanPrincipal(
        org_id=uuid4(),
        kind="device",
        member_id=uuid4(),
        email=email,
    )


def _org_code() -> ScanPrincipal:
    return ScanPrincipal(org_id=uuid4(), kind="org_code")


@pytest.mark.unit
def test_device_principal_is_identified() -> None:
    assert _device().is_identified is True


@pytest.mark.unit
def test_org_code_principal_is_not_identified() -> None:
    assert _org_code().is_identified is False


@pytest.mark.unit
def test_verified_identity_wins_over_the_clients_claim() -> None:
    principal = _device("real@hospital.in")
    assert principal.actor("spoofed@elsewhere.in") == "device:real@hospital.in"


@pytest.mark.unit
def test_claimed_identity_is_labelled_unverified() -> None:
    assert _org_code().actor("claimed@hospital.in") == "extension-unverified:claimed@hospital.in"


@pytest.mark.unit
def test_missing_identity_is_not_dressed_up() -> None:
    assert _org_code().actor(None) == "extension-unverified:unknown"


@pytest.mark.unit
def test_limiter_allows_up_to_the_limit_then_rejects() -> None:
    limiter = CredentialRateLimiter()
    for _ in range(3):
        limiter.check("k", limit=3, window_seconds=60)
    with pytest.raises(Exception, match="rate limit"):
        limiter.check("k", limit=3, window_seconds=60)


@pytest.mark.unit
def test_limiter_keys_are_independent() -> None:
    limiter = CredentialRateLimiter()
    limiter.check("a", limit=1, window_seconds=60)
    limiter.check("b", limit=1, window_seconds=60)
    with pytest.raises(Exception, match="rate limit"):
        limiter.check("a", limit=1, window_seconds=60)


@pytest.mark.unit
def test_limiter_bounds_its_memory() -> None:
    limiter = CredentialRateLimiter()
    for index in range(MAX_TRACKED_KEYS + 500):
        limiter.check(f"key-{index}", limit=10, window_seconds=60)
    assert limiter.tracked_keys() <= MAX_TRACKED_KEYS


@pytest.mark.unit
def test_invalid_stored_policy_falls_back_rather_than_crashing_every_scan() -> None:
    broken: dict[str, Any] = {"rules": [{"nonsense": True}]}
    assert parse_policy_set(broken) is None
    assert parse_policy_set("not a dict") is None
    assert parse_policy_set(None) is None


@pytest.mark.unit
def test_valid_stored_policy_round_trips() -> None:
    blob: dict[str, Any] = {
        "version": "custom",
        "rules": [
            {
                "id": "block-all",
                "enabled": True,
                "order": 1,
                "conditions": {},
                "action": "block",
            }
        ],
    }
    parsed = parse_policy_set(blob)
    assert parsed is not None
    assert parsed.rules[0].id == "block-all"
