"""Org-scoped scanning and server-side policy decisions."""

from __future__ import annotations

import asyncio
import hashlib
import json
import tempfile
from collections.abc import Iterable
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Annotated, Literal, cast
from uuid import UUID

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload
from aurodlpv2_detection.models import Entity as DetectionEntity
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import (
    ApprovedDomain,
    AttachmentScan,
    AttachmentScanJob,
    EventAction,
    EventSeverity,
    Organization,
    QuarantineItem,
    ScanEvent,
)
from aurodlpv2_backend.deps import DbSession, ExtensionActor, ExtensionPrincipal
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.storage.objects import ObjectStorageError, get_object_store
from aurodlpv2_backend.utils.uuid import uuid7

router = APIRouter()

RecipientClass = Literal[
    "internal",
    "approved_partner",
    "blocked",
    "external",
    "public_email",
    "unknown",
]
AttachmentStatus = Literal["scanned", "queued", "failed"]
HIGH_RISK_QUARANTINE_SCORE = 80
WARN_RISK_SCORE = 50
QUARANTINE_RELEASE_TTL = timedelta(minutes=5)
UPLOAD_READ_CHUNK_BYTES = 64 * 1024

_SEVERITY_RANK: dict[str, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}
_HIGH_RISK_ENTITY_TYPES = {"IN_AADHAAR", "IN_PAN", "ABHA", "ABHA_ID"}
_PUBLIC_EMAIL_DOMAINS = {
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "outlook.com",
    "hotmail.com",
    "live.com",
    "icloud.com",
    "proton.me",
    "protonmail.com",
}


class EntityHit(BaseModel):
    type: str
    masked_value: str
    confidence: float = Field(ge=0, le=1)
    source: Literal["body", "subject", "attachment"]
    attachment_id: str | None = None


class RecipientHit(BaseModel):
    email: str
    classification: RecipientClass


class Verdict(BaseModel):
    scan_id: str
    action: EventAction
    severity: EventSeverity
    risk_score: float
    matched_policy_ids: list[str]
    entities: list[EntityHit]
    recipients: list[RecipientHit]
    user_message: str
    created_at: str
    quarantine_id: str | None = None
    degraded: bool = False


class ScanEmailRequest(BaseModel):
    org_code: str = Field(min_length=3, max_length=128)
    client_scan_id: str = Field(min_length=4, max_length=128)
    subject: str = Field(default="", max_length=5000)
    body: str = Field(default="", max_length=1_000_000)
    recipients: list[EmailStr] = Field(default_factory=list, max_length=200)
    user_email: EmailStr | None = None

    @field_validator("org_code")
    @classmethod
    def normalize_org_code(cls, value: str) -> str:
        return value.strip().upper()

    @field_validator("client_scan_id")
    @classmethod
    def normalize_client_scan_id(cls, value: str) -> str:
        return value.strip()


def _empty_attachment_scan_ids() -> list[UUID]:
    return []


class ScanFinalizeRequest(ScanEmailRequest):
    attachment_scan_ids: list[UUID] = Field(
        default_factory=_empty_attachment_scan_ids,
        max_length=50,
    )
    approved_quarantine_id: UUID | None = None

    @field_validator("attachment_scan_ids")
    @classmethod
    def reject_duplicate_attachment_scans(cls, value: list[UUID]) -> list[UUID]:
        if len(value) != len(set(value)):
            raise ValueError("duplicate attachment scan id")
        return value


class AttachmentScanResponse(BaseModel):
    attachment_scan_id: str
    status: AttachmentStatus
    verdict: Verdict | None = None
    error: str | None = None


@dataclass(frozen=True, slots=True)
class AttachmentScanForm:
    org_code: str
    client_scan_id: str
    attachment_id: str


def attachment_scan_form(
    org_code: Annotated[str, Form(..., min_length=3, max_length=128)],
    client_scan_id: Annotated[str, Form(..., min_length=4, max_length=128)],
    attachment_id: Annotated[str, Form(..., min_length=1, max_length=128)],
) -> AttachmentScanForm:
    return AttachmentScanForm(
        org_code=org_code,
        client_scan_id=client_scan_id,
        attachment_id=attachment_id,
    )


AttachmentForm = Annotated[AttachmentScanForm, Depends(attachment_scan_form)]


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    action: EventAction
    severity: EventSeverity
    risk_score: float
    matched_policy_ids: list[str]
    user_message: str


async def _resolve_org(
    session: AsyncSession,
    org_code: str,
    extension: ExtensionActor,
) -> Organization:
    if org_code.strip().upper() != extension.org_code:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="unknown org code")
    org = await session.get(Organization, extension.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="unknown organization")
    return org


def _domain(email: str) -> str:
    value = email.strip().lower()
    if "<" in value and ">" in value:
        value = value.replace("<", " ").replace(">", " ").split()[-1]
    at = value.rfind("@")
    return value[at + 1 :] if at >= 0 else ""


def _addr(email: str) -> str:
    value = email.strip().lower()
    if "<" in value and ">" in value:
        value = value.replace("<", " ").replace(">", " ").split()[-1]
    return value


def _domain_matches(candidate: str, configured: str) -> bool:
    return candidate == configured or candidate.endswith(f".{configured}")


async def _classify_recipients(
    session: AsyncSession,
    org_id: UUID,
    recipients: Iterable[str],
) -> list[RecipientHit]:
    normalized = [_addr(str(recipient)) for recipient in recipients if _addr(str(recipient))]
    domains = (
        await session.scalars(
            select(ApprovedDomain).where(
                ApprovedDomain.org_id == org_id,
                ApprovedDomain.direction.in_(("recipient", "both")),
            )
        )
    ).all()
    hits: list[RecipientHit] = []
    for email in normalized:
        recipient_domain = _domain(email)
        classification: RecipientClass = "unknown" if not recipient_domain else "external"
        if recipient_domain in _PUBLIC_EMAIL_DOMAINS:
            classification = "public_email"
        for configured in domains:
            configured_value = configured.domain.lower()
            configured_match = (
                email == configured_value
                if "@" in configured_value
                else _domain_matches(recipient_domain, configured_value)
            )
            if not configured_match:
                continue
            if configured.classification == "blocked":
                classification = "blocked"
                break
            if configured.classification == "internal":
                classification = "internal"
            else:
                classification = "approved_partner"
        hits.append(RecipientHit(email=email, classification=classification))
    return hits


def _entity_hit(raw: DetectionEntity | dict[str, object]) -> EntityHit:
    data = cast(dict[str, object], raw.model_dump()) if isinstance(raw, DetectionEntity) else raw
    source_raw = data.get("source")
    if source_raw not in {"body", "subject", "attachment"}:
        raise ValueError("unsupported entity source")
    source = cast(Literal["body", "subject", "attachment"], source_raw)
    confidence_raw = data.get("confidence", 0)
    confidence = confidence_raw if isinstance(confidence_raw, int | float | str) else 0
    attachment_id = data.get("attachment_id")
    return EntityHit(
        type=str(data.get("type", "")),
        masked_value=str(data.get("masked_value", "")),
        confidence=float(confidence),
        source=source,
        attachment_id=str(attachment_id) if attachment_id else None,
    )


def _max_severity(values: Iterable[str]) -> EventSeverity:
    severity = "none"
    for value in values:
        if _SEVERITY_RANK.get(value, 0) > _SEVERITY_RANK[severity]:
            severity = value
    return severity  # type: ignore[return-value]


def _policy_decision(
    *,
    entities: list[EntityHit],
    recipients: list[RecipientHit],
    detected_severity: EventSeverity,
    detected_risk_score: float,
) -> PolicyDecision:
    blocked = [recipient.email for recipient in recipients if recipient.classification == "blocked"]
    if blocked:
        return PolicyDecision(
            action="block",
            severity=_max_severity([detected_severity, "high"]),
            risk_score=max(detected_risk_score, 90),
            matched_policy_ids=["blocked-recipient-domain"],
            user_message="One or more recipients are on the blocked domain list.",
        )

    if not entities:
        return PolicyDecision(
            action="allow",
            severity="none",
            risk_score=0,
            matched_policy_ids=[],
            user_message="No sensitive health data was detected.",
        )

    approved_classes = {"internal", "approved_partner"}
    if recipients and all(recipient.classification in approved_classes for recipient in recipients):
        types = ", ".join(sorted({entity.type for entity in entities}))
        return PolicyDecision(
            action="allow",
            severity=detected_severity,
            risk_score=detected_risk_score,
            matched_policy_ids=["approved-recipient-phi"],
            user_message=f"Sensitive data detected ({types}) but all recipients are approved.",
        )

    entity_types = {entity.type for entity in entities}
    high_risk_entities = bool(entity_types & _HIGH_RISK_ENTITY_TYPES)
    external_recipients = [
        recipient.email
        for recipient in recipients
        if recipient.classification not in approved_classes
    ]
    if external_recipients and (
        detected_severity in {"high", "critical"}
        or detected_risk_score >= HIGH_RISK_QUARANTINE_SCORE
        or high_risk_entities
    ):
        types = ", ".join(sorted(entity_types))
        return PolicyDecision(
            action="quarantine",
            severity=_max_severity([detected_severity, "high"]),
            risk_score=max(detected_risk_score, 85),
            matched_policy_ids=["external-high-risk-phi-quarantine"],
            user_message=(
                f"Sensitive data detected ({types}) for unapproved external recipients. "
                "The message is quarantined for review."
            ),
        )

    warning_severity = detected_severity in {"medium", "high", "critical"}
    if detected_risk_score >= WARN_RISK_SCORE or warning_severity:
        types = ", ".join(sorted(entity_types))
        return PolicyDecision(
            action="warn",
            severity=_max_severity([detected_severity, "medium"]),
            risk_score=max(detected_risk_score, 50),
            matched_policy_ids=["external-phi-warning"],
            user_message=(
                f"Potential sensitive data detected ({types}) for recipients outside "
                "the approved list."
            ),
        )

    return PolicyDecision(
        action="warn",
        severity="low",
        risk_score=max(detected_risk_score, 25),
        matched_policy_ids=["low-confidence-phi-warning"],
        user_message="Low-confidence sensitive data was detected. Review before sending.",
    )


def _build_verdict(
    *,
    entities: list[EntityHit],
    recipients: list[RecipientHit],
    detected_severity: EventSeverity,
    detected_risk_score: float,
    quarantine_id: UUID | None = None,
) -> Verdict:
    decision = _policy_decision(
        entities=entities,
        recipients=recipients,
        detected_severity=detected_severity,
        detected_risk_score=detected_risk_score,
    )
    return Verdict(
        scan_id=str(uuid7()),
        action=decision.action,
        severity=decision.severity,
        risk_score=round(decision.risk_score, 2),
        matched_policy_ids=decision.matched_policy_ids,
        entities=entities,
        recipients=recipients,
        user_message=decision.user_message,
        created_at=datetime.now(UTC).isoformat(),
        quarantine_id=str(quarantine_id) if quarantine_id else None,
    )


def _unavailable_verdict(
    *,
    recipients: list[RecipientHit],
    policy_id: str,
    user_message: str,
    entities: list[EntityHit] | None = None,
) -> Verdict:
    return Verdict(
        scan_id=str(uuid7()),
        action="block",
        severity="critical",
        risk_score=100,
        matched_policy_ids=[policy_id],
        entities=entities or [],
        recipients=recipients,
        user_message=user_message,
        created_at=datetime.now(UTC).isoformat(),
        degraded=True,
    )


def _content_digest(
    *,
    sender: str,
    subject: str,
    body: str,
    recipients: list[str],
    attachment_rows: list[AttachmentScan],
) -> str:
    attachment_manifest = sorted(
        (
            {
                "filename": row.filename,
                "mime_type": row.mime_type.lower(),
                "sha256": row.sha256.lower(),
                "size_bytes": row.size_bytes,
            }
            for row in attachment_rows
        ),
        key=lambda item: (
            str(item["sha256"]),
            str(item["filename"]),
            str(item["mime_type"]),
            int(item["size_bytes"]),
        ),
    )
    canonical = json.dumps(
        {
            "attachments": attachment_manifest,
            "body": body,
            "recipients": sorted({_addr(recipient) for recipient in recipients}),
            "sender": _addr(sender),
            "subject": subject,
        },
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


async def _record_scan_event(
    session: AsyncSession,
    *,
    org_id: UUID,
    client_event_id: str,
    verdict: Verdict,
    user_email: str,
    content_digest: str,
) -> ScanEvent:
    existing = await session.scalar(
        select(ScanEvent).where(
            ScanEvent.org_id == org_id,
            ScanEvent.client_event_id == client_event_id,
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="scan id already finalized")

    event = ScanEvent(
        client_event_id=client_event_id,
        content_digest=content_digest,
        org_id=org_id,
        user_email=user_email,
        action=verdict.action,
        severity=verdict.severity,
        risk_score=verdict.risk_score,
        entities=[entity.model_dump(exclude_none=True) for entity in verdict.entities],
        recipients=[recipient.email for recipient in verdict.recipients],
        event_time=datetime.now(UTC),
    )
    session.add(event)
    await session.flush()
    return event


async def _record_quarantine(
    session: AsyncSession,
    *,
    org_id: UUID,
    scan_event_id: UUID | None,
    client_scan_id: str,
    sender: str,
    subject: str,
    verdict: Verdict,
    attachment_rows: list[AttachmentScan],
    content_digest: str,
) -> QuarantineItem:
    item = QuarantineItem(
        org_id=org_id,
        scan_event_id=scan_event_id,
        scan_id=verdict.scan_id,
        client_scan_id=client_scan_id,
        content_digest=content_digest,
        sender=sender,
        subject=subject[:500],
        recipients=[recipient.email for recipient in verdict.recipients],
        entities=[entity.model_dump(exclude_none=True) for entity in verdict.entities],
        matched_policy_ids=verdict.matched_policy_ids,
        risk_score=verdict.risk_score,
        severity=verdict.severity,
        status="pending",
        attachment_refs=[
            {
                "attachment_scan_id": str(row.id),
                "attachment_id": row.attachment_id,
                "filename": row.filename,
                "sha256": row.sha256,
                "status": row.status,
            }
            for row in attachment_rows
        ],
    )
    session.add(item)
    await session.flush()
    return item


async def _finalize_verdict(
    session: AsyncSession,
    *,
    org: Organization,
    client_scan_id: str,
    subject: str,
    body: str,
    recipients: list[str],
    user_email: str,
    attachment_rows: list[AttachmentScan],
    audit_client_event_id: str,
    approved_quarantine_id: UUID | None = None,
) -> Verdict:
    content_digest = _content_digest(
        sender=user_email,
        subject=subject,
        body=body,
        recipients=recipients,
        attachment_rows=attachment_rows,
    )
    recipient_hits = await _classify_recipients(session, org.id, recipients)
    scanned_entities = [
        _entity_hit(entity)
        for row in attachment_rows
        if row.status == "scanned"
        for entity in (row.entities or [])
    ]
    incomplete_rows = [row for row in attachment_rows if row.status != "scanned"]
    if incomplete_rows:
        verdict = _unavailable_verdict(
            recipients=recipient_hits,
            entities=scanned_entities,
            policy_id="attachment-scan-incomplete",
            user_message=(
                "Sending is blocked because one or more attachments were not fully scanned."
            ),
        )
    else:
        try:
            result = detect_email(
                EmailPayload(subject=subject, body=body, recipients=recipients, attachments=[])
            )
            entities = [_entity_hit(entity) for entity in result.entities]
            entities.extend(scanned_entities)
            detected_risk = max(
                [float(result.risk_score), *[float(row.risk_score) for row in attachment_rows]],
                default=0,
            )
            detected_severity = _max_severity(
                [str(result.severity), *[str(row.severity) for row in attachment_rows]]
            )
            verdict = _build_verdict(
                entities=entities,
                recipients=recipient_hits,
                detected_severity=detected_severity,
                detected_risk_score=detected_risk,
            )
        except Exception:
            verdict = _unavailable_verdict(
                recipients=recipient_hits,
                entities=scanned_entities,
                policy_id="detector-unavailable",
                user_message=(
                    "Sending is blocked because the sensitive-data detector is unavailable."
                ),
            )

    approved_release: QuarantineItem | None = None
    if approved_quarantine_id is not None:
        approved_release = await session.scalar(
            select(QuarantineItem)
            .where(
                QuarantineItem.id == approved_quarantine_id,
                QuarantineItem.org_id == org.id,
            )
            .with_for_update()
        )
        now = datetime.now(UTC)
        release_is_valid = (
            approved_release is not None
            and approved_release.status == "approved"
            and approved_release.released_at is None
            and approved_release.decided_at is not None
            and now - approved_release.decided_at <= QUARANTINE_RELEASE_TTL
            and approved_release.content_digest == content_digest
            and verdict.action == "quarantine"
        )
        if release_is_valid and approved_release is not None:
            approved_release.released_at = now
            verdict = Verdict(
                scan_id=verdict.scan_id,
                action="allow",
                severity=verdict.severity,
                risk_score=verdict.risk_score,
                matched_policy_ids=[*verdict.matched_policy_ids, "approved-quarantine-release"],
                entities=verdict.entities,
                recipients=verdict.recipients,
                user_message="The unchanged message was approved by an analyst and may be sent.",
                created_at=verdict.created_at,
                quarantine_id=str(approved_release.id),
            )
        else:
            verdict = _unavailable_verdict(
                recipients=recipient_hits,
                entities=verdict.entities,
                policy_id="invalid-quarantine-release",
                user_message=(
                    "Sending is blocked because the quarantine approval is invalid, expired, "
                    "already used, or does not match this message."
                ),
            )
    event = await _record_scan_event(
        session,
        org_id=org.id,
        client_event_id=audit_client_event_id,
        verdict=verdict,
        user_email=user_email,
        content_digest=content_digest,
    )
    if verdict.action == "quarantine":
        quarantine = await _record_quarantine(
            session,
            org_id=org.id,
            scan_event_id=event.id,
            client_scan_id=client_scan_id,
            sender=user_email,
            subject=subject,
            verdict=verdict,
            attachment_rows=attachment_rows,
            content_digest=content_digest,
        )
        verdict.quarantine_id = str(quarantine.id)
        await write_audit_event(
            session,
            org_id=org.id,
            actor=f"extension:{user_email}",
            category="quarantine",
            action="created",
            metadata={
                "quarantine_id": str(quarantine.id),
                "scan_id": verdict.scan_id,
                "client_scan_id": client_scan_id,
                "risk_score": verdict.risk_score,
                "content_digest": content_digest,
            },
        )

    await write_audit_event(
        session,
        org_id=org.id,
        actor=f"extension:{user_email}",
        category="scan",
        action=verdict.action,
        metadata={
            "scan_id": verdict.scan_id,
            "client_scan_id": client_scan_id,
            "matched_policy_ids": verdict.matched_policy_ids,
            "entity_count": len(verdict.entities),
            "recipient_count": len(verdict.recipients),
            "content_digest": content_digest,
            "approved_quarantine_id": (
                str(approved_quarantine_id) if approved_quarantine_id else None
            ),
        },
    )
    return verdict


def _is_deep_scan_candidate(filename: str, mime_type: str, size_bytes: int) -> bool:
    settings = get_settings()
    lower_name = filename.lower()
    lower_mime = mime_type.lower()
    return (
        size_bytes > settings.scan_deep_scan_threshold_bytes
        or lower_mime.startswith("image/")
        or lower_name.endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".webp"))
    )


def _write_temp_attachment(data: bytes, filename: str) -> Path:
    settings = get_settings()
    settings.attachment_temp_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(filename).suffix[:20]
    with tempfile.NamedTemporaryFile(
        mode="wb",
        suffix=suffix,
        prefix="scan-",
        dir=settings.attachment_temp_dir,
        delete=False,
    ) as tmp:
        tmp.write(data)
        return Path(tmp.name)


async def _read_bounded_upload(file: UploadFile, *, max_bytes: int) -> bytes:
    data = bytearray()
    while chunk := await file.read(UPLOAD_READ_CHUNK_BYTES):
        if len(data) + len(chunk) > max_bytes:
            raise HTTPException(
                status.HTTP_413_CONTENT_TOO_LARGE,
                detail="attachment exceeds the configured size limit",
            )
        data.extend(chunk)
    return bytes(data)


def _attachment_verdict(row: AttachmentScan) -> Verdict | None:
    if row.status != "scanned":
        return None
    return Verdict(
        scan_id=str(row.id),
        action="allow",
        severity=row.severity,
        risk_score=float(row.risk_score),
        matched_policy_ids=[],
        entities=[_entity_hit(entity) for entity in row.entities],
        recipients=[],
        user_message="Attachment scanned.",
        created_at=row.created_at.isoformat(),
    )


def _attachment_matches_upload(
    row: AttachmentScan,
    *,
    filename: str,
    mime_type: str,
    size_bytes: int,
    sha256: str,
) -> bool:
    return (
        row.sha256 == sha256
        and row.size_bytes == size_bytes
        and row.filename == filename
        and row.mime_type.lower() == mime_type.lower()
    )


async def _load_attachment_rows(
    session: AsyncSession,
    *,
    org_id: UUID,
    client_scan_id: str,
    attachment_scan_ids: list[UUID],
) -> list[AttachmentScan]:
    if not attachment_scan_ids:
        return []
    rows = list(
        (
            await session.scalars(
                select(AttachmentScan).where(
                    AttachmentScan.org_id == org_id,
                    AttachmentScan.client_scan_id == client_scan_id,
                    AttachmentScan.id.in_(attachment_scan_ids),
                )
            )
        ).all()
    )
    found_ids = {
        row.id for row in rows if row.org_id == org_id and row.client_scan_id == client_scan_id
    }
    if any(scan_id not in found_ids for scan_id in attachment_scan_ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="attachment scan not found")
    return rows


@router.post("/email", response_model=Verdict)
async def scan_email(
    payload: ScanEmailRequest,
    session: DbSession,
    extension: ExtensionPrincipal,
) -> Verdict:
    org = await _resolve_org(session, payload.org_code, extension)
    verdict = await _finalize_verdict(
        session,
        org=org,
        client_scan_id=payload.client_scan_id,
        subject=payload.subject,
        body=payload.body,
        recipients=[str(recipient).lower() for recipient in payload.recipients],
        user_email=str(payload.user_email or "unknown").lower(),
        attachment_rows=[],
        audit_client_event_id=f"{payload.client_scan_id}:email",
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="scan id already exists") from exc
    return verdict


async def _delete_staged_object(storage_key: str) -> None:
    with suppress(ObjectStorageError):
        await asyncio.to_thread(get_object_store().delete, storage_key)


async def _queue_attachment(
    session: AsyncSession,
    *,
    org: Organization,
    form: AttachmentScanForm,
    data: bytes,
    filename: str,
    mime_type: str,
    sha256: str,
) -> AttachmentScanResponse:
    row_id = uuid7()
    storage_key = f"attachments/{org.id}/{row_id}/{sha256}"
    object_store = get_object_store()
    try:
        await asyncio.to_thread(object_store.put_bytes, storage_key, data, mime_type)
    except ObjectStorageError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="private attachment storage unavailable",
        ) from exc

    row = AttachmentScan(
        id=row_id,
        org_id=org.id,
        client_scan_id=form.client_scan_id,
        attachment_id=form.attachment_id,
        filename=filename,
        mime_type=mime_type,
        size_bytes=len(data),
        sha256=sha256,
        status="queued",
        severity="none",
        risk_score=0,
        entities=[],
        extraction_errors=[],
        storage_key=storage_key,
    )
    session.add(row)
    session.add(
        AttachmentScanJob(
            attachment_scan_id=row.id,
            status="pending",
            phase="scan",
            attempts=0,
        )
    )
    await write_audit_event(
        session,
        org_id=org.id,
        actor="extension",
        category="scan",
        action="attachment_queued",
        metadata={
            "client_scan_id": form.client_scan_id,
            "attachment_id": form.attachment_id,
            "filename": filename,
            "sha256": sha256,
        },
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        await _delete_staged_object(storage_key)
        raced = await session.scalar(
            select(AttachmentScan).where(
                AttachmentScan.org_id == org.id,
                AttachmentScan.client_scan_id == form.client_scan_id,
                AttachmentScan.attachment_id == form.attachment_id,
            )
        )
        if raced is None:
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="attachment scan could not be created",
            ) from exc
        if not _attachment_matches_upload(
            raced,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="attachment id is already bound to different content",
            ) from exc
        return AttachmentScanResponse(
            attachment_scan_id=str(raced.id),
            status=raced.status,
            verdict=_attachment_verdict(raced),
            error=raced.error,
        )
    except Exception:
        await session.rollback()
        await _delete_staged_object(storage_key)
        raise
    return AttachmentScanResponse(attachment_scan_id=str(row.id), status="queued")


@router.post("/attachment", response_model=AttachmentScanResponse)
async def scan_attachment(
    session: DbSession,
    extension: ExtensionPrincipal,
    form: AttachmentForm,
    file: Annotated[UploadFile, File(...)],
) -> AttachmentScanResponse:
    org = await _resolve_org(session, form.org_code, extension)
    data = await _read_bounded_upload(
        file,
        max_bytes=get_settings().attachment_max_bytes,
    )
    filename = file.filename or form.attachment_id
    mime_type = file.content_type or "application/octet-stream"
    sha256 = hashlib.sha256(data).hexdigest()

    existing = await session.scalar(
        select(AttachmentScan).where(
            AttachmentScan.org_id == org.id,
            AttachmentScan.client_scan_id == form.client_scan_id,
            AttachmentScan.attachment_id == form.attachment_id,
        )
    )
    if existing is not None:
        if not _attachment_matches_upload(
            existing,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
        ):
            raise HTTPException(
                status.HTTP_409_CONFLICT,
                detail="attachment id is already bound to different content",
            )
        return AttachmentScanResponse(
            attachment_scan_id=str(existing.id),
            status=existing.status,
            verdict=_attachment_verdict(existing),
            error=existing.error,
        )

    if _is_deep_scan_candidate(filename, mime_type, len(data)):
        return await _queue_attachment(
            session,
            org=org,
            form=form,
            data=data,
            filename=filename,
            mime_type=mime_type,
            sha256=sha256,
        )

    temp_path = _write_temp_attachment(data, filename)
    try:
        detection_result = detect_email(
            EmailPayload(
                attachments=[
                    Attachment(
                        id=form.attachment_id,
                        filename=filename,
                        mime_type=mime_type,
                        size_bytes=len(data),
                        sha256=sha256,
                        local_path=str(temp_path),
                    )
                ]
            )
        )
        entities = [
            _entity_hit(entity).model_dump(exclude_none=True)
            for entity in detection_result.entities
        ]
        status_value: AttachmentStatus = "scanned"
        error = None
        if detection_result.extraction_errors:
            status_value = "failed"
            error = "; ".join(detection_result.extraction_errors[:3])
        row = AttachmentScan(
            org_id=org.id,
            client_scan_id=form.client_scan_id,
            attachment_id=form.attachment_id,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
            status=status_value,
            severity=detection_result.severity,
            risk_score=detection_result.risk_score,
            entities=entities,
            extraction_errors=detection_result.extraction_errors,
            error=error,
        )
        session.add(row)
        await write_audit_event(
            session,
            org_id=org.id,
            actor="extension",
            category="scan",
            action=f"attachment_{status_value}",
            metadata={
                "client_scan_id": form.client_scan_id,
                "attachment_id": form.attachment_id,
                "filename": filename,
                "sha256": sha256,
                "entity_count": len(entities),
            },
        )
        await session.commit()
        await session.refresh(row)
        return AttachmentScanResponse(
            attachment_scan_id=str(row.id),
            status=row.status,
            verdict=_attachment_verdict(row),
            error=row.error,
        )
    except Exception:
        row = AttachmentScan(
            org_id=org.id,
            client_scan_id=form.client_scan_id,
            attachment_id=form.attachment_id,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
            status="failed",
            severity="none",
            risk_score=0,
            entities=[],
            extraction_errors=[],
            error="attachment detection failed",
        )
        session.add(row)
        await write_audit_event(
            session,
            org_id=org.id,
            actor="extension",
            category="scan",
            action="attachment_failed",
            metadata={
                "client_scan_id": form.client_scan_id,
                "attachment_id": form.attachment_id,
                "filename": filename,
                "sha256": sha256,
            },
        )
        await session.commit()
        await session.refresh(row)
        return AttachmentScanResponse(
            attachment_scan_id=str(row.id),
            status="failed",
            error=row.error,
        )
    finally:
        temp_path.unlink(missing_ok=True)


@router.get("/attachment/{attachment_scan_id}", response_model=AttachmentScanResponse)
async def get_attachment_scan(
    attachment_scan_id: UUID,
    session: DbSession,
    extension: ExtensionPrincipal,
    org_code: str = Query(..., min_length=3, max_length=128),
) -> AttachmentScanResponse:
    org = await _resolve_org(session, org_code, extension)
    row = await session.get(AttachmentScan, attachment_scan_id)
    if row is None or row.org_id != org.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="attachment scan not found")
    return AttachmentScanResponse(
        attachment_scan_id=str(row.id),
        status=row.status,
        verdict=_attachment_verdict(row),
        error=row.error,
    )


@router.post("/finalize", response_model=Verdict)
async def finalize_scan(
    payload: ScanFinalizeRequest,
    session: DbSession,
    extension: ExtensionPrincipal,
) -> Verdict:
    org = await _resolve_org(session, payload.org_code, extension)
    rows = await _load_attachment_rows(
        session,
        org_id=org.id,
        client_scan_id=payload.client_scan_id,
        attachment_scan_ids=payload.attachment_scan_ids,
    )

    verdict = await _finalize_verdict(
        session,
        org=org,
        client_scan_id=payload.client_scan_id,
        subject=payload.subject,
        body=payload.body,
        recipients=[str(recipient).lower() for recipient in payload.recipients],
        user_email=str(payload.user_email or "unknown").lower(),
        attachment_rows=rows,
        audit_client_event_id=payload.client_scan_id,
        approved_quarantine_id=payload.approved_quarantine_id,
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="scan id already exists") from exc
    return verdict
