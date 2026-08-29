from __future__ import annotations

import base64
import binascii
from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import Select, func, or_, select

from aurodlpv2_backend.audit.service import verify_chain
from aurodlpv2_backend.db.models import AuditEvent
from aurodlpv2_backend.deps import CurrentMember, DbSession

router = APIRouter()

MAX_PAGE_SIZE = 200


class AuditEventOut(BaseModel):
    id: str
    actor: str
    category: str
    action: str
    metadata: dict[str, object]
    previous_hash: str | None
    event_hash: str
    created_at: str


def _empty_events() -> list[AuditEventOut]:
    return []


class AuditPage(BaseModel):
    events: list[AuditEventOut] = Field(default_factory=_empty_events)
    next_cursor: str | None = None


class ChainStatus(BaseModel):
    ok: bool
    checked: int
    broken_at: int | None = None
    detail: str | None = None


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


def _encode_cursor(event: AuditEvent) -> str:
    raw = f"{event.created_at.isoformat()}|{event.id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def _decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        timestamp, _, identifier = raw.partition("|")
        parsed = datetime.fromisoformat(timestamp)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed, UUID(identifier)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="invalid cursor") from exc


def _apply_filters(
    statement: Select[tuple[AuditEvent]],
    *,
    category: str | None,
    actor: str | None,
    action: str | None,
    since: datetime | None,
    until: datetime | None,
    search: str | None,
) -> Select[tuple[AuditEvent]]:
    if category:
        statement = statement.where(AuditEvent.category == category)
    if actor:
        statement = statement.where(AuditEvent.actor.ilike(f"%{actor.strip()}%"))
    if action:
        statement = statement.where(AuditEvent.action == action)
    if since:
        statement = statement.where(AuditEvent.created_at >= since)
    if until:
        statement = statement.where(AuditEvent.created_at <= until)
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
    return statement


@router.get("", response_model=AuditPage)
async def list_audit_events(
    member: CurrentMember,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 50,
    cursor: Annotated[str | None, Query()] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    actor: Annotated[str | None, Query(max_length=200)] = None,
    action: Annotated[str | None, Query(max_length=80)] = None,
    since: Annotated[datetime | None, Query()] = None,
    until: Annotated[datetime | None, Query()] = None,
    search: Annotated[str | None, Query(min_length=1, max_length=120)] = None,
) -> AuditPage:
    statement = select(AuditEvent).where(AuditEvent.org_id == member.org_id)
    statement = _apply_filters(
        statement,
        category=category,
        actor=actor,
        action=action,
        since=since,
        until=until,
        search=search,
    )

    if cursor:
        cursor_time, cursor_id = _decode_cursor(cursor)
        statement = statement.where(
            or_(
                AuditEvent.created_at < cursor_time,
                (AuditEvent.created_at == cursor_time) & (AuditEvent.id < cursor_id),
            )
        )

    rows = list(
        (
            await session.scalars(
                statement.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc()).limit(
                    limit + 1
                )
            )
        ).all()
    )

    has_more = len(rows) > limit
    page = rows[:limit]
    return AuditPage(
        events=[serialize_audit_event(event) for event in page],
        next_cursor=_encode_cursor(page[-1]) if has_more and page else None,
    )


@router.get("/categories", response_model=list[str])
async def list_audit_categories(member: CurrentMember, session: DbSession) -> list[str]:
    """Distinct categories, so the filter offers what actually exists."""
    rows = await session.scalars(
        select(AuditEvent.category)
        .where(AuditEvent.org_id == member.org_id)
        .distinct()
        .order_by(AuditEvent.category.asc())
    )
    return list(rows.all())


@router.get("/chain", response_model=ChainStatus)
async def verify_audit_chain(member: CurrentMember, session: DbSession) -> ChainStatus:
    """Walk the whole chain server-side.

    The dashboard could previously only check continuity within the page it had
    loaded, which is not a tamper-evidence claim worth making.
    """
    counted = int(
        await session.scalar(
            select(func.count()).select_from(AuditEvent).where(AuditEvent.org_id == member.org_id)
        )
        or 0
    )
    break_point = await verify_chain(session, member.org_id)
    if break_point is None:
        return ChainStatus(ok=True, checked=counted)
    return ChainStatus(
        ok=False,
        checked=counted,
        broken_at=break_point.position,
        detail=break_point.reason,
    )
