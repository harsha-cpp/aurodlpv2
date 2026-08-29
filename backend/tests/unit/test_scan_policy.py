# pyright: reportPrivateUsage=false

from __future__ import annotations

import pytest

from aurodlpv2_backend.scan.api import (
    EntityHit,
    RecipientHit,
    _is_deep_scan_candidate,
    _policy_decision,
)


def _entity(entity_type: str = "IN_AADHAAR", masked: str = "********7460") -> EntityHit:
    return EntityHit(type=entity_type, masked_value=masked, confidence=0.98, source="body")


@pytest.mark.unit
def test_policy_blocks_blocked_recipient_domain() -> None:
    decision = _policy_decision(
        entities=[_entity()],
        recipients=[RecipientHit(email="external@example.com", classification="blocked")],
        detected_severity="medium",
        detected_risk_score=55,
    )

    assert decision.action == "block"
    assert decision.severity == "high"
    assert "blocked-recipient-domain" in decision.matched_policy_ids


@pytest.mark.unit
def test_policy_allows_phi_to_approved_recipients() -> None:
    decision = _policy_decision(
        entities=[_entity("MRN", "***4518")],
        recipients=[RecipientHit(email="care@partner.example", classification="approved_partner")],
        detected_severity="medium",
        detected_risk_score=52.5,
    )

    assert decision.action == "allow"
    assert decision.matched_policy_ids == ["approved-recipients-phi"]


@pytest.mark.unit
def test_policy_quarantines_high_risk_phi_to_public_email() -> None:
    decision = _policy_decision(
        entities=[_entity("IN_PAN", "HK****75Q")],
        recipients=[RecipientHit(email="person@gmail.com", classification="public_email")],
        detected_severity="high",
        detected_risk_score=71.3,
    )

    assert decision.action == "quarantine"
    assert decision.matched_policy_ids == ["high-risk-phi-to-public-email"]


@pytest.mark.unit
def test_reported_risk_is_the_detected_risk_not_an_invented_floor() -> None:
    decision = _policy_decision(
        entities=[_entity()],
        recipients=[RecipientHit(email="person@gmail.com", classification="public_email")],
        detected_severity="high",
        detected_risk_score=71.3,
    )

    assert abs(decision.risk_score - 71.3) < 0.01


@pytest.mark.unit
def test_sender_from_an_unapproved_account_is_blocked() -> None:
    decision = _policy_decision(
        entities=[_entity("MRN", "***4518")],
        recipients=[RecipientHit(email="colleague@hospital.in", classification="internal")],
        detected_severity="medium",
        detected_risk_score=52.5,
        sender_class="public_email",
    )

    assert decision.action == "block"
    assert decision.matched_policy_ids == ["unapproved-sender-with-phi"]


@pytest.mark.unit
def test_clean_message_from_any_sender_is_allowed() -> None:
    decision = _policy_decision(
        entities=[],
        recipients=[RecipientHit(email="person@gmail.com", classification="public_email")],
        detected_severity="none",
        detected_risk_score=0,
        sender_class="public_email",
    )

    assert decision.action == "allow"


@pytest.mark.unit
def test_attachment_deep_scan_candidates_include_large_files_and_images() -> None:
    assert _is_deep_scan_candidate("scan.jpg", "image/jpeg", 42)
    assert _is_deep_scan_candidate("report.pdf", "application/pdf", 20 * 1024 * 1024)
    assert not _is_deep_scan_candidate("notes.txt", "text/plain", 1024)
