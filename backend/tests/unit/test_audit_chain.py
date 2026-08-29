from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any, cast
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.audit.service import build_event_hash, verify_chain
from aurodlpv2_backend.db.models import AuditEvent


class _Scalars:
    def __init__(self, rows: list[AuditEvent]) -> None:
        self._rows = rows

    def all(self) -> list[AuditEvent]:
        return self._rows


class _FakeSession:
    def __init__(self, rows: list[AuditEvent]) -> None:
        self._rows = rows

    async def scalars(self, _statement: object) -> _Scalars:
        return _Scalars(self._rows)


def _as_session(session: _FakeSession) -> AsyncSession:
    return cast(AsyncSession, cast(Any, session))


def _chain(org_id: UUID, length: int) -> list[AuditEvent]:
    events: list[AuditEvent] = []
    previous_hash: str | None = None
    base = datetime(2026, 6, 10, 9, 0, tzinfo=UTC)
    for index in range(length):
        created_at = base + timedelta(seconds=index)
        metadata: dict[str, object] = {"step": index}
        event_hash = build_event_hash(
            org_id=org_id,
            actor="member:dr@hospital.in",
            category="quarantine",
            action="approved",
            metadata=metadata,
            previous_hash=previous_hash,
            created_at=created_at,
        )
        events.append(
            AuditEvent(
                id=uuid4(),
                org_id=org_id,
                actor="member:dr@hospital.in",
                category="quarantine",
                action="approved",
                metadata_json=metadata,
                previous_hash=previous_hash,
                event_hash=event_hash,
                created_at=created_at,
            )
        )
        previous_hash = event_hash
    return events


@pytest.mark.unit
async def test_intact_chain_verifies() -> None:
    org_id = uuid4()

    assert await verify_chain(_as_session(_FakeSession(_chain(org_id, 5))), org_id) is None


@pytest.mark.unit
async def test_empty_chain_verifies() -> None:
    assert await verify_chain(_as_session(_FakeSession([])), uuid4()) is None


@pytest.mark.unit
async def test_edited_row_is_caught_at_its_position() -> None:
    org_id = uuid4()
    events = _chain(org_id, 5)
    events[2].actor = "member:attacker@hospital.in"

    broken = await verify_chain(_as_session(_FakeSession(events)), org_id)

    assert broken is not None
    assert broken.position == 2
    assert broken.event_id == events[2].id
    assert "event_hash" in broken.reason


@pytest.mark.unit
async def test_deleted_row_breaks_the_link() -> None:
    org_id = uuid4()
    events = _chain(org_id, 5)
    del events[2]

    broken = await verify_chain(_as_session(_FakeSession(events)), org_id)

    assert broken is not None
    assert broken.position == 2
    assert "previous_hash" in broken.reason


@pytest.mark.unit
async def test_forked_chain_is_caught() -> None:
    org_id = uuid4()
    events = _chain(org_id, 3)
    fork = _chain(org_id, 2)[1]
    fork.created_at = events[2].created_at + timedelta(seconds=1)
    events.append(fork)

    broken = await verify_chain(_as_session(_FakeSession(events)), org_id)

    assert broken is not None
    assert broken.position == 3
