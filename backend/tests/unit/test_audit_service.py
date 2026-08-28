from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from aurodlpv2_backend.audit.service import build_event_hash


@pytest.mark.unit
def test_audit_event_hash_is_stable_for_same_payload() -> None:
    org_id = uuid4()
    created_at = datetime(2026, 6, 5, 12, 0, tzinfo=UTC)
    first = build_event_hash(
        org_id=org_id,
        actor="member:analyst@example.com",
        category="quarantine",
        action="approved",
        metadata={"quarantine_id": "q-1", "risk_score": 91.2},
        previous_hash="abc123",
        created_at=created_at,
    )
    second = build_event_hash(
        org_id=org_id,
        actor="member:analyst@example.com",
        category="quarantine",
        action="approved",
        metadata={"quarantine_id": "q-1", "risk_score": 91.2},
        previous_hash="abc123",
        created_at=created_at,
    )

    assert first == second


@pytest.mark.unit
def test_audit_event_hash_changes_with_previous_hash() -> None:
    org_id = uuid4()
    created_at = datetime(2026, 6, 5, 12, 0, tzinfo=UTC)

    first = build_event_hash(
        org_id=org_id,
        actor="extension:sender@example.com",
        category="scan",
        action="quarantine",
        metadata={"scan_id": "scan-1"},
        previous_hash=None,
        created_at=created_at,
    )
    second = build_event_hash(
        org_id=org_id,
        actor="extension:sender@example.com",
        category="scan",
        action="quarantine",
        metadata={"scan_id": "scan-1"},
        previous_hash="root",
        created_at=created_at,
    )

    assert first != second
