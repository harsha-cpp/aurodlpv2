from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Annotated, Self
from uuid import UUID

from fastapi import APIRouter, Header, HTTPException, Query, status
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator
from sqlalchemy import DateTime, bindparam, func, select, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.exc import IntegrityError

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import (
    EventAction,
    EventChannel,
    EventSeverity,
    ScanEvent,
)
from aurodlpv2_backend.deps import CurrentMember, DbSession
from aurodlpv2_backend.scan.credentials import ScanPrincipal, principal_for_request
from aurodlpv2_backend.scan.limits import enforce_scan_limit

router = APIRouter()

_MAX_CLOCK_SKEW = timedelta(minutes=5)
_MAX_EVENT_AGE = timedelta(days=366)
_MAX_ENTITIES_PER_EVENT = 500
_MAX_RECIPIENTS_PER_EVENT = 200
_MAX_SITE_HOST_LENGTH = 253
_ANALYTICS_CACHE_TTL_SECONDS = 10.0
_ANALYTICS_CACHE: dict[tuple[UUID, int], tuple[float, StatsResponse]] = {}


class EntityReport(BaseModel):
    type: str = Field(min_length=1, max_length=80)
    confidence: float = Field(ge=0, le=1)
    masked_value: str | None = Field(default=None, max_length=200)


def _empty_entities() -> list[EntityReport]:
    return []


def _empty_recipients() -> list[EmailStr]:
    return []


class EventPayload(BaseModel):
    org_code: str | None = Field(default=None, min_length=3, max_length=64)
    client_event_id: str = Field(min_length=8, max_length=128)
    user_email: EmailStr | None = None
    action: EventAction
    severity: EventSeverity
    risk_score: float = Field(ge=0, le=100)
    entities: list[EntityReport] = Field(default_factory=_empty_entities)
    recipients: list[EmailStr] = Field(default_factory=_empty_recipients)
    channel: EventChannel = "email"
    site_host: str | None = Field(default=None, max_length=_MAX_SITE_HOST_LENGTH)
    timestamp: datetime | None = None

    @field_validator("org_code")
    @classmethod
    def normalize_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else None

    @field_validator("client_event_id")
    @classmethod
    def normalize_client_event_id(cls, value: str) -> str:
        return value.strip()

    @field_validator("entities")
    @classmethod
    def cap_entities(cls, value: list[EntityReport]) -> list[EntityReport]:
        if len(value) > _MAX_ENTITIES_PER_EVENT:
            raise ValueError("too many entities")
        return value

    @field_validator("recipients")
    @classmethod
    def cap_recipients(cls, value: list[EmailStr]) -> list[EmailStr]:
        if len(value) > _MAX_RECIPIENTS_PER_EVENT:
            raise ValueError("too many recipients")
        return value

    @field_validator("site_host")
    @classmethod
    def normalize_site_host(cls, value: str | None) -> str | None:
        if value is None:
            return None
        host = value.strip().lower()
        if not host:
            return None
        if "/" in host or "@" in host or any(char.isspace() for char in host):
            raise ValueError("site_host must be a bare hostname")
        return host

    @field_validator("timestamp")
    @classmethod
    def normalize_timestamp(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def check_site_host_matches_channel(self) -> Self:
        if self.channel == "web" and self.site_host is None:
            raise ValueError("site_host is required for web events")
        if self.channel == "email" and self.site_host is not None:
            raise ValueError("site_host is only valid for web events")
        return self


class EntityTypeCount(BaseModel):
    type: str
    count: int


class UserBlockCount(BaseModel):
    email: str | None
    blocks: int


class DailyTrendPoint(BaseModel):
    day: str
    action: str
    count: int


class SiteCount(BaseModel):
    site_host: str
    count: int


class RecentEvent(BaseModel):
    user_email: str | None
    action: str
    severity: str
    risk_score: float
    channel: str
    site_host: str | None
    entities: list[dict[str, object]]
    recipients: list[str]
    timestamp: str


class StatsResponse(BaseModel):
    total_scans: int
    total_blocks: int
    total_allows: int
    total_warnings: int
    total_quarantines: int
    total_escalations: int
    unique_users: int
    avg_risk_score: float
    by_channel: dict[str, int]
    top_sites: list[SiteCount]
    top_entity_types: list[EntityTypeCount]
    top_users: list[UserBlockCount]
    daily_trend: list[DailyTrendPoint]
    recent_events: list[RecentEvent]


def _event_time(payload: EventPayload) -> datetime:
    now = datetime.now(UTC)
    event_time = payload.timestamp or now
    if event_time > now + _MAX_CLOCK_SKEW:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="timestamp is in the future"
        )
    if event_time < now - _MAX_EVENT_AGE:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="timestamp is too old")
    return event_time


def _event_sender(principal: ScanPrincipal, claimed: EmailStr | None) -> str | None:
    if principal.email:
        return principal.email.lower()
    if claimed:
        return str(claimed).lower()
    return None


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def ingest_event(
    payload: EventPayload,
    session: DbSession,
    x_auro_device_token: Annotated[str | None, Header()] = None,
) -> dict[str, str]:
    principal = await principal_for_request(session, payload.org_code, x_auro_device_token)
    enforce_scan_limit(principal)
    org_id = principal.org_id
    existing = await session.scalar(
        select(ScanEvent.id).where(
            ScanEvent.org_id == org_id,
            ScanEvent.client_event_id == payload.client_event_id,
        )
    )
    if existing is not None:
        return {"status": "duplicate"}

    event = ScanEvent(
        client_event_id=payload.client_event_id,
        org_id=org_id,
        user_email=_event_sender(principal, payload.user_email),
        action=payload.action,
        severity=payload.severity,
        channel=payload.channel,
        site_host=payload.site_host,
        risk_score=payload.risk_score,
        entities=[entity.model_dump() for entity in payload.entities],
        recipients=[str(recipient).lower() for recipient in payload.recipients],
        event_time=_event_time(payload),
    )
    session.add(event)
    await write_audit_event(
        session,
        org_id=org_id,
        actor=principal.actor(payload.user_email),
        category="scan",
        action=payload.action,
        metadata={
            "channel": payload.channel,
            "site_host": payload.site_host,
            "client_event_id": payload.client_event_id,
            "entity_count": len(payload.entities),
            "entity_types": sorted({entity.type for entity in payload.entities}),
            "risk_score": payload.risk_score,
            "severity": payload.severity,
        },
    )
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        return {"status": "duplicate"}
    _clear_analytics_cache(org_id)
    return {"status": "accepted"}


@router.get("/analytics", response_model=StatsResponse)
async def get_analytics(
    session: DbSession,
    member: CurrentMember,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> StatsResponse:
    since = datetime.now(UTC) - timedelta(days=days)
    org_id = member.org_id
    cached = _get_cached_analytics(org_id, days)
    if cached is not None:
        return cached

    base_filter = (ScanEvent.org_id == org_id, ScanEvent.event_time >= since)

    aggregate_row = (
        await session.execute(
            select(
                func.count(ScanEvent.id),
                func.count(ScanEvent.id).filter(ScanEvent.action == "block"),
                func.count(ScanEvent.id).filter(ScanEvent.action == "allow"),
                func.count(ScanEvent.id).filter(ScanEvent.action == "warn"),
                func.count(ScanEvent.id).filter(ScanEvent.action == "quarantine"),
                func.count(ScanEvent.id).filter(ScanEvent.action == "escalate"),
                func.count(ScanEvent.id).filter(ScanEvent.channel == "email"),
                func.count(ScanEvent.id).filter(ScanEvent.channel == "web"),
                func.count(func.distinct(ScanEvent.user_email)),
                func.coalesce(func.avg(ScanEvent.risk_score), 0),
            ).where(*base_filter)
        )
    ).one()
    (
        total_scans,
        total_blocks,
        total_allows,
        total_warnings,
        total_quarantines,
        total_escalations,
        email_events,
        web_events,
        unique_users,
        avg_risk,
    ) = aggregate_row

    top_users_rows = (
        await session.execute(
            select(ScanEvent.user_email, func.count(ScanEvent.id))
            .where(*base_filter, ScanEvent.action == "block")
            .group_by(ScanEvent.user_email)
            .order_by(func.count(ScanEvent.id).desc())
            .limit(10)
        )
    ).all()
    top_users = [UserBlockCount(email=email, blocks=int(count)) for email, count in top_users_rows]

    top_sites_rows = (
        await session.execute(
            select(ScanEvent.site_host, func.count(ScanEvent.id))
            .where(*base_filter, ScanEvent.channel == "web", ScanEvent.site_host.is_not(None))
            .group_by(ScanEvent.site_host)
            .order_by(func.count(ScanEvent.id).desc())
            .limit(10)
        )
    ).all()
    top_sites = [
        SiteCount(site_host=str(site_host), count=int(count)) for site_host, count in top_sites_rows
    ]

    day_expr = func.date_trunc("day", ScanEvent.event_time)
    trend_rows = (
        await session.execute(
            select(day_expr.label("day"), ScanEvent.action, func.count(ScanEvent.id))
            .where(*base_filter)
            .group_by(day_expr, ScanEvent.action)
            .order_by(day_expr.asc())
        )
    ).all()
    daily_trend = [
        DailyTrendPoint(
            day=str(day.date()) if hasattr(day, "date") else str(day),
            action=action,
            count=int(count),
        )
        for day, action, count in trend_rows
    ]

    entity_sql = text(
        """
        SELECT elem->>'type' AS entity_type, COUNT(*) AS cnt
        FROM scan_events, jsonb_array_elements(entities) AS elem
        WHERE org_id = :org_id AND event_time >= :since
        GROUP BY entity_type
        ORDER BY cnt DESC
        LIMIT 10
        """
    ).bindparams(
        bindparam("org_id", type_=PG_UUID(as_uuid=True)),
        bindparam("since", type_=DateTime(timezone=True)),
    )
    entity_rows = (await session.execute(entity_sql, {"org_id": org_id, "since": since})).all()
    top_entity_types = [
        EntityTypeCount(type=str(entity_type), count=int(count))
        for entity_type, count in entity_rows
    ]

    recent_rows = (
        await session.scalars(
            select(ScanEvent)
            .where(*base_filter)
            .order_by(ScanEvent.event_time.desc(), ScanEvent.id.desc())
            .limit(20)
        )
    ).all()
    recent_events = [
        RecentEvent(
            user_email=event.user_email,
            action=event.action,
            severity=event.severity,
            risk_score=float(event.risk_score),
            channel=event.channel,
            site_host=event.site_host,
            entities=list(event.entities or []),
            recipients=list(event.recipients or []),
            timestamp=event.event_time.isoformat(),
        )
        for event in recent_rows
    ]

    response = StatsResponse(
        total_scans=int(total_scans or 0),
        total_blocks=int(total_blocks or 0),
        total_allows=int(total_allows or 0),
        total_warnings=int(total_warnings or 0),
        total_quarantines=int(total_quarantines or 0),
        total_escalations=int(total_escalations or 0),
        unique_users=int(unique_users or 0),
        avg_risk_score=round(float(avg_risk or 0), 1),
        by_channel={"email": int(email_events or 0), "web": int(web_events or 0)},
        top_sites=top_sites,
        top_entity_types=top_entity_types,
        top_users=top_users,
        daily_trend=daily_trend,
        recent_events=recent_events,
    )
    _set_cached_analytics(org_id, days, response)
    return response


def _get_cached_analytics(org_id: UUID, days: int) -> StatsResponse | None:
    cached = _ANALYTICS_CACHE.get((org_id, days))
    if cached is None:
        return None
    cached_at, response = cached
    if time.monotonic() - cached_at > _ANALYTICS_CACHE_TTL_SECONDS:
        _ANALYTICS_CACHE.pop((org_id, days), None)
        return None
    return response


def _set_cached_analytics(org_id: UUID, days: int, response: StatsResponse) -> None:
    _ANALYTICS_CACHE[(org_id, days)] = (time.monotonic(), response)


def _clear_analytics_cache(org_id: UUID) -> None:
    for key in list(_ANALYTICS_CACHE):
        if key[0] == org_id:
            _ANALYTICS_CACHE.pop(key, None)
