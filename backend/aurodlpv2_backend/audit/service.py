"""Append-only audit event helpers."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.db.models import AuditEvent


def _canonical_json(value: dict[str, object]) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def build_event_hash(
    *,
    org_id: UUID,
    actor: str,
    category: str,
    action: str,
    metadata: dict[str, object],
    previous_hash: str | None,
    created_at: datetime,
) -> str:
    payload: dict[str, Any] = {
        "org_id": str(org_id),
        "actor": actor,
        "category": category,
        "action": action,
        "metadata": metadata,
        "previous_hash": previous_hash,
        "created_at": created_at.isoformat(),
    }
    return hashlib.sha256(_canonical_json(payload).encode("utf-8")).hexdigest()


async def write_audit_event(
    session: AsyncSession,
    *,
    org_id: UUID,
    actor: str,
    category: str,
    action: str,
    metadata: dict[str, object] | None = None,
) -> AuditEvent:
    previous = await session.scalar(
        select(AuditEvent)
        .where(AuditEvent.org_id == org_id)
        .order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
        .limit(1)
    )
    created_at = datetime.now(UTC)
    metadata_json = metadata or {}
    event_hash = build_event_hash(
        org_id=org_id,
        actor=actor,
        category=category,
        action=action,
        metadata=metadata_json,
        previous_hash=previous.event_hash if previous else None,
        created_at=created_at,
    )
    event = AuditEvent(
        org_id=org_id,
        actor=actor,
        category=category,
        action=action,
        metadata_json=metadata_json,
        previous_hash=previous.event_hash if previous else None,
        event_hash=event_hash,
        created_at=created_at,
    )
    session.add(event)
    return event
