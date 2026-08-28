"""Run the detection engine without blocking the event loop.

``detect_email`` is synchronous and CPU-bound: spaCy plus regex work over the
whole message. Calling it directly inside an async handler stalls every other
request in that worker for the duration, health checks included. It runs in a
worker thread here, bounded by a semaphore so a burst of large attachments
cannot spawn unbounded threads.
"""

from __future__ import annotations

import asyncio
import tempfile
from collections.abc import Generator
from contextlib import contextmanager
from pathlib import Path

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload, ScanResult

from aurodlpv2_backend.settings import get_settings

_semaphore: asyncio.Semaphore | None = None
_semaphore_limit: int | None = None


def _get_semaphore() -> asyncio.Semaphore:
    """Lazily built so the limit is read after settings are loaded."""
    global _semaphore, _semaphore_limit  # noqa: PLW0603 - process-wide by design
    limit = get_settings().scan_max_concurrency
    if _semaphore is None or _semaphore_limit != limit:
        _semaphore = asyncio.Semaphore(limit)
        _semaphore_limit = limit
    return _semaphore


async def run_detection(payload: EmailPayload) -> ScanResult:
    """Detect in a worker thread, bounded by scan_max_concurrency."""
    async with _get_semaphore():
        return await asyncio.to_thread(detect_email, payload)


async def scan_text(subject: str, body: str, recipients: list[str]) -> ScanResult:
    return await run_detection(
        EmailPayload(subject=subject, body=body, recipients=recipients, attachments=[])
    )


async def scan_attachment_bytes(
    data: bytes,
    *,
    attachment_id: str,
    filename: str,
    mime_type: str,
    sha256: str,
) -> ScanResult:
    """Write bytes to a private temp file, scan, then delete unconditionally."""
    with _temporary_attachment(data, filename) as path:
        return await run_detection(
            EmailPayload(
                attachments=[
                    Attachment(
                        id=attachment_id,
                        filename=filename,
                        mime_type=mime_type,
                        size_bytes=len(data),
                        sha256=sha256,
                        local_path=str(path),
                    )
                ]
            )
        )


@contextmanager
def _temporary_attachment(data: bytes, filename: str) -> Generator[Path]:
    settings = get_settings()
    settings.attachment_temp_dir.mkdir(parents=True, exist_ok=True)
    # Closed by the `with handle:` below and unlinked in `finally`; the
    # handle is created detached so the path survives the close.
    handle = tempfile.NamedTemporaryFile(  # noqa: SIM115
        mode="wb",
        suffix=Path(filename).suffix[:20],
        prefix="scan-",
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
