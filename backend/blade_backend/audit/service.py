from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from blade_backend.db.models import AuditEvent

_ORG_CHAIN_LOCK = text("SELECT pg_advisory_xact_lock(hashtext(CAST(:org_id AS text)))")


@dataclass(frozen=True, slots=True)
class ChainBreak:
    event_id: UUID
    position: int
    reason: str


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
    await session.execute(_ORG_CHAIN_LOCK, {"org_id": str(org_id)})
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


async def verify_chain(session: AsyncSession, org_id: UUID) -> ChainBreak | None:
    rows = (
        await session.scalars(
            select(AuditEvent)
            .where(AuditEvent.org_id == org_id)
            .order_by(AuditEvent.created_at.asc(), AuditEvent.id.asc())
        )
    ).all()

    expected_previous: str | None = None
    for position, event in enumerate(rows):
        if event.previous_hash != expected_previous:
            return ChainBreak(
                event_id=event.id,
                position=position,
                reason="previous_hash does not match the preceding event",
            )
        recomputed = build_event_hash(
            org_id=event.org_id,
            actor=event.actor,
            category=event.category,
            action=event.action,
            metadata=event.metadata_json,
            previous_hash=event.previous_hash,
            created_at=event.created_at,
        )
        if recomputed != event.event_hash:
            return ChainBreak(
                event_id=event.id,
                position=position,
                reason="event_hash does not match the stored payload",
            )
        expected_previous = event.event_hash
    return None
