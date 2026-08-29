from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from aurodlpv2_backend.db.models import AuditEvent, Organization, ScanEvent
from aurodlpv2_backend.events.api import EventPayload, ingest_event


class _FakeSession:
    def __init__(self, scalar_results: list[object]) -> None:
        self._scalar_results = scalar_results
        self.added: list[object] = []
        self.commits = 0
        self.rollbacks = 0

    async def scalar(self, _statement: object) -> object:
        return self._scalar_results.pop(0)

    async def execute(self, _statement: object, _params: object = None) -> None:
        return None

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


def _session(org_id: UUID, *, duplicate: bool = False) -> _FakeSession:
    return _FakeSession([Organization(id=org_id), uuid4() if duplicate else None, None])


def _payload(**overrides: object) -> EventPayload:
    data: dict[str, object] = {
        "org_code": " aur-abc123 ",
        "client_event_id": "evt-123456789",
        "user_email": "Sender@Example.COM",
        "action": "block",
        "severity": "high",
        "risk_score": 85,
        "entities": [{"type": "IN_AADHAAR", "confidence": 0.99}],
        "recipients": ["Patient@Example.com"],
        "timestamp": datetime.now(UTC).isoformat(),
    }
    data.update(overrides)
    return EventPayload.model_validate(data)


def _only(session: _FakeSession, kind: type[object]) -> list[object]:
    return [item for item in session.added if isinstance(item, kind)]


@pytest.mark.unit
async def test_ingest_event_is_idempotent_and_normalizes_payload() -> None:
    org_id = uuid4()
    session = _session(org_id)
    result = await ingest_event(_payload(), session)  # type: ignore[arg-type]

    assert result == {"status": "accepted"}
    assert session.commits == 1
    events = _only(session, ScanEvent)
    assert len(events) == 1
    event = events[0]
    assert isinstance(event, ScanEvent)
    assert event.org_id == org_id
    assert event.client_event_id == "evt-123456789"
    assert event.user_email == "sender@example.com"
    assert event.recipients == ["patient@example.com"]


@pytest.mark.unit
async def test_ingest_event_duplicate_does_not_double_count() -> None:
    session = _session(uuid4(), duplicate=True)
    result = await ingest_event(_payload(), session)  # type: ignore[arg-type]

    assert result == {"status": "duplicate"}
    assert session.added == []
    assert session.commits == 0


@pytest.mark.unit
@pytest.mark.parametrize("bad_action", ["", "pass", "blocked"])
def test_event_payload_rejects_unknown_actions(bad_action: str) -> None:
    with pytest.raises(ValidationError):
        _payload(action=bad_action)


@pytest.mark.unit
async def test_ingest_event_rejects_future_timestamp() -> None:
    payload = _payload(timestamp=datetime.now(UTC) + timedelta(minutes=10))
    session = _session(uuid4())

    with pytest.raises(HTTPException) as exc_info:
        await ingest_event(payload, session)  # type: ignore[arg-type]

    assert exc_info.value.status_code == 422
    assert session.commits == 0


@pytest.mark.unit
async def test_web_event_stores_the_site_and_the_masked_value() -> None:
    session = _session(uuid4())
    payload = _payload(
        channel="web",
        site_host="  ChatGPT.com ",
        recipients=[],
        entities=[
            {"type": "MRN", "confidence": 0.97, "masked_value": "UHID 00XXXXX"},
        ],
    )

    result = await ingest_event(payload, session)  # type: ignore[arg-type]

    assert result == {"status": "accepted"}
    event = _only(session, ScanEvent)[0]
    assert isinstance(event, ScanEvent)
    assert event.channel == "web"
    assert event.site_host == "chatgpt.com"
    assert event.entities == [{"type": "MRN", "confidence": 0.97, "masked_value": "UHID 00XXXXX"}]


@pytest.mark.unit
async def test_email_event_without_a_channel_still_ingests() -> None:
    session = _session(uuid4())

    result = await ingest_event(_payload(), session)  # type: ignore[arg-type]

    assert result == {"status": "accepted"}
    event = _only(session, ScanEvent)[0]
    assert isinstance(event, ScanEvent)
    assert event.channel == "email"
    assert event.site_host is None


@pytest.mark.unit
@pytest.mark.parametrize(
    "bad_host",
    [
        "https://chat.openai.com/c/abc",
        "chatgpt.com/c/patient-summary",
        "chat gpt.com",
        "doctor@chatgpt.com",
    ],
)
def test_site_host_must_be_a_bare_hostname(bad_host: str) -> None:
    with pytest.raises(ValidationError):
        _payload(channel="web", site_host=bad_host)


@pytest.mark.unit
def test_web_event_without_a_site_host_is_rejected() -> None:
    with pytest.raises(ValidationError):
        _payload(channel="web")


@pytest.mark.unit
def test_email_event_with_a_site_host_is_rejected() -> None:
    with pytest.raises(ValidationError):
        _payload(site_host="chatgpt.com")


@pytest.mark.unit
async def test_ingest_writes_an_audit_row_naming_the_site() -> None:
    session = _session(uuid4())
    payload = _payload(
        channel="web",
        site_host="chatgpt.com",
        recipients=[],
        entities=[
            {"type": "MRN", "confidence": 0.9, "masked_value": "UHID 00XXXXX"},
            {"type": "IN_AADHAAR", "confidence": 0.99, "masked_value": "XXXX XXXX 7460"},
            {"type": "MRN", "confidence": 0.8, "masked_value": "UHID 00XXXXY"},
        ],
    )

    await ingest_event(payload, session)  # type: ignore[arg-type]

    audits = _only(session, AuditEvent)
    assert len(audits) == 1
    audit = audits[0]
    assert isinstance(audit, AuditEvent)
    assert audit.category == "scan"
    assert audit.action == "block"
    assert audit.actor == "extension-unverified:Sender@example.com"
    assert audit.metadata_json["channel"] == "web"
    assert audit.metadata_json["site_host"] == "chatgpt.com"
    assert audit.metadata_json["client_event_id"] == "evt-123456789"
    assert audit.metadata_json["entity_count"] == 3
    assert audit.metadata_json["entity_types"] == ["IN_AADHAAR", "MRN"]
    assert audit.metadata_json["severity"] == "high"
    assert "XXXX XXXX 7460" not in str(audit.metadata_json)


@pytest.mark.unit
async def test_duplicate_event_writes_no_second_audit_row() -> None:
    session = _session(uuid4(), duplicate=True)

    result = await ingest_event(_payload(), session)  # type: ignore[arg-type]

    assert result == {"status": "duplicate"}
    assert _only(session, AuditEvent) == []
