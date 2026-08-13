"""PostgreSQL-backed attachment worker with lease recovery and fenced completion."""

from __future__ import annotations

import os
import secrets
import signal
import socket
import tempfile
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from types import FrameType
from uuid import UUID

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload, ScanResult
from sqlalchemy import and_, create_engine, or_, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from aurodlpv2_backend.db.models import AttachmentScan, AttachmentScanJob
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.storage.objects import ObjectStore, get_object_store


@dataclass(frozen=True, slots=True)
class ClaimedJob:
    job_id: UUID
    attachment_scan_id: UUID
    attempt: int
    phase: str
    worker_id: str
    storage_key: str
    attachment_id: str
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str


@lru_cache(maxsize=1)
def _sync_engine() -> Engine:
    return create_engine(get_settings().database_sync_url, pool_pre_ping=True)


def _claim_job(worker_id: str) -> ClaimedJob | None:
    settings = get_settings()
    now = datetime.now(UTC)
    stale_before = now - timedelta(seconds=settings.scan_worker_lease_seconds)
    with Session(_sync_engine()) as session:
        job = session.scalar(
            select(AttachmentScanJob)
            .where(
                or_(
                    and_(
                        AttachmentScanJob.status == "pending",
                        AttachmentScanJob.available_at <= now,
                    ),
                    and_(
                        AttachmentScanJob.status == "processing",
                        AttachmentScanJob.locked_at <= stale_before,
                    ),
                )
            )
            .order_by(AttachmentScanJob.available_at, AttachmentScanJob.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if job is None:
            return None
        row = session.get(AttachmentScan, job.attachment_scan_id)
        if row is None or not row.storage_key:
            job.status = "failed"
            job.last_error = "staged attachment unavailable"
            job.completed_at = now
            if row is not None:
                row.status = "failed"
                row.error = "staged attachment unavailable"
            session.commit()
            return None

        job.status = "processing"
        job.attempts += 1
        job.locked_at = now
        job.locked_by = worker_id
        claimed = ClaimedJob(
            job_id=job.id,
            attachment_scan_id=row.id,
            attempt=job.attempts,
            phase=job.phase,
            worker_id=worker_id,
            storage_key=row.storage_key,
            attachment_id=row.attachment_id,
            filename=row.filename,
            mime_type=row.mime_type,
            size_bytes=row.size_bytes,
            sha256=row.sha256,
        )
        session.commit()
        return claimed


def _job_is_owned(job: AttachmentScanJob, claimed: ClaimedJob) -> bool:
    return (
        job.status == "processing"
        and job.locked_by == claimed.worker_id
        and job.attempts == claimed.attempt
    )


def _schedule_cleanup(
    claimed: ClaimedJob,
    *,
    result: ScanResult | None = None,
    error: str | None = None,
) -> None:
    now = datetime.now(UTC)
    with Session(_sync_engine()) as session:
        job = session.get(AttachmentScanJob, claimed.job_id, with_for_update=True)
        row = session.get(AttachmentScan, claimed.attachment_scan_id, with_for_update=True)
        if job is None or row is None or not _job_is_owned(job, claimed):
            return

        if result is not None and error is None:
            row.severity = result.severity
            row.risk_score = Decimal(str(result.risk_score))
            row.entities = [
                entity.model_dump(
                    include={"type", "masked_value", "confidence", "source", "attachment_id"},
                    exclude_none=True,
                )
                for entity in result.entities
            ]
            row.extraction_errors = result.extraction_errors
            row.error = None
        else:
            row.error = error or "attachment detection failed"

        job.phase = "cleanup"
        job.status = "pending"
        job.available_at = now
        job.locked_at = None
        job.locked_by = None
        job.last_error = error
        session.commit()


def _retry_or_schedule_failure(claimed: ClaimedJob) -> None:
    settings = get_settings()
    if claimed.attempt >= settings.scan_worker_max_attempts:
        _schedule_cleanup(claimed, error="attachment detection failed")
        return

    delay_seconds = min(300, 2 ** min(claimed.attempt, 8))
    with Session(_sync_engine()) as session:
        job = session.get(AttachmentScanJob, claimed.job_id, with_for_update=True)
        if job is None or not _job_is_owned(job, claimed):
            return
        job.status = "pending"
        job.available_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
        job.locked_at = None
        job.locked_by = None
        job.last_error = "attachment detection failed"
        session.commit()


def _retry_cleanup(claimed: ClaimedJob) -> None:
    delay_seconds = min(300, 2 ** min(claimed.attempt, 8))
    with Session(_sync_engine()) as session:
        job = session.get(AttachmentScanJob, claimed.job_id, with_for_update=True)
        if job is None or not _job_is_owned(job, claimed):
            return
        job.phase = "cleanup"
        job.status = "pending"
        job.available_at = datetime.now(UTC) + timedelta(seconds=delay_seconds)
        job.locked_at = None
        job.locked_by = None
        job.last_error = "staged attachment cleanup failed"
        session.commit()


def _finalize_cleanup(claimed: ClaimedJob) -> None:
    now = datetime.now(UTC)
    with Session(_sync_engine()) as session:
        job = session.get(AttachmentScanJob, claimed.job_id, with_for_update=True)
        row = session.get(AttachmentScan, claimed.attachment_scan_id, with_for_update=True)
        if job is None or row is None or not _job_is_owned(job, claimed):
            return
        row.storage_key = None
        row.storage_path = None
        if row.error:
            row.status = "failed"
            job.status = "failed"
        else:
            row.status = "scanned"
            job.status = "completed"
        job.completed_at = now
        job.locked_at = None
        job.locked_by = None
        job.last_error = row.error
        session.commit()


def _run_scan(claimed: ClaimedJob, store: ObjectStore) -> None:
    settings = get_settings()
    settings.attachment_temp_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(claimed.filename).suffix[:20]
    with tempfile.NamedTemporaryFile(
        suffix=suffix,
        prefix="worker-scan-",
        dir=settings.attachment_temp_dir,
        delete=False,
    ) as temporary:
        path = Path(temporary.name)
    try:
        store.download_to(claimed.storage_key, path)
        result = detect_email(
            EmailPayload(
                attachments=[
                    Attachment(
                        id=claimed.attachment_id,
                        filename=claimed.filename,
                        mime_type=claimed.mime_type,
                        size_bytes=claimed.size_bytes,
                        sha256=claimed.sha256,
                        local_path=str(path),
                    )
                ]
            )
        )
        if result.extraction_errors:
            _schedule_cleanup(claimed, error="attachment extraction failed")
        else:
            _schedule_cleanup(claimed, result=result)
    except Exception:
        _retry_or_schedule_failure(claimed)
    finally:
        path.unlink(missing_ok=True)


def process_next_job(*, worker_id: str, store: ObjectStore | None = None) -> bool:
    resolved_store = store or get_object_store()
    claimed = _claim_job(worker_id)
    if claimed is None:
        return False
    if claimed.phase == "cleanup":
        try:
            resolved_store.delete(claimed.storage_key)
        except Exception:
            _retry_cleanup(claimed)
        else:
            _finalize_cleanup(claimed)
        return True
    _run_scan(claimed, resolved_store)
    return True


def _worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}:{secrets.token_hex(4)}"


def main() -> None:
    settings = get_settings()
    store = get_object_store()
    store.ensure_bucket()
    stopped = False

    def stop(_signal_number: int, _frame: FrameType | None) -> None:
        nonlocal stopped
        stopped = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    worker_id = _worker_id()
    while not stopped:
        worked = process_next_job(worker_id=worker_id, store=store)
        if not worked:
            time.sleep(settings.scan_worker_poll_seconds)
