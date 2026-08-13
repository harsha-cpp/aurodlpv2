# pyright: reportPrivateUsage=false

from __future__ import annotations

from datetime import UTC, datetime
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException, UploadFile
from pydantic import ValidationError

import aurodlpv2_backend.scan.api as scan_api
from aurodlpv2_backend.scan.api import (
    EntityHit,
    RecipientHit,
    ScanFinalizeRequest,
    _attachment_matches_upload,
    _content_digest,
    _finalize_verdict,
    _is_deep_scan_candidate,
    _load_attachment_rows,
    _policy_decision,
    _read_bounded_upload,
    _record_scan_event,
)


def _entity(entity_type: str = "IN_AADHAAR") -> EntityHit:
    return EntityHit(
        type=entity_type,
        masked_value="XXXXXXXX1234",
        confidence=0.98,
        source="body",
    )


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
        entities=[_entity("MRN")],
        recipients=[RecipientHit(email="care@partner.example", classification="approved_partner")],
        detected_severity="medium",
        detected_risk_score=45,
    )

    assert decision.action == "allow"
    assert decision.matched_policy_ids == ["approved-recipient-phi"]


@pytest.mark.unit
def test_policy_quarantines_high_risk_phi_to_external_recipient() -> None:
    decision = _policy_decision(
        entities=[_entity("IN_PAN")],
        recipients=[RecipientHit(email="person@gmail.com", classification="public_email")],
        detected_severity="high",
        detected_risk_score=82,
    )

    assert decision.action == "quarantine"
    assert decision.risk_score >= 85
    assert decision.matched_policy_ids == ["external-high-risk-phi-quarantine"]


@pytest.mark.unit
def test_attachment_deep_scan_candidates_include_large_files_and_images() -> None:
    assert _is_deep_scan_candidate("scan.jpg", "image/jpeg", 42)
    assert _is_deep_scan_candidate("report.pdf", "application/pdf", 20 * 1024 * 1024)
    assert not _is_deep_scan_candidate("notes.txt", "text/plain", 1024)


def _attachment_row(
    *,
    row_id: UUID | None = None,
    org_id: UUID | None = None,
    client_scan_id: str = "scan-a",
    status: str = "scanned",
    sha256: str = "a" * 64,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=row_id or uuid4(),
        org_id=org_id or uuid4(),
        client_scan_id=client_scan_id,
        attachment_id="attachment-1",
        filename="record.pdf",
        mime_type="application/pdf",
        size_bytes=42,
        sha256=sha256,
        status=status,
        severity="none",
        risk_score=0,
        entities=[],
    )


class _ScalarRows:
    def __init__(self, rows: list[object]) -> None:
        self._rows = rows

    def all(self) -> list[object]:
        return self._rows


class _FinalizeSession:
    def __init__(self, scalar_result: object | None = None) -> None:
        self.scalar_result = scalar_result

    async def scalar(self, _statement: object) -> object | None:
        return self.scalar_result


class _AttachmentSession:
    def __init__(self, rows: list[object]) -> None:
        self.rows = rows

    async def scalars(self, _statement: object) -> _ScalarRows:
        return _ScalarRows(self.rows)


@pytest.mark.unit
def test_finalize_request_rejects_duplicate_attachment_scan_ids() -> None:
    scan_id = uuid4()
    with pytest.raises(ValidationError):
        ScanFinalizeRequest(
            org_code="AUR-TEST",
            client_scan_id="scan-a",
            recipients=[],
            attachment_scan_ids=[scan_id, scan_id],
        )


@pytest.mark.unit
def test_content_digest_is_order_independent_but_content_sensitive() -> None:
    first = _attachment_row(sha256="a" * 64)
    second = _attachment_row(sha256="b" * 64)
    digest = _content_digest(
        sender="sender@example.com",
        subject="Subject",
        body="Body",
        recipients=["B@example.com", "a@example.com"],
        attachment_rows=[first, second],  # type: ignore[list-item]
    )

    assert digest == _content_digest(
        sender="sender@example.com",
        subject="Subject",
        body="Body",
        recipients=["a@example.com", "b@example.com"],
        attachment_rows=[second, first],  # type: ignore[list-item]
    )
    assert digest != _content_digest(
        sender="sender@example.com",
        subject="Subject",
        body="Changed",
        recipients=["a@example.com", "b@example.com"],
        attachment_rows=[first, second],  # type: ignore[list-item]
    )
    assert digest != _content_digest(
        sender="other@example.com",
        subject="Subject",
        body="Body",
        recipients=["a@example.com", "b@example.com"],
        attachment_rows=[first, second],  # type: ignore[list-item]
    )


@pytest.mark.unit
def test_attachment_upload_idempotency_is_bound_to_exact_content() -> None:
    row = _attachment_row()

    assert _attachment_matches_upload(
        row,  # type: ignore[arg-type]
        filename="record.pdf",
        mime_type="APPLICATION/PDF",
        size_bytes=42,
        sha256="a" * 64,
    )
    assert not _attachment_matches_upload(
        row,  # type: ignore[arg-type]
        filename="record.pdf",
        mime_type="application/pdf",
        size_bytes=42,
        sha256="b" * 64,
    )


@pytest.mark.unit
async def test_attachment_scan_cannot_be_reused_for_another_compose() -> None:
    org_id = uuid4()
    scan_id = uuid4()
    wrong_compose_row = _attachment_row(
        row_id=scan_id,
        org_id=org_id,
        client_scan_id="scan-b",
    )
    session = _AttachmentSession([wrong_compose_row])

    with pytest.raises(HTTPException) as exc_info:
        await _load_attachment_rows(
            session,  # type: ignore[arg-type]
            org_id=org_id,
            client_scan_id="scan-a",
            attachment_scan_ids=[scan_id],
        )

    assert exc_info.value.status_code == 404


@pytest.mark.unit
async def test_attachment_upload_reader_rejects_bytes_over_limit() -> None:
    accepted = UploadFile(file=BytesIO(b"1234"), filename="accepted.txt")
    assert await _read_bounded_upload(accepted, max_bytes=4) == b"1234"

    rejected = UploadFile(file=BytesIO(b"12345"), filename="rejected.txt")
    with pytest.raises(HTTPException) as exc_info:
        await _read_bounded_upload(rejected, max_bytes=4)

    assert exc_info.value.status_code == 413


@pytest.mark.unit
async def test_finalized_scan_id_cannot_be_replayed_with_new_content() -> None:
    session = _FinalizeSession(SimpleNamespace(id=uuid4()))
    with pytest.raises(HTTPException) as exc_info:
        await _record_scan_event(
            session,  # type: ignore[arg-type]
            org_id=uuid4(),
            client_event_id="scan-a",
            verdict=scan_api._unavailable_verdict(
                recipients=[],
                policy_id="detector-unavailable",
                user_message="blocked",
            ),
            user_email="sender@example.com",
            content_digest="a" * 64,
        )

    assert exc_info.value.status_code == 409


async def _stub_finalize_dependencies(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    classify = AsyncMock(
        return_value=[RecipientHit(email="outside@gmail.com", classification="public_email")]
    )
    record = AsyncMock(return_value=SimpleNamespace(id=uuid4()))
    monkeypatch.setattr(scan_api, "_classify_recipients", classify)
    monkeypatch.setattr(scan_api, "_record_scan_event", record)
    monkeypatch.setattr(scan_api, "write_audit_event", AsyncMock())
    return record


@pytest.mark.unit
async def test_finalize_blocks_when_an_attachment_scan_is_incomplete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    record = await _stub_finalize_dependencies(monkeypatch)
    detector = AsyncMock()
    monkeypatch.setattr(scan_api, "detect_email", detector)
    org = SimpleNamespace(id=uuid4())
    row = _attachment_row(org_id=org.id, status="failed")

    verdict = await _finalize_verdict(
        _FinalizeSession(),  # type: ignore[arg-type]
        org=org,  # type: ignore[arg-type]
        client_scan_id="scan-a",
        subject="",
        body="",
        recipients=["outside@gmail.com"],
        user_email="sender@example.com",
        attachment_rows=[row],  # type: ignore[list-item]
        audit_client_event_id="scan-a",
    )

    assert verdict.action == "block"
    assert verdict.degraded is True
    assert verdict.matched_policy_ids == ["attachment-scan-incomplete"]
    detector.assert_not_awaited()
    assert record.await_args is not None
    assert record.await_args.kwargs["content_digest"]


@pytest.mark.unit
async def test_finalize_blocks_when_detector_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    await _stub_finalize_dependencies(monkeypatch)

    def unavailable(_payload: object) -> None:
        raise RuntimeError("detector offline")

    monkeypatch.setattr(scan_api, "detect_email", unavailable)
    org = SimpleNamespace(id=uuid4())
    verdict = await _finalize_verdict(
        _FinalizeSession(),  # type: ignore[arg-type]
        org=org,  # type: ignore[arg-type]
        client_scan_id="scan-a",
        subject="",
        body="",
        recipients=["outside@gmail.com"],
        user_email="sender@example.com",
        attachment_rows=[],
        audit_client_event_id="scan-a",
    )

    assert verdict.action == "block"
    assert verdict.risk_score == 100
    assert verdict.matched_policy_ids == ["detector-unavailable"]


@pytest.mark.unit
async def test_approved_quarantine_release_is_content_bound_and_single_use(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _stub_finalize_dependencies(monkeypatch)

    def high_risk_detection(_payload: object) -> SimpleNamespace:
        return SimpleNamespace(
            entities=[
                {
                    "type": "IN_PAN",
                    "masked_value": "BN***8J",
                    "confidence": 0.99,
                    "source": "body",
                }
            ],
            severity="high",
            risk_score=90,
        )

    monkeypatch.setattr(scan_api, "detect_email", high_risk_detection)
    org = SimpleNamespace(id=uuid4())
    digest = _content_digest(
        sender="sender@example.com",
        subject="Protected",
        body="PAN BNZAA2318J",
        recipients=["outside@gmail.com"],
        attachment_rows=[],
    )
    approval = SimpleNamespace(
        id=uuid4(),
        org_id=org.id,
        status="approved",
        released_at=None,
        decided_at=datetime.now(UTC),
        content_digest=digest,
    )
    verdict = await _finalize_verdict(
        _FinalizeSession(approval),  # type: ignore[arg-type]
        org=org,  # type: ignore[arg-type]
        client_scan_id="scan-release",
        subject="Protected",
        body="PAN BNZAA2318J",
        recipients=["outside@gmail.com"],
        user_email="sender@example.com",
        attachment_rows=[],
        audit_client_event_id="scan-release",
        approved_quarantine_id=approval.id,
    )

    assert verdict.action == "allow"
    assert "approved-quarantine-release" in verdict.matched_policy_ids
    assert approval.released_at is not None

    replay = await _finalize_verdict(
        _FinalizeSession(approval),  # type: ignore[arg-type]
        org=org,  # type: ignore[arg-type]
        client_scan_id="scan-replay",
        subject="Protected",
        body="PAN BNZAA2318J",
        recipients=["outside@gmail.com"],
        user_email="sender@example.com",
        attachment_rows=[],
        audit_client_event_id="scan-replay",
        approved_quarantine_id=approval.id,
    )

    assert replay.action == "block"
    assert replay.matched_policy_ids == ["invalid-quarantine-release"]


@pytest.mark.unit
async def test_approved_quarantine_cannot_release_changed_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _stub_finalize_dependencies(monkeypatch)

    def high_risk_detection(_payload: object) -> SimpleNamespace:
        return SimpleNamespace(
            entities=[
                {
                    "type": "IN_PAN",
                    "masked_value": "BN***8J",
                    "confidence": 0.99,
                    "source": "body",
                }
            ],
            severity="high",
            risk_score=90,
        )

    monkeypatch.setattr(scan_api, "detect_email", high_risk_detection)
    org = SimpleNamespace(id=uuid4())
    approval = SimpleNamespace(
        id=uuid4(),
        org_id=org.id,
        status="approved",
        released_at=None,
        decided_at=datetime.now(UTC),
        content_digest="0" * 64,
    )
    verdict = await _finalize_verdict(
        _FinalizeSession(approval),  # type: ignore[arg-type]
        org=org,  # type: ignore[arg-type]
        client_scan_id="scan-changed",
        subject="Changed",
        body="PAN BNZAA2318J plus new content",
        recipients=["outside@gmail.com"],
        user_email="sender@example.com",
        attachment_rows=[],
        audit_client_event_id="scan-changed",
        approved_quarantine_id=approval.id,
    )

    assert verdict.action == "block"
    assert verdict.matched_policy_ids == ["invalid-quarantine-release"]
    assert approval.released_at is None
