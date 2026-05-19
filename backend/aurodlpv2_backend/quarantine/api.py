"""Quarantine review API and SSE stream."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import select
from starlette.responses import StreamingResponse

from aurodlpv2_backend.db.models import QuarantineQueue, QuarantineStatus
from aurodlpv2_backend.deps import DbSession, Principal, require_role
from aurodlpv2_backend.quarantine.service import QuarantineTransitionError, transition

router = APIRouter()
AnalystUser = Annotated[Principal, Depends(require_role("analyst", "admin", "super_admin"))]


class QuarantineResponse(BaseModel):
    id: str
    scan_id: str
    sender_user_id: str
    recipients: list[str]
    subject: str | None
    severity: str
    status: QuarantineStatus


@router.get("")
async def list_quarantine(
    session: DbSession,
    actor: AnalystUser,
    item_status: Annotated[QuarantineStatus | None, Query(alias="status")] = None,
) -> list[QuarantineResponse]:
    stmt = select(QuarantineQueue).where(QuarantineQueue.workspace_id == actor.workspace_id)
    if item_status is not None:
        stmt = stmt.where(QuarantineQueue.status == item_status)
    rows = await session.scalars(stmt.order_by(QuarantineQueue.created_at.desc()))
    return [_response(row) for row in rows]


@router.post("/{quarantine_id}/approve")
async def approve(
    quarantine_id: UUID,
    session: DbSession,
    actor: AnalystUser,
) -> QuarantineResponse:
    return await _transition_response(session, actor, quarantine_id, "approved")


@router.post("/{quarantine_id}/reject")
async def reject(
    quarantine_id: UUID,
    session: DbSession,
    actor: AnalystUser,
) -> QuarantineResponse:
    return await _transition_response(session, actor, quarantine_id, "rejected")


@router.post("/{quarantine_id}/escalate")
async def escalate(
    quarantine_id: UUID,
    session: DbSession,
    actor: AnalystUser,
) -> QuarantineResponse:
    return await _transition_response(session, actor, quarantine_id, "escalated")


@router.get("/stream")
async def stream(_actor: AnalystUser) -> StreamingResponse:
    return StreamingResponse(_heartbeat_stream(), media_type="text/event-stream")


async def _transition_response(
    session: DbSession,
    actor: Principal,
    quarantine_id: UUID,
    item_status: QuarantineStatus,
) -> QuarantineResponse:
    try:
        item = await transition(
            session=session,
            actor=actor,
            quarantine_id=quarantine_id,
            status=item_status,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="quarantine item not found") from exc
    except QuarantineTransitionError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _response(item)


async def _heartbeat_stream() -> AsyncIterator[str]:
    while True:
        yield "event: heartbeat\ndata: {}\n\n"
        await asyncio.sleep(15)


def _response(item: QuarantineQueue) -> QuarantineResponse:
    return QuarantineResponse(
        id=str(item.id),
        scan_id=str(item.scan_id),
        sender_user_id=str(item.sender_user_id),
        recipients=item.recipients,
        subject=item.subject,
        severity=item.severity,
        status=item.status,
    )
