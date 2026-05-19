"""Celery beat: expire pending quarantine items past TTL."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

from sqlalchemy import select

from aurodlpv2_backend.audit.writer import write_event
from aurodlpv2_backend.celery_app import celery_task
from aurodlpv2_backend.db.models import QuarantineQueue
from aurodlpv2_backend.db.session import get_session_factory


@celery_task(name="aurodlpv2.quarantine.expire_pending")
def expire_pending() -> int:
    return asyncio.run(_expire_pending())


async def _expire_pending() -> int:
    now = datetime.now(UTC)
    expired_count = 0
    async with get_session_factory()() as session:
        rows = await session.scalars(
            select(QuarantineQueue).where(
                QuarantineQueue.status == "pending",
                QuarantineQueue.expires_at <= now,
            )
        )
        for item in rows:
            item.status = "expired"
            expired_count += 1
            await write_event(
                session=session,
                workspace_id=item.workspace_id,
                actor_type="system",
                actor_id="celery",
                actor_email=None,
                action="quarantine.expired",
                category="quarantine",
                resource_type="quarantine",
                resource_id=str(item.id),
                before_state={"status": "pending"},
                after_state={"status": "expired"},
            )
        await session.commit()
    return expired_count
