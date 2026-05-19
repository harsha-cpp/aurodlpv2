"""Scan orchestration."""

from __future__ import annotations

import asyncio
import time
from collections import Counter
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Literal, cast
from uuid import UUID

from medshield_detection.api import detect_email
from medshield_detection.models import EmailPayload, ScanResult
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from medshield_backend.audit.writer import write_event
from medshield_backend.celery_app import send_celery_task
from medshield_backend.db.models import PolicyRecord, QuarantineQueue, Scan
from medshield_backend.deps import Principal
from medshield_backend.policy.evaluator import PolicyContext, PolicyEvaluation, evaluate
from medshield_backend.policy.models import Policy, Rule
from medshield_backend.recipients.classifier import classify, email_domain
from medshield_backend.scan.schemas import (
    Action,
    AttachmentScanResponse,
    EntityHit,
    RecipientHit,
    ScanEmailRequest,
    ScanFinalizeRequest,
    ScanStatusResponse,
    Severity,
    Verdict,
)

STUB_USER_MESSAGE = "No sensitive content detected."
DEEP_SCAN_TASK = "medshield.scan.deep_attachment"
ACTION_RANK: dict[str, int] = {
    "allow": 0,
    "warn": 1,
    "block": 2,
    "quarantine": 3,
    "escalate": 4,
}
SEVERITY_RANK: dict[str, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}
ENTITY_SOURCES = {"body", "subject", "attachment"}


async def scan_email(
    *,
    session: AsyncSession,
    actor: Principal,
    payload: ScanEmailRequest,
) -> Verdict:
    started = time.perf_counter()
    detection = await asyncio.to_thread(
        detect_email,
        EmailPayload(
            subject=payload.subject,
            body=payload.body,
            recipients=payload.recipients,
        ),
    )
    recipient_hits = [
        RecipientHit(
            email=recipient,
            classification=await classify(
                session=session,
                workspace_id=actor.workspace_id,
                email=str(recipient),
            ),
        )
        for recipient in payload.recipients
    ]
    policies = await _load_policies(session, actor.workspace_id)
    policy_evaluation = evaluate(
        policies,
        PolicyContext(
            entity_counts=Counter(entity.type for entity in detection.entities),
            recipient_classes=[recipient.classification for recipient in recipient_hits],
            recipient_domains=[email_domain(str(recipient)) for recipient in payload.recipients],
            attachment_mime_types=[],
            attachment_text="",
            severity=detection.severity,
            score=detection.risk_score,
        ),
    )
    verdict = verdict_from_detection(
        scan_id="pending",
        detection=detection,
        recipient_hits=recipient_hits,
        policy_evaluation=policy_evaluation,
    )
    scan = Scan(
        workspace_id=actor.workspace_id,
        user_id=actor.user_id,
        message_id=payload.message_id,
        status="completed",
        decision=verdict.action,
        severity=verdict.severity,
        score=Decimal(str(detection.risk_score)),
        matched_policies=_policy_uuid_list(policy_evaluation),
        entities_summary=_entities_summary(detection),
        attachments_count=0,
        duration_ms=detection.duration_ms,
        completed_at=detection.completed_at,
    )
    session.add(scan)
    await session.flush()
    scan.duration_ms = max(detection.duration_ms, _elapsed_ms(started))
    verdict = verdict_from_detection(
        scan_id=str(scan.id),
        detection=detection,
        recipient_hits=recipient_hits,
        policy_evaluation=policy_evaluation,
    )
    if verdict.action == "quarantine":
        await _create_quarantine_item(
            session=session,
            actor=actor,
            scan=scan,
            subject=payload.subject,
            recipients=[str(recipient) for recipient in payload.recipients],
            severity=verdict.severity,
        )
    await _write_scan_audit(session, actor, scan, verdict, action="scan.completed")
    await session.commit()
    return verdict


async def scan_attachment_stub(
    *,
    session: AsyncSession,
    actor: Principal,
    filename: str,
    size_bytes: int,
    mime_type: str,
) -> AttachmentScanResponse:
    scan = Scan(
        workspace_id=actor.workspace_id,
        user_id=actor.user_id,
        status="completed",
        decision="allow",
        severity="none",
        score=Decimal("0.00"),
        matched_policies=[],
        entities_summary={"entities": [], "attachment": {"mime_type": mime_type}},
        attachments_count=1,
        completed_at=datetime.now(UTC),
    )
    session.add(scan)
    await session.flush()
    verdict = stub_verdict(scan_id=str(scan.id), recipients=[], created_at=scan.completed_at)
    await _write_scan_audit(
        session,
        actor,
        scan,
        verdict,
        action="scan.attachment_completed",
        metadata={"filename": filename, "size_bytes": size_bytes, "mime_type": mime_type},
    )
    await session.commit()
    return AttachmentScanResponse(
        scan_id=str(scan.id),
        status="scanned",
        filename=filename,
        size_bytes=size_bytes,
        mime_type=mime_type,
    )


async def queue_attachment_scan(
    *,
    session: AsyncSession,
    actor: Principal,
    filename: str,
    size_bytes: int,
    mime_type: str,
    path: Path,
) -> AttachmentScanResponse:
    scan = Scan(
        workspace_id=actor.workspace_id,
        user_id=actor.user_id,
        status="pending",
        matched_policies=[],
        entities_summary={"entities": [], "attachment": {"mime_type": mime_type}},
        attachments_count=1,
    )
    session.add(scan)
    await session.flush()
    await _write_scan_queue_audit(
        session=session,
        actor=actor,
        scan=scan,
        metadata={"filename": filename, "size_bytes": size_bytes, "mime_type": mime_type},
    )
    await session.commit()
    await asyncio.to_thread(
        send_celery_task,
        DEEP_SCAN_TASK,
        [str(scan.id), str(path), filename, mime_type, size_bytes],
    )
    return AttachmentScanResponse(
        scan_id=str(scan.id),
        status="queued",
        filename=filename,
        size_bytes=size_bytes,
        mime_type=mime_type,
    )


async def get_scan_status(
    *,
    session: AsyncSession,
    actor: Principal,
    scan_id: UUID,
) -> ScanStatusResponse:
    scan = await session.scalar(
        select(Scan).where(
            Scan.id == scan_id,
            Scan.workspace_id == actor.workspace_id,
        )
    )
    if scan is None:
        raise LookupError("scan not found")
    verdict = None
    if scan.status == "completed":
        verdict = verdict_from_scan(scan)
    return ScanStatusResponse(scan_id=str(scan.id), status=scan.status, verdict=verdict)


async def finalize_scan(
    *,
    session: AsyncSession,
    actor: Principal,
    scan_id: UUID,
    payload: ScanFinalizeRequest,
) -> Verdict:
    scan = await session.scalar(
        select(Scan).where(
            Scan.id == scan_id,
            Scan.workspace_id == actor.workspace_id,
        )
    )
    if scan is None:
        raise LookupError("scan not found")

    attachment_scans = await _load_attachment_scans(
        session=session,
        workspace_id=actor.workspace_id,
        scan_ids=payload.attachment_scan_ids,
    )
    verdict = combined_verdict_from_scans(scan, attachment_scans)
    scan.attachments_count = len(attachment_scans)
    scan.decision = verdict.action
    scan.severity = verdict.severity
    scan.score = Decimal(str(verdict.risk_score))
    scan.matched_policies = _uuid_list(verdict.matched_policy_ids)
    scan.entities_summary = _entities_summary_from_hits(verdict.entities)
    scan.completed_at = scan.completed_at or datetime.now(UTC)
    await _write_scan_audit(
        session,
        actor,
        scan,
        verdict,
        action="scan.finalized",
        metadata={
            "message_id": payload.message_id,
            "attachment_scan_ids": payload.attachment_scan_ids,
            "override_quarantine": payload.override_quarantine,
        },
    )
    await session.commit()
    return verdict


async def _load_attachment_scans(
    *,
    session: AsyncSession,
    workspace_id: UUID,
    scan_ids: list[str],
) -> list[Scan]:
    parsed_ids: list[UUID] = []
    for scan_id in scan_ids:
        try:
            parsed_ids.append(UUID(scan_id))
        except ValueError as exc:
            raise LookupError("attachment scan not found") from exc

    if not parsed_ids:
        return []

    rows = await session.scalars(
        select(Scan).where(
            Scan.id.in_(parsed_ids),
            Scan.workspace_id == workspace_id,
        )
    )
    scans = list(rows.all())
    if {scan.id for scan in scans} != set(parsed_ids):
        raise LookupError("attachment scan not found")
    return scans


def combined_verdict_from_scans(primary_scan: Scan, attachment_scans: list[Scan]) -> Verdict:
    verdicts = [verdict_from_scan(primary_scan)]
    verdicts.extend(
        verdict_from_scan(scan, default_entity_source="attachment")
        for scan in attachment_scans
    )
    action = cast(
        Action,
        max((verdict.action for verdict in verdicts), key=lambda item: ACTION_RANK[item]),
    )
    severity = cast(
        Severity,
        max(
            (verdict.severity for verdict in verdicts),
            key=lambda item: SEVERITY_RANK[item],
        ),
    )
    risk_score = max(verdict.risk_score for verdict in verdicts)
    matched_policy_ids = list(
        dict.fromkeys(
            policy_id
            for verdict in verdicts
            for policy_id in verdict.matched_policy_ids
        )
    )
    entities = [entity for verdict in verdicts for entity in verdict.entities]
    return Verdict(
        scan_id=str(primary_scan.id),
        action=action,
        severity=severity,
        risk_score=risk_score,
        matched_policy_ids=matched_policy_ids,
        entities=entities,
        recipients=verdicts[0].recipients,
        user_message=_verdict_message(action, len(entities)),
        created_at=_scan_created_at(primary_scan),
    )


def verdict_from_scan(scan: Scan, *, default_entity_source: str = "body") -> Verdict:
    entities = _entity_hits_from_scan(scan, default_source=default_entity_source)
    action = _scan_action(scan)
    return Verdict(
        scan_id=str(scan.id),
        action=action,
        severity=_scan_severity(scan),
        risk_score=float(scan.score or Decimal("0.00")),
        matched_policy_ids=[str(policy_id) for policy_id in scan.matched_policies or []],
        entities=entities,
        recipients=[],
        user_message=_verdict_message(action, len(entities)),
        created_at=_scan_created_at(scan),
    )


def _scan_action(scan: Scan) -> Action:
    if scan.decision in ACTION_RANK:
        return cast(Action, scan.decision)
    return "allow"


def _scan_severity(scan: Scan) -> Severity:
    if scan.severity in SEVERITY_RANK:
        return cast(Severity, scan.severity)
    return "none"


def _scan_created_at(scan: Scan) -> datetime:
    return scan.completed_at or scan.created_at or datetime.now(UTC)


def _entity_hits_from_scan(scan: Scan, *, default_source: str) -> list[EntityHit]:
    summary: dict[str, object] = scan.entities_summary or {}
    raw_entities = summary.get("entities")
    if not isinstance(raw_entities, list):
        return []

    hits: list[EntityHit] = []
    for raw_entity_obj in cast(list[object], raw_entities):
        if not isinstance(raw_entity_obj, dict):
            continue
        raw_entity = cast(dict[str, object], raw_entity_obj)
        entity_type = raw_entity.get("type")
        masked_value = raw_entity.get("masked_value")
        if not isinstance(entity_type, str) or not isinstance(masked_value, str):
            continue

        source = raw_entity.get("source")
        resolved_source = (
            source
            if isinstance(source, str) and source in ENTITY_SOURCES
            else default_source
        )
        attachment_id = raw_entity.get("attachment_id")
        hits.append(
            EntityHit(
                type=entity_type,
                masked_value=masked_value,
                confidence=_entity_confidence(raw_entity.get("confidence")),
                source=cast(Literal["body", "subject", "attachment"], resolved_source),
                attachment_id=(
                    attachment_id
                    if isinstance(attachment_id, str)
                    else str(scan.id)
                    if resolved_source == "attachment"
                    else None
                ),
            )
        )
    return hits


def _entity_confidence(value: object | None) -> float:
    if not isinstance(value, int | float | str):
        return 0.0
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return 0.0


def _verdict_message(action: Action, entity_count: int) -> str:
    if entity_count > 0:
        return f"Detected {entity_count} sensitive item{'s' if entity_count != 1 else ''}."
    if action == "allow":
        return STUB_USER_MESSAGE
    return f"Final scan decision: {action}."


def stub_verdict(
    *,
    scan_id: str,
    recipients: list[str],
    created_at: datetime | None = None,
) -> Verdict:
    return Verdict(
        scan_id=scan_id,
        action="allow",
        severity="none",
        risk_score=0.0,
        matched_policy_ids=[],
        entities=[],
        recipients=[
            RecipientHit(email=recipient, classification="unknown") for recipient in recipients
        ],
        user_message=STUB_USER_MESSAGE,
        created_at=created_at or datetime.now(UTC),
    )


def should_deep_scan(*, size_bytes: int, threshold_bytes: int, mime_type: str) -> bool:
    return size_bytes >= threshold_bytes or mime_type in {
        "image/jpeg",
        "image/png",
        "image/tiff",
    }


def verdict_from_detection(
    *,
    scan_id: str,
    detection: ScanResult,
    recipients: list[str] | None = None,
    recipient_hits: list[RecipientHit] | None = None,
    policy_evaluation: PolicyEvaluation | None = None,
) -> Verdict:
    action = policy_evaluation.action if policy_evaluation else _default_action(detection)
    severity = policy_evaluation.severity if policy_evaluation else detection.severity
    matched_policy_ids = policy_evaluation.matched_policy_ids if policy_evaluation else []
    entity_count = len(detection.entities)
    resolved_recipient_hits = recipient_hits or [
        RecipientHit(email=recipient, classification="unknown") for recipient in recipients or []
    ]
    return Verdict(
        scan_id=scan_id,
        action=action,
        severity=severity,
        risk_score=detection.risk_score,
        matched_policy_ids=matched_policy_ids,
        entities=[
            EntityHit(
                type=entity.type,
                masked_value=entity.masked_value,
                confidence=entity.confidence,
                source=entity.source,
                attachment_id=entity.attachment_id,
            )
            for entity in detection.entities
        ],
        recipients=resolved_recipient_hits,
        user_message=(
            policy_evaluation.user_message
            if policy_evaluation and policy_evaluation.matched_policy_ids
            else STUB_USER_MESSAGE
            if entity_count == 0
            else f"Detected {entity_count} sensitive item{'s' if entity_count != 1 else ''}."
        ),
        created_at=detection.completed_at,
    )


async def _write_scan_audit(
    session: AsyncSession,
    actor: Principal,
    scan: Scan,
    verdict: Verdict,
    *,
    action: str,
    metadata: dict[str, object] | None = None,
) -> None:
    event_metadata: dict[str, object] = {
        "scan_id": str(scan.id),
        "message_id": scan.message_id,
        "decision": verdict.action,
        "severity": verdict.severity,
        "score": verdict.risk_score,
    }
    if metadata:
        event_metadata.update(metadata)
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action=action,
        category="scan",
        resource_type="scan",
        resource_id=str(scan.id),
        after_state={
            "status": scan.status,
            "decision": verdict.action,
            "severity": verdict.severity,
        },
        metadata=event_metadata,
    )


async def _write_scan_queue_audit(
    *,
    session: AsyncSession,
    actor: Principal,
    scan: Scan,
    metadata: dict[str, object],
) -> None:
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="scan.attachment_queued",
        category="scan",
        resource_type="scan",
        resource_id=str(scan.id),
        after_state={"status": scan.status},
        metadata={"scan_id": str(scan.id), **metadata},
    )


async def _create_quarantine_item(
    *,
    session: AsyncSession,
    actor: Principal,
    scan: Scan,
    subject: str,
    recipients: list[str],
    severity: str,
) -> None:
    item = QuarantineQueue(
        workspace_id=actor.workspace_id,
        scan_id=scan.id,
        sender_user_id=actor.user_id,
        recipients=recipients,
        subject=subject,
        severity=severity,
    )
    session.add(item)
    await session.flush()
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="quarantine.created",
        category="quarantine",
        resource_type="quarantine",
        resource_id=str(item.id),
        after_state={"status": item.status, "scan_id": str(scan.id), "severity": severity},
    )


def _elapsed_ms(started: float) -> int:
    return max(0, round((time.perf_counter() - started) * 1000))


def _default_action(detection: ScanResult) -> Action:
    return "allow" if detection.severity in {"none", "low"} else "warn"


def _policy_uuid_list(policy_evaluation: PolicyEvaluation) -> list[UUID]:
    return _uuid_list(policy_evaluation.matched_policy_ids)


def _uuid_list(policy_ids: list[str]) -> list[UUID]:
    uuids: list[UUID] = []
    for policy_id in policy_ids:
        try:
            uuids.append(UUID(policy_id))
        except ValueError:
            continue
    return uuids


async def _load_policies(session: AsyncSession, workspace_id: UUID) -> list[Policy]:
    rows = await session.scalars(
        select(PolicyRecord).where(
            PolicyRecord.workspace_id == workspace_id,
            PolicyRecord.enabled.is_(True),
        )
    )
    return [
        Policy(
            id=str(row.id),
            workspace_id=str(row.workspace_id),
            name=row.name,
            enabled=row.enabled,
            rules=[Rule.model_validate(rule) for rule in row.rules],
        )
        for row in rows
    ]


def _entities_summary(detection: ScanResult) -> dict[str, object]:
    counts = Counter(entity.type for entity in detection.entities)
    return {
        "counts": dict(counts),
        "entities": [
            {
                "type": entity.type,
                "masked_value": entity.masked_value,
                "source": entity.source,
                "confidence": entity.confidence,
            }
            for entity in detection.entities
        ],
    }


def _entities_summary_from_hits(entities: list[EntityHit]) -> dict[str, object]:
    counts = Counter(entity.type for entity in entities)
    serialized_entities: list[dict[str, object]] = []
    for entity in entities:
        serialized: dict[str, object] = {
            "type": entity.type,
            "masked_value": entity.masked_value,
            "source": entity.source,
            "confidence": entity.confidence,
        }
        if entity.attachment_id:
            serialized["attachment_id"] = entity.attachment_id
        serialized_entities.append(serialized)
    return {"counts": dict(counts), "entities": serialized_entities}
