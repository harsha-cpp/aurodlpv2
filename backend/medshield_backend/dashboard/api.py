"""Admin dashboard aggregation API."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import func, select

from medshield_backend.db.models import QuarantineQueue, Scan
from medshield_backend.deps import DbSession, Principal, require_role

router = APIRouter()
AnalystUser = Annotated[Principal, Depends(require_role("analyst", "admin", "super_admin"))]


class DashboardStats(BaseModel):
    total_scans: int
    blocked: int
    quarantined: int
    avg_latency_ms: int
    quarantine_pending: int


class TopViolation(BaseModel):
    key: str
    count: int


class TrendPoint(BaseModel):
    day: str
    decision: str
    count: int


@router.get("/stats")
async def stats(
    session: DbSession,
    actor: AnalystUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> DashboardStats:
    since = datetime.now(UTC) - timedelta(days=days)
    total_scans = await _count_scans(session, actor, since)
    blocked = await _count_scans(session, actor, since, decision="block")
    quarantined = await _count_scans(session, actor, since, decision="quarantine")
    avg_latency = await session.scalar(
        select(func.coalesce(func.avg(Scan.duration_ms), 0)).where(
            Scan.workspace_id == actor.workspace_id,
            Scan.created_at >= since,
        )
    )
    pending = await session.scalar(
        select(func.count()).select_from(QuarantineQueue).where(
            QuarantineQueue.workspace_id == actor.workspace_id,
            QuarantineQueue.status == "pending",
        )
    )
    return DashboardStats(
        total_scans=total_scans,
        blocked=blocked,
        quarantined=quarantined,
        avg_latency_ms=round(float(avg_latency or 0)),
        quarantine_pending=int(pending or 0),
    )


@router.get("/top-violations")
async def top_violations(
    session: DbSession,
    actor: AnalystUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[TopViolation]:
    since = datetime.now(UTC) - timedelta(days=days)
    rows = await session.execute(
        select(Scan.decision, func.count())
        .where(
            Scan.workspace_id == actor.workspace_id,
            Scan.created_at >= since,
            Scan.decision.is_not(None),
        )
        .group_by(Scan.decision)
        .order_by(func.count().desc())
        .limit(limit)
    )
    return [TopViolation(key=str(decision), count=int(count)) for decision, count in rows]


@router.get("/trend")
async def trend(
    session: DbSession,
    actor: AnalystUser,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
) -> list[TrendPoint]:
    since = datetime.now(UTC) - timedelta(days=days)
    day_expr = func.date_trunc("day", Scan.created_at)
    rows = await session.execute(
        select(day_expr, Scan.decision, func.count())
        .where(
            Scan.workspace_id == actor.workspace_id,
            Scan.created_at >= since,
            Scan.decision.is_not(None),
        )
        .group_by(day_expr, Scan.decision)
        .order_by(day_expr)
    )
    return [
        TrendPoint(day=str(day.date()), decision=str(decision), count=int(count))
        for day, decision, count in rows
        if isinstance(day, datetime)
    ]


async def _count_scans(
    session: DbSession,
    actor: Principal,
    since: datetime,
    *,
    decision: str | None = None,
) -> int:
    stmt = select(func.count()).select_from(Scan).where(
        Scan.workspace_id == actor.workspace_id,
        Scan.created_at >= since,
    )
    if decision is not None:
        stmt = stmt.where(Scan.decision == decision)
    return int(await session.scalar(stmt) or 0)
