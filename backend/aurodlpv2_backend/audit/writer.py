"""Append-only audit event writer.

Must run inside the **same DB transaction** as the originating mutation.

Schema (``docs/plans/backend.md`` §12): partitioned table with row-level
SHA-256 chain via ``compute_audit_hash()`` BEFORE INSERT trigger and
``block_audit_mutation()`` BEFORE UPDATE OR DELETE trigger.

DB role used by the app has UPDATE/DELETE revoked on ``audit_events``.
"""

from __future__ import annotations

from collections.abc import Mapping
from uuid import UUID

from sqlalchemy import insert
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.db.models import ActorType, AuditCategory, AuditEvent


async def write_event(
    *,
    session: AsyncSession,
    workspace_id: UUID,
    actor_type: ActorType,
    actor_id: str | None,
    actor_email: str | None,
    action: str,
    category: AuditCategory,
    resource_type: str | None,
    resource_id: str | None,
    before_state: Mapping[str, object] | None = None,
    after_state: Mapping[str, object] | None = None,
    metadata: Mapping[str, object] | None = None,
) -> None:
    await session.execute(
        insert(AuditEvent).values(
            workspace_id=workspace_id,
            actor_type=actor_type,
            actor_id=actor_id or "system",
            actor_email=actor_email,
            action=action,
            category=category,
            resource_type=resource_type,
            resource_id=resource_id,
            before_state=dict(before_state) if before_state is not None else None,
            after_state=dict(after_state) if after_state is not None else None,
            event_metadata=dict(metadata) if metadata is not None else None,
        )
    )
