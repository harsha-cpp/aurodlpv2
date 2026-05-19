from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from medshield_backend.audit.api import parse_cursor


@pytest.mark.unit
def test_parse_audit_cursor() -> None:
    event_id = uuid4()
    occurred_at = datetime.now(UTC)

    parsed_at, parsed_id = parse_cursor(f"{occurred_at.isoformat()},{event_id}")

    assert parsed_at == occurred_at
    assert parsed_id == event_id
