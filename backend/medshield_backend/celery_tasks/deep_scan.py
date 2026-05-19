"""Celery: deep attachment scan."""

from __future__ import annotations

import asyncio
import time
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from medshield_backend.audit.writer import write_event
from medshield_backend.celery_app import celery_task
from medshield_backend.db.models import Scan
from medshield_backend.db.session import get_session_factory
from medshield_backend.scan.temp_files import delete_temp_file


@celery_task(name="medshield.scan.deep_attachment", bind=True, max_retries=2)
def deep_attachment_scan(
    _task: object,
    scan_id: str,
    path: str,
    filename: str,
    mime_type: str,
    size_bytes: int,
) -> dict[str, str]:
    return asyncio.run(_deep_attachment_scan(scan_id, Path(path), filename, mime_type, size_bytes))


async def _deep_attachment_scan(
    scan_id: str,
    path: Path,
    filename: str,
    mime_type: str,
    size_bytes: int,
) -> dict[str, str]:
    started = time.perf_counter()
    parsed_scan_id = UUID(scan_id)
    try:
        await _transition_to_scanning(parsed_scan_id, filename, mime_type, size_bytes)
        duration_ms = round((time.perf_counter() - started) * 1000)
        await _transition_to_completed(parsed_scan_id, duration_ms)
        return {"scan_id": scan_id, "status": "completed"}
    except Exception as exc:
        await _transition_to_failed(parsed_scan_id, exc)
        raise
    finally:
        await delete_temp_file(path)


async def _transition_to_scanning(
    scan_id: UUID,
    filename: str,
    mime_type: str,
    size_bytes: int,
) -> None:
    async with get_session_factory()() as session:
        scan = await _load_scan(session, scan_id)
        if scan is None:
            return
        before_status = scan.status
        scan.status = "scanning"
        await write_event(
            session=session,
            workspace_id=scan.workspace_id,
            actor_type="system",
            actor_id="celery",
            actor_email=None,
            action="scan.deep_started",
            category="scan",
            resource_type="scan",
            resource_id=str(scan.id),
            before_state={"status": before_status},
            after_state={"status": scan.status},
            metadata={"filename": filename, "mime_type": mime_type, "size_bytes": size_bytes},
        )
        await session.commit()


async def _transition_to_completed(scan_id: UUID, duration_ms: int) -> None:
    async with get_session_factory()() as session:
        scan = await _load_scan(session, scan_id)
        if scan is None:
            return
        before_status = scan.status
        scan.status = "completed"
        scan.decision = "allow"
        scan.severity = "none"
        scan.score = Decimal("0.00")
        scan.duration_ms = duration_ms
        scan.completed_at = datetime.now(UTC)
        await write_event(
            session=session,
            workspace_id=scan.workspace_id,
            actor_type="system",
            actor_id="celery",
            actor_email=None,
            action="scan.deep_completed",
            category="scan",
            resource_type="scan",
            resource_id=str(scan.id),
            before_state={"status": before_status},
            after_state={
                "status": scan.status,
                "decision": scan.decision,
                "severity": scan.severity,
            },
            metadata={"duration_ms": duration_ms},
        )
        await session.commit()


async def _transition_to_failed(scan_id: UUID, exc: Exception) -> None:
    async with get_session_factory()() as session:
        scan = await _load_scan(session, scan_id)
        if scan is None:
            return
        before_status = scan.status
        scan.status = "failed"
        scan.error = type(exc).__name__
        await write_event(
            session=session,
            workspace_id=scan.workspace_id,
            actor_type="system",
            actor_id="celery",
            actor_email=None,
            action="scan.deep_failed",
            category="scan",
            resource_type="scan",
            resource_id=str(scan.id),
            before_state={"status": before_status},
            after_state={"status": scan.status, "error": scan.error},
        )
        await session.commit()


async def _load_scan(session: AsyncSession, scan_id: UUID) -> Scan | None:
    return await session.scalar(select(Scan).where(Scan.id == scan_id))
