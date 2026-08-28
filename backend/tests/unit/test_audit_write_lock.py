from __future__ import annotations

from typing import Any, cast
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import AuditEvent


class _FakeSession:
    def __init__(self) -> None:
        self.calls: list[str] = []
        self.added: list[object] = []

    async def execute(self, statement: object, params: object = None) -> None:
        self.calls.append(f"execute:{statement!s}")
        self.calls.append(f"params:{params!r}")

    async def scalar(self, _statement: object) -> object | None:
        self.calls.append("scalar")
        return None

    def add(self, item: object) -> None:
        self.added.append(item)


def _as_session(session: _FakeSession) -> AsyncSession:
    return cast(AsyncSession, cast(Any, session))


@pytest.mark.unit
async def test_chain_tip_is_read_under_an_advisory_lock() -> None:
    """Without the lock two writers pick the same predecessor and fork the chain."""
    session = _FakeSession()
    org_id = uuid4()

    await write_audit_event(
        _as_session(session),
        org_id=org_id,
        actor="member:dr@hospital.in",
        category="auth",
        action="login",
    )

    lock_calls = [call for call in session.calls if "pg_advisory_xact_lock" in call]
    assert lock_calls, "expected a per-org advisory lock before reading the tip"
    # The lock must be taken before the SELECT, not after it.
    assert session.calls.index(lock_calls[0]) < session.calls.index("scalar")
    assert str(org_id) in "".join(session.calls)


@pytest.mark.unit
async def test_first_event_in_an_org_has_no_predecessor() -> None:
    session = _FakeSession()

    event = await write_audit_event(
        _as_session(session),
        org_id=uuid4(),
        actor="member:dr@hospital.in",
        category="auth",
        action="login",
    )

    assert isinstance(event, AuditEvent)
    assert event.previous_hash is None
    assert session.added == [event]
