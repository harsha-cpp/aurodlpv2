"""Admin audit query API and export."""

from __future__ import annotations

import csv
import io
from collections.abc import Iterator
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from starlette.responses import StreamingResponse

from aurodlpv2_backend.db.models import AuditEvent
from aurodlpv2_backend.deps import DbSession, Principal, require_role

router = APIRouter()
AnalystUser = Annotated[Principal, Depends(require_role("analyst", "admin", "super_admin"))]


class AuditEventResponse(BaseModel):
    id: str
    workspace_id: str
    occurred_at: datetime
    actor_type: str
    actor_id: str
    actor_email: str | None
    action: str
    category: str
    resource_type: str | None
    resource_id: str | None
    metadata: dict[str, object] | None


@router.get("")
async def list_events(
    session: DbSession,
    actor: AnalystUser,
    cursor: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    action: str | None = None,
) -> list[AuditEventResponse]:
    stmt = select(AuditEvent).where(AuditEvent.workspace_id == actor.workspace_id)
    if action is not None:
        stmt = stmt.where(AuditEvent.action == action)
    if cursor is not None:
        occurred_at, event_id = parse_cursor(cursor)
        stmt = stmt.where(
            or_(
                AuditEvent.occurred_at < occurred_at,
                and_(AuditEvent.occurred_at == occurred_at, AuditEvent.id < event_id),
            )
        )
    rows = await session.scalars(
        stmt.order_by(AuditEvent.occurred_at.desc(), AuditEvent.id.desc()).limit(limit)
    )
    return [_response(row) for row in rows]


@router.get("/export")
async def export_events(session: DbSession, actor: AnalystUser) -> StreamingResponse:
    rows = await session.scalars(
        select(AuditEvent)
        .where(AuditEvent.workspace_id == actor.workspace_id)
        .order_by(AuditEvent.occurred_at.desc())
        .limit(10_000)
    )
    return StreamingResponse(
        _csv_rows(list(rows)),
        media_type="text/csv",
        headers={"content-disposition": "attachment; filename=audit.csv"},
    )


@router.get("/verify-chain")
async def verify_chain() -> dict[str, str]:
    return {"status": "not_implemented"}


@router.get("/{event_id}")
async def get_event(event_id: UUID, session: DbSession, actor: AnalystUser) -> AuditEventResponse:
    row = await session.scalar(
        select(AuditEvent).where(
            AuditEvent.workspace_id == actor.workspace_id,
            AuditEvent.id == event_id,
        )
    )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="audit event not found")
    return _response(row)


def parse_cursor(cursor: str) -> tuple[datetime, UUID]:
    occurred_raw, separator, id_raw = cursor.partition(",")
    if not separator:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid cursor")
    try:
        return datetime.fromisoformat(occurred_raw), UUID(id_raw)
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid cursor") from exc


def _response(row: AuditEvent) -> AuditEventResponse:
    return AuditEventResponse(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        occurred_at=row.occurred_at,
        actor_type=row.actor_type,
        actor_id=row.actor_id,
        actor_email=row.actor_email,
        action=row.action,
        category=row.category,
        resource_type=row.resource_type,
        resource_id=row.resource_id,
        metadata=row.event_metadata,
    )


def _csv_rows(rows: list[AuditEvent]) -> Iterator[str]:
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["occurred_at", "actor_email", "action", "resource_type", "resource_id"])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)
    for row in rows:
        writer.writerow(
            [
                row.occurred_at.isoformat(),
                row.actor_email or "",
                row.action,
                row.resource_type or "",
                row.resource_id or "",
            ]
        )
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)
