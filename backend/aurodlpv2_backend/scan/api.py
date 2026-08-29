from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Iterable
from contextlib import suppress
from datetime import UTC, datetime
from typing import Annotated, Any, Literal, cast
from uuid import UUID

from aurodlpv2_detection.models import Entity as DetectionEntity
from fastapi import APIRouter, File, Form, Header, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, EmailStr, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import (
    ApprovedDomain,
    AttachmentScan,
    EventAction,
    EventSeverity,
    Organization,
    QuarantineItem,
    ScanEvent,
)
from aurodlpv2_backend.deps import DbSession
from aurodlpv2_backend.policy import (
    PolicyDecision,
    PolicySet,
    SenderClass,
    build_facts,
    evaluate,
    load_policy_set,
)
from aurodlpv2_backend.scan.credentials import ScanPrincipal, principal_for_request
from aurodlpv2_backend.scan.limits import enforce_scan_limit
from aurodlpv2_backend.scan.runner import scan_attachment_bytes, scan_text
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.storage import get_store
from aurodlpv2_backend.tasks.scan_tasks import process_attachment_scan
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

_SEVERITY_RANK: dict[str, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}
_HIGH_RISK_ENTITY_TYPES = {
    "IN_AADHAAR",
    "IN_PAN",
    "IN_PASSPORT",
    "IN_DRIVING_LICENSE",
    "IN_VOTER_ID",
    "ABHA_NUMBER",
    "ABHA_ADDRESS",
    "MRN",
    "PATIENT_VISIT_ID",
    "BANK_ACCOUNT",
}
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
    org_code: str | None = Field(default=None, min_length=3, max_length=128)
    client_scan_id: str = Field(min_length=4, max_length=128)
    subject: str = Field(default="", max_length=5000)
    body: str = Field(default="", max_length=1_000_000)
    recipients: list[EmailStr] = Field(default_factory=list, max_length=200)
    user_email: EmailStr | None = None

    @field_validator("org_code")
    @classmethod
    def normalize_org_code(cls, value: str | None) -> str | None:
        return value.strip().upper() if value else None

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


class AttachmentScanResponse(BaseModel):
    attachment_scan_id: str
    status: AttachmentStatus
    verdict: Verdict | None = None
    error: str | None = None


def _sender_email(principal: ScanPrincipal, claimed: object) -> str | None:
    if principal.email:
        return principal.email.lower()
    if claimed:
        return str(claimed).lower()
    return None


async def _org_for(session: AsyncSession, principal: ScanPrincipal) -> Organization:
    org = await session.get(Organization, principal.org_id)
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


async def _classify_sender(
    session: AsyncSession,
    org_id: UUID,
    sender: str,
) -> SenderClass:
    address = _addr(sender)
    if not address:
        return "unknown"
    sender_domain = _domain(address)
    if not sender_domain:
        return "unknown"

    domains = (
        await session.scalars(
            select(ApprovedDomain).where(
                ApprovedDomain.org_id == org_id,
                ApprovedDomain.direction.in_(("sender", "both")),
            )
        )
    ).all()

    classification: SenderClass = (
        "public_email" if sender_domain in _PUBLIC_EMAIL_DOMAINS else "external"
    )
    for configured in domains:
        configured_value = configured.domain.lower()
        matched = (
            address == configured_value
            if "@" in configured_value
            else _domain_matches(sender_domain, configured_value)
        )
        if not matched:
            continue
        if configured.classification == "internal":
            return "internal"
        if configured.classification == "partner":
            classification = "approved_partner"
    return classification


def _policy_decision(
    *,
    entities: list[EntityHit],
    recipients: list[RecipientHit],
    detected_severity: EventSeverity,
    detected_risk_score: float,
    sender_class: SenderClass = "internal",
    has_attachments: bool = False,
    policy_set: PolicySet | None = None,
) -> PolicyDecision:
    facts = build_facts(
        entities=[(entity.type, entity.masked_value) for entity in entities],
        risk_score=detected_risk_score,
        severity=detected_severity,
        recipient_classes=[recipient.classification for recipient in recipients],
        sender_class=sender_class,
        has_attachments=has_attachments,
    )
    decision = evaluate(facts, policy_set)
    return PolicyDecision(
        action=decision.action,
        severity=decision.severity,
        risk_score=round(decision.risk_score, 2),
        matched_policy_ids=decision.matched_policy_ids,
        user_message=decision.user_message,
    )


def _build_verdict(
    *,
    entities: list[EntityHit],
    recipients: list[RecipientHit],
    detected_severity: EventSeverity,
    detected_risk_score: float,
    sender_class: SenderClass = "internal",
    has_attachments: bool = False,
    policy_set: PolicySet | None = None,
    quarantine_id: UUID | None = None,
) -> Verdict:
    decision = _policy_decision(
        entities=entities,
        recipients=recipients,
        detected_severity=detected_severity,
        detected_risk_score=detected_risk_score,
        sender_class=sender_class,
        has_attachments=has_attachments,
        policy_set=policy_set,
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


async def _record_scan_event(
    session: AsyncSession,
    *,
    org_id: UUID,
    client_event_id: str,
    verdict: Verdict,
    user_email: str | None,
) -> ScanEvent:
    existing = await session.scalar(
        select(ScanEvent).where(
            ScanEvent.org_id == org_id,
            ScanEvent.client_event_id == client_event_id,
        )
    )
    if existing is not None:
        return existing

    event = ScanEvent(
        client_event_id=client_event_id,
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
) -> QuarantineItem:
    item = QuarantineItem(
        org_id=org_id,
        scan_event_id=scan_event_id,
        scan_id=verdict.scan_id,
        client_scan_id=client_scan_id,
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
    user_email: str | None,
    attachment_rows: list[AttachmentScan],
    audit_client_event_id: str,
    principal_actor: str,
) -> Verdict:
    result = await scan_text(subject, body, recipients)
    entities = [_entity_hit(entity) for entity in result.entities]
    entities.extend(
        _entity_hit(entity)
        for row in attachment_rows
        if row.status == "scanned"
        for entity in (row.entities or [])
    )
    recipient_hits = await _classify_recipients(session, org.id, recipients)
    sender_class = await _classify_sender(session, org.id, user_email) if user_email else "unknown"
    policy_set = await load_policy_set(session, org.id)
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
        sender_class=sender_class,
        has_attachments=bool(attachment_rows),
        policy_set=policy_set,
    )
    event = await _record_scan_event(
        session,
        org_id=org.id,
        client_event_id=audit_client_event_id,
        verdict=verdict,
        user_email=user_email,
    )
    if verdict.action == "quarantine":
        quarantine = await _record_quarantine(
            session,
            org_id=org.id,
            scan_event_id=event.id,
            client_scan_id=client_scan_id,
            sender=user_email or "unattributed",
            subject=subject,
            verdict=verdict,
            attachment_rows=attachment_rows,
        )
        verdict.quarantine_id = str(quarantine.id)
        await write_audit_event(
            session,
            org_id=org.id,
            actor=principal_actor,
            category="quarantine",
            action="created",
            metadata={
                "quarantine_id": str(quarantine.id),
                "scan_id": verdict.scan_id,
                "client_scan_id": client_scan_id,
                "risk_score": verdict.risk_score,
            },
        )

    await write_audit_event(
        session,
        org_id=org.id,
        actor=principal_actor,
        category="scan",
        action=verdict.action,
        metadata={
            "scan_id": verdict.scan_id,
            "client_scan_id": client_scan_id,
            "matched_policy_ids": verdict.matched_policy_ids,
            "entity_count": len(verdict.entities),
            "recipient_count": len(verdict.recipients),
            "sender_class": sender_class,
            "risk_score": verdict.risk_score,
            "severity": verdict.severity,
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


async def _store_queued_attachment(data: bytes, filename: str) -> str:
    store = get_store()
    suffix = filename[filename.rfind(".") :] if "." in filename else ""
    return await asyncio.to_thread(store.put, data, suffix=suffix)


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


@router.post("/email", response_model=Verdict)
async def scan_email(
    payload: ScanEmailRequest,
    session: DbSession,
    x_auro_device_token: Annotated[str | None, Header()] = None,
) -> Verdict:
    principal = await principal_for_request(session, payload.org_code, x_auro_device_token)
    enforce_scan_limit(principal)
    org = await _org_for(session, principal)
    verdict = await _finalize_verdict(
        session,
        org=org,
        client_scan_id=payload.client_scan_id,
        subject=payload.subject,
        body=payload.body,
        recipients=[str(recipient).lower() for recipient in payload.recipients],
        user_email=_sender_email(principal, payload.user_email),
        attachment_rows=[],
        audit_client_event_id=f"{payload.client_scan_id}:email",
        principal_actor=principal.actor(payload.user_email),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="scan id already exists") from exc
    return verdict


@router.post("/attachment", response_model=AttachmentScanResponse)
async def scan_attachment(
    session: DbSession,
    client_scan_id: Annotated[str, Form(..., min_length=4, max_length=128)],
    attachment_id: Annotated[str, Form(..., min_length=1, max_length=128)],
    file: Annotated[UploadFile, File(...)],
    org_code: Annotated[str | None, Form(min_length=3, max_length=128)] = None,
    x_auro_device_token: Annotated[str | None, Header()] = None,
) -> AttachmentScanResponse:
    principal = await principal_for_request(session, org_code, x_auro_device_token)
    enforce_scan_limit(principal)
    org = await _org_for(session, principal)
    data = await file.read()
    filename = file.filename or attachment_id
    mime_type = file.content_type or "application/octet-stream"
    sha256 = hashlib.sha256(data).hexdigest()

    existing = await session.scalar(
        select(AttachmentScan).where(
            AttachmentScan.org_id == org.id,
            AttachmentScan.client_scan_id == client_scan_id,
            AttachmentScan.attachment_id == attachment_id,
        )
    )
    if existing is not None:
        return AttachmentScanResponse(
            attachment_scan_id=str(existing.id),
            status=existing.status,
            verdict=_attachment_verdict(existing),
            error=existing.error,
        )

    if _is_deep_scan_candidate(filename, mime_type, len(data)):
        storage_key = await _store_queued_attachment(data, filename)
        row = AttachmentScan(
            org_id=org.id,
            client_scan_id=client_scan_id,
            attachment_id=attachment_id,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
            status="queued",
            severity="none",
            risk_score=0,
            entities=[],
            extraction_errors=[],
            storage_path=storage_key,
        )
        session.add(row)
        await write_audit_event(
            session,
            org_id=org.id,
            actor=principal.actor(),
            category="scan",
            action="attachment_queued",
            metadata={
                "client_scan_id": client_scan_id,
                "attachment_id": attachment_id,
                "filename": filename,
                "sha256": sha256,
            },
        )
        await session.commit()
        await session.refresh(row)
        with suppress(Exception):
            cast(Any, process_attachment_scan).delay(str(row.id))
        return AttachmentScanResponse(attachment_scan_id=str(row.id), status="queued")

    try:
        detection_result = await scan_attachment_bytes(
            data,
            attachment_id=attachment_id,
            filename=filename,
            mime_type=mime_type,
            sha256=sha256,
        )
        entities = [
            _entity_hit(entity).model_dump(exclude_none=True)
            for entity in detection_result.entities
        ]
        status_value: AttachmentStatus = "scanned"
        error = None
        if detection_result.extraction_errors and not entities:
            status_value = "failed"
            error = "; ".join(detection_result.extraction_errors[:3])
        row = AttachmentScan(
            org_id=org.id,
            client_scan_id=client_scan_id,
            attachment_id=attachment_id,
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
            actor=principal.actor(),
            category="scan",
            action=f"attachment_{status_value}",
            metadata={
                "client_scan_id": client_scan_id,
                "attachment_id": attachment_id,
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
    except Exception as exc:
        row = AttachmentScan(
            org_id=org.id,
            client_scan_id=client_scan_id,
            attachment_id=attachment_id,
            filename=filename,
            mime_type=mime_type,
            size_bytes=len(data),
            sha256=sha256,
            status="failed",
            severity="none",
            risk_score=0,
            entities=[],
            extraction_errors=[],
            error=str(exc),
        )
        session.add(row)
        await write_audit_event(
            session,
            org_id=org.id,
            actor=principal.actor(),
            category="scan",
            action="attachment_failed",
            metadata={
                "client_scan_id": client_scan_id,
                "attachment_id": attachment_id,
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


@router.get("/attachment/{attachment_scan_id}", response_model=AttachmentScanResponse)
async def get_attachment_scan(
    attachment_scan_id: UUID,
    session: DbSession,
    org_code: Annotated[str | None, Query(min_length=3, max_length=128)] = None,
    x_auro_device_token: Annotated[str | None, Header()] = None,
) -> AttachmentScanResponse:
    principal = await principal_for_request(session, org_code, x_auro_device_token)
    enforce_scan_limit(principal)
    row = await session.get(AttachmentScan, attachment_scan_id)
    if row is None or row.org_id != principal.org_id:
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
    x_auro_device_token: Annotated[str | None, Header()] = None,
) -> Verdict:
    principal = await principal_for_request(session, payload.org_code, x_auro_device_token)
    enforce_scan_limit(principal)
    org = await _org_for(session, principal)
    rows: list[AttachmentScan] = []
    if payload.attachment_scan_ids:
        fetched = (
            await session.scalars(
                select(AttachmentScan).where(
                    AttachmentScan.org_id == org.id,
                    AttachmentScan.id.in_(payload.attachment_scan_ids),
                )
            )
        ).all()
        rows = list(fetched)
        found_ids = {row.id for row in rows}
        missing = [scan_id for scan_id in payload.attachment_scan_ids if scan_id not in found_ids]
        if missing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="attachment scan not found")

    verdict = await _finalize_verdict(
        session,
        org=org,
        client_scan_id=payload.client_scan_id,
        subject=payload.subject,
        body=payload.body,
        recipients=[str(recipient).lower() for recipient in payload.recipients],
        user_email=_sender_email(principal, payload.user_email),
        attachment_rows=rows,
        audit_client_event_id=payload.client_scan_id,
        principal_actor=principal.actor(payload.user_email),
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="scan id already exists") from exc
    return verdict
