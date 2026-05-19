"""Celery beat: daily audit-log hash-chain verifier."""

from __future__ import annotations

import asyncio

from sqlalchemy import text

from aurodlpv2_backend.celery_app import celery_task
from aurodlpv2_backend.db.session import get_session_factory


@celery_task(name="aurodlpv2.audit.verify_chain")
def verify_chain() -> dict[str, str | int]:
    return asyncio.run(_verify_chain())


async def _verify_chain() -> dict[str, str | int]:
    async with get_session_factory()() as session:
        broken_count = await session.scalar(
            text(
                """
                WITH ordered AS (
                  SELECT
                    workspace_id,
                    occurred_at,
                    id,
                    prev_hash,
                    lag(row_hash) OVER (
                      PARTITION BY workspace_id ORDER BY occurred_at, id
                    ) AS expected_prev_hash
                  FROM audit_events
                )
                SELECT count(*)
                FROM ordered
                WHERE prev_hash IS DISTINCT FROM expected_prev_hash
                """
            )
        )
        checked_count = await session.scalar(text("SELECT count(*) FROM audit_events"))
    broken = int(broken_count or 0)
    return {
        "status": "ok" if broken == 0 else "failed",
        "checked_rows": int(checked_count or 0),
        "broken_links": broken,
    }
