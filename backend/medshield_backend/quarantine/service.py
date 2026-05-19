"""Quarantine state machine."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from medshield_backend.audit.writer import write_event
from medshield_backend.db.models import QuarantineQueue, QuarantineStatus
from medshield_backend.deps import Principal

OVERRIDE_WINDOW_SECONDS = 300


class QuarantineTransitionError(ValueError):
    pass


async def transition(
    *,
    session: AsyncSession,
    actor: Principal,
    quarantine_id: UUID,
    status: QuarantineStatus,
) -> QuarantineQueue:
    if status == "pending":
        raise QuarantineTransitionError("cannot transition to pending")
    item = await session.scalar(
        select(QuarantineQueue).where(
            QuarantineQueue.id == quarantine_id,
            QuarantineQueue.workspace_id == actor.workspace_id,
        )
    )
    if item is None:
        raise LookupError("quarantine item not found")
    if item.status != "pending":
        raise QuarantineTransitionError("quarantine item is already closed")

    before_status = item.status
    item.status = status
    item.reviewed_by = actor.user_id
    item.reviewed_at = datetime.now(UTC)
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action=f"quarantine.{status}",
        category="quarantine",
        resource_type="quarantine",
        resource_id=str(item.id),
        before_state={"status": before_status},
        after_state={"status": item.status, "reviewed_by": str(actor.user_id)},
    )
    await session.commit()
    return item


def can_override_quarantine(item: QuarantineQueue, *, now: datetime | None = None) -> bool:
    checked_at = now or datetime.now(UTC)
    if item.status != "approved" or item.reviewed_at is None:
        return False
    return (checked_at - item.reviewed_at).total_seconds() <= OVERRIDE_WINDOW_SECONDS
