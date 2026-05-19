from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest

from medshield_backend.db.models import QuarantineQueue
from medshield_backend.quarantine.service import can_override_quarantine


@pytest.mark.unit
def test_can_override_only_recent_approved_quarantine() -> None:
    now = datetime.now(UTC)
    item = QuarantineQueue(
        workspace_id=uuid4(),
        scan_id=uuid4(),
        sender_user_id=uuid4(),
        recipients=["patient@example.com"],
        subject="",
        severity="high",
        status="approved",
        reviewed_at=now - timedelta(minutes=4),
    )

    assert can_override_quarantine(item, now=now)

    item.reviewed_at = now - timedelta(minutes=6)
    assert not can_override_quarantine(item, now=now)
