from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from aurodlpv2_backend.db.models import ScanEvent
from aurodlpv2_backend.deps import ExtensionActor
from aurodlpv2_backend.events.api import EventPayload, ingest_event


class _FakeSession:
    def __init__(self, scalar_results: list[object]) -> None:
        self._scalar_results = scalar_results
        self.added: list[object] = []
        self.commits = 0
        self.rollbacks = 0

    async def scalar(self, _statement: object) -> object:
        return self._scalar_results.pop(0)

    def add(self, item: object) -> None:
        self.added.append(item)

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        self.rollbacks += 1


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


def _extension(org_id: object) -> ExtensionActor:
    return ExtensionActor(
        client_id=uuid4(),
        org_id=org_id,  # type: ignore[arg-type]
        org_code="AUR-ABC123",
        label="test",
    )


@pytest.mark.unit
async def test_ingest_event_is_idempotent_and_normalizes_payload() -> None:
    org_id = uuid4()
    session = _FakeSession([None])
    result = await ingest_event(_payload(), session, _extension(org_id))  # type: ignore[arg-type]

    assert result == {"status": "accepted"}
    assert session.commits == 1
    assert len(session.added) == 1
    event = session.added[0]
    assert isinstance(event, ScanEvent)
    assert event.org_id == org_id
    assert event.client_event_id == "evt-123456789"
    assert event.user_email == "sender@example.com"
    assert event.recipients == ["patient@example.com"]


@pytest.mark.unit
async def test_ingest_event_duplicate_does_not_double_count() -> None:
    org_id = uuid4()
    session = _FakeSession([uuid4()])
    result = await ingest_event(_payload(), session, _extension(org_id))  # type: ignore[arg-type]

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
    org_id = uuid4()
    session = _FakeSession([None])

    with pytest.raises(HTTPException) as exc_info:
        await ingest_event(payload, session, _extension(org_id))  # type: ignore[arg-type]

    assert exc_info.value.status_code == 422
    assert session.commits == 0
