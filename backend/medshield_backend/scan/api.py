"""Scan endpoints called by the Chrome extension."""

from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, HTTPException, UploadFile, status

from medshield_backend.deps import CurrentUser, DbSession
from medshield_backend.scan import service
from medshield_backend.scan.schemas import (
    AttachmentScanResponse,
    ScanEmailRequest,
    ScanFinalizeRequest,
    ScanStatusResponse,
    Verdict,
)
from medshield_backend.scan.temp_files import (
    AttachmentTooLargeError,
    MimeDetectionError,
    delete_temp_file,
    receive_attachment,
)
from medshield_backend.settings import get_settings

router = APIRouter()


@router.post("/email")
async def scan_email(
    payload: ScanEmailRequest,
    session: DbSession,
    user: CurrentUser,
) -> Verdict:
    return await service.scan_email(session=session, actor=user, payload=payload)


@router.post("/attachment")
async def scan_attachment(
    file: UploadFile,
    session: DbSession,
    user: CurrentUser,
) -> AttachmentScanResponse:
    settings = get_settings()
    try:
        received = await receive_attachment(
            file,
            settings.attachment_temp_dir,
            max_bytes=settings.attachment_max_bytes,
        )
    except AttachmentTooLargeError as exc:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)) from exc
    except MimeDetectionError as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="MIME detection is unavailable",
        ) from exc

    deep_scan = service.should_deep_scan(
        size_bytes=received.size_bytes,
        threshold_bytes=settings.attachment_deep_scan_threshold,
        mime_type=received.mime_type,
    )
    try:
        if deep_scan:
            return await service.queue_attachment_scan(
                session=session,
                actor=user,
                filename=received.filename,
                size_bytes=received.size_bytes,
                mime_type=received.mime_type,
                path=received.path,
            )
        return await service.scan_attachment_stub(
            session=session,
            actor=user,
            filename=received.filename,
            size_bytes=received.size_bytes,
            mime_type=received.mime_type,
        )
    finally:
        if not deep_scan:
            await delete_temp_file(received.path)


@router.get("/{scan_id}")
async def get_scan(
    scan_id: UUID,
    session: DbSession,
    user: CurrentUser,
) -> ScanStatusResponse:
    try:
        return await service.get_scan_status(session=session, actor=user, scan_id=scan_id)
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="scan not found") from exc


@router.post("/{scan_id}/finalize")
async def finalize_scan(
    scan_id: UUID,
    payload: ScanFinalizeRequest,
    session: DbSession,
    user: CurrentUser,
) -> Verdict:
    try:
        return await service.finalize_scan(
            session=session,
            actor=user,
            scan_id=scan_id,
            payload=payload,
        )
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="scan not found") from exc
