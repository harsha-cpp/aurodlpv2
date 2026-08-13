"""Authenticated audit event listing."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query
from pydantic import BaseModel
from sqlalchemy import or_, select

from aurodlpv2_backend.db.models import AuditEvent
from aurodlpv2_backend.deps import CurrentMember, DbSession

router = APIRouter()


class AuditEventOut(BaseModel):
    id: str
    actor: str
    category: str
    action: str
    metadata: dict[str, object]
    previous_hash: str | None
    event_hash: str
    created_at: str


def serialize_audit_event(event: AuditEvent) -> AuditEventOut:
    return AuditEventOut(
        id=str(event.id),
        actor=event.actor,
        category=event.category,
        action=event.action,
        metadata=event.metadata_json,
        previous_hash=event.previous_hash,
        event_hash=event.event_hash,
        created_at=event.created_at.isoformat(),
    )


@router.get("", response_model=list[AuditEventOut])
async def list_audit_events(
    member: CurrentMember,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    search: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
) -> list[AuditEventOut]:
    statement = select(AuditEvent).where(AuditEvent.org_id == member.org_id)
    if search:
        needle = f"%{search.strip()}%"
        statement = statement.where(
            or_(
                AuditEvent.actor.ilike(needle),
                AuditEvent.category.ilike(needle),
                AuditEvent.action.ilike(needle),
                AuditEvent.event_hash.ilike(needle),
            )
        )
    rows = (
        await session.scalars(
            statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(limit)
        )
    ).all()
    return [serialize_audit_event(event) for event in rows]
