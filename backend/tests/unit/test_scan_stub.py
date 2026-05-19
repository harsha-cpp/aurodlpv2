from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from medshield_detection.models import Entity, ScanResult

from medshield_backend.db.models import Scan
from medshield_backend.scan.service import (
    combined_verdict_from_scans,
    should_deep_scan,
    stub_verdict,
    verdict_from_detection,
    verdict_from_scan,
)


@pytest.mark.unit
def test_stub_verdict_allows_with_unknown_recipients() -> None:
    verdict = stub_verdict(
        scan_id="018f2f2a-0000-7000-8000-000000000003",
        recipients=["patient@example.com"],
    )

    assert verdict.action == "allow"
    assert verdict.severity == "none"
    assert verdict.risk_score == 0.0
    assert verdict.recipients[0].classification == "unknown"


@pytest.mark.unit
def test_verdict_from_detection_warns_on_medium_signal() -> None:
    detected_at = datetime.now(UTC)
    verdict = verdict_from_detection(
        scan_id="018f2f2a-0000-7000-8000-000000000004",
        recipients=["patient@example.com"],
        detection=ScanResult(
            entities=[
                Entity(
                    type="ABHA",
                    masked_value="**************1234",
                    confidence=0.9,
                    source="body",
                )
            ],
            severity="medium",
            risk_score=10.0,
            duration_ms=12,
            completed_at=detected_at,
        ),
    )

    assert verdict.action == "warn"
    assert verdict.entities[0].type == "ABHA"
    assert verdict.created_at == detected_at


@pytest.mark.unit
def test_verdict_from_scan_preserves_stored_decision_and_entities() -> None:
    detected_at = datetime.now(UTC)
    policy_id = UUID("018f2f2a-0000-7000-8000-000000000011")
    scan = Scan(
        id=UUID("018f2f2a-0000-7000-8000-000000000012"),
        workspace_id=UUID("018f2f2a-0000-7000-8000-000000000013"),
        status="completed",
        decision="block",
        severity="critical",
        score=Decimal("8.50"),
        matched_policies=[policy_id],
        entities_summary={
            "entities": [
                {
                    "type": "IN_AADHAAR",
                    "masked_value": "****-****-9012",
                    "source": "body",
                    "confidence": 0.95,
                }
            ]
        },
        completed_at=detected_at,
    )

    verdict = verdict_from_scan(scan)

    assert verdict.action == "block"
    assert verdict.severity == "critical"
    assert verdict.risk_score == 8.5
    assert verdict.matched_policy_ids == [str(policy_id)]
    assert verdict.entities[0].type == "IN_AADHAAR"
    assert verdict.created_at == detected_at


@pytest.mark.unit
def test_combined_verdict_does_not_downgrade_primary_scan_decision() -> None:
    detected_at = datetime.now(UTC)
    primary_scan = Scan(
        id=UUID("018f2f2a-0000-7000-8000-000000000014"),
        workspace_id=UUID("018f2f2a-0000-7000-8000-000000000015"),
        status="completed",
        decision="quarantine",
        severity="high",
        score=Decimal("7.00"),
        matched_policies=[],
        entities_summary={"entities": []},
        completed_at=detected_at,
    )
    attachment_scan = Scan(
        id=UUID("018f2f2a-0000-7000-8000-000000000016"),
        workspace_id=UUID("018f2f2a-0000-7000-8000-000000000015"),
        status="completed",
        decision="allow",
        severity="none",
        score=Decimal("0.00"),
        matched_policies=[],
        entities_summary={"entities": []},
        completed_at=detected_at,
    )

    verdict = combined_verdict_from_scans(primary_scan, [attachment_scan])

    assert verdict.action == "quarantine"
    assert verdict.severity == "high"
    assert verdict.risk_score == 7.0


@pytest.mark.unit
def test_should_deep_scan_large_or_image_attachment() -> None:
    assert should_deep_scan(
        size_bytes=1_000_000,
        threshold_bytes=1_000_000,
        mime_type="application/pdf",
    )
    assert should_deep_scan(
        size_bytes=10,
        threshold_bytes=1_000_000,
        mime_type="image/png",
    )
    assert not should_deep_scan(
        size_bytes=10,
        threshold_bytes=1_000_000,
        mime_type="text/plain",
    )
