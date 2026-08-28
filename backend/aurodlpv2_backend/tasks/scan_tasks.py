"""Celery tasks for queued attachment scans.

The worker reads attachment bytes from the blob store, not from a local path.
The previous version passed a filesystem path through the database, which only
worked when the API and the worker happened to share a disk.
"""

# pyright: reportUnknownMemberType=false, reportUntypedFunctionDecorator=false

from __future__ import annotations

import tempfile
from collections.abc import Generator
from contextlib import contextmanager
from decimal import Decimal
from functools import lru_cache
from pathlib import Path
from uuid import UUID

import structlog
from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload
from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from aurodlpv2_backend.db.models import AttachmentScan
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.storage import BlobNotFoundError, get_store
from aurodlpv2_backend.tasks.celery_app import celery_app

logger = structlog.get_logger(__name__)

MAX_RETRIES = 3


@lru_cache(maxsize=1)
def _sync_engine() -> Engine:
    return create_engine(get_settings().database_sync_url, pool_pre_ping=True)


@contextmanager
def _materialized(data: bytes, filename: str) -> Generator[Path]:
    """The detection engine reads from a path, so stage the bytes and delete."""
    settings = get_settings()
    settings.attachment_temp_dir.mkdir(parents=True, exist_ok=True)
    # Closed by the `with handle:` below and unlinked in `finally`; the
    # handle is created detached so the path survives the close.
    handle = tempfile.NamedTemporaryFile(  # noqa: SIM115
        mode="wb",
        suffix=Path(filename).suffix[:20],
        prefix="queued-",
        dir=settings.attachment_temp_dir,
        delete=False,
    )
    path = Path(handle.name)
    try:
        with handle:
            handle.write(data)
        yield path
    finally:
        path.unlink(missing_ok=True)


@celery_app.task(
    name="aurodlpv2.scan.process_attachment",
    bind=True,
    max_retries=MAX_RETRIES,
    default_retry_delay=15,
)
def process_attachment_scan(self: object, attachment_scan_id: str) -> None:
    scan_id = UUID(attachment_scan_id)
    store = get_store()

    with Session(_sync_engine()) as session:
        row = session.get(AttachmentScan, scan_id)
        if row is None:
            logger.warning("queued attachment scan row missing", scan_id=attachment_scan_id)
            return
        if row.status != "queued":
            return
        if not row.storage_path:
            row.status = "failed"
            row.error = "queued attachment missing storage key"
            session.commit()
            return

        storage_key = row.storage_path
        try:
            data = store.get(storage_key)
        except BlobNotFoundError:
            row.status = "failed"
            row.error = "queued attachment blob is gone"
            row.storage_path = None
            session.commit()
            return

        try:
            with _materialized(data, row.filename) as path:
                result = detect_email(
                    EmailPayload(
                        attachments=[
                            Attachment(
                                id=row.attachment_id,
                                filename=row.filename,
                                mime_type=row.mime_type,
                                size_bytes=row.size_bytes,
                                sha256=row.sha256,
                                local_path=str(path),
                            )
                        ]
                    )
                )
            row.status = "scanned"
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
            if result.extraction_errors and not row.entities:
                row.status = "failed"
                row.error = "; ".join(result.extraction_errors[:3])
        except Exception as exc:
            logger.warning("queued attachment scan failed", scan_id=attachment_scan_id)
            row.status = "failed"
            row.error = str(exc)[:500]
        finally:
            # The raw file is deleted whether the scan worked or not: it is
            # patient data and it has no reason to outlive the attempt.
            store.delete(storage_key)
            row.storage_path = None
            session.commit()
