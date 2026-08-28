"""Public detection entrypoint."""

from __future__ import annotations

import time
from datetime import UTC, datetime

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.extractors import extract_attachment
from aurodlpv2_detection.models import EmailPayload, Entity, EntitySource, ScanResult
from aurodlpv2_detection.ocr import extract_text as extract_ocr_text
from aurodlpv2_detection.recognition import analyze
from aurodlpv2_detection.rules.schema import RulePack
from aurodlpv2_detection.scoring import score


def detect_email(
    payload: EmailPayload,
    config: DetectionConfig | None = None,
    *,
    rule_pack: RulePack | None = None,
) -> ScanResult:
    started = time.perf_counter()
    resolved_config = config or DetectionConfig()
    deadline = time.monotonic() + resolved_config.ocr.document_timeout_seconds

    entities: list[Entity] = [
        *_detect(payload.subject, "subject", resolved_config, rule_pack=rule_pack),
        *_detect(payload.body, "body", resolved_config, rule_pack=rule_pack),
    ]
    extraction_errors: list[str] = []
    ocr_pages = 0

    for attachment in payload.attachments:
        extraction = extract_attachment(attachment)
        extraction_errors.extend(extraction.errors)
        if extraction.text:
            entities.extend(
                _detect(
                    extraction.text,
                    "attachment",
                    resolved_config,
                    attachment_id=attachment.id,
                    rule_pack=rule_pack,
                )
            )
        if extraction.ocr_images:
            ocr_result = extract_ocr_text(
                extraction.ocr_images,
                resolved_config,
                deadline=deadline,
            )
            ocr_pages += ocr_result.pages
            extraction_errors.extend(
                f"{attachment.id}: {error}" for error in ocr_result.errors
            )
            if ocr_result.text:
                entities.extend(
                    _detect(
                        ocr_result.text,
                        "attachment",
                        resolved_config,
                        attachment_id=attachment.id,
                        rule_pack=rule_pack,
                    )
                )

    risk_score, severity = score(entities, resolved_config)
    return ScanResult(
        entities=entities,
        severity=severity,
        risk_score=risk_score,
        duration_ms=max(0, round((time.perf_counter() - started) * 1000)),
        ocr_pages=ocr_pages,
        extraction_errors=extraction_errors,
        completed_at=datetime.now(UTC),
    )


def _detect(
    text: str,
    source: EntitySource,
    config: DetectionConfig,
    *,
    attachment_id: str | None = None,
    rule_pack: RulePack | None = None,
) -> list[Entity]:
    return analyze(
        text,
        source,
        config,
        attachment_id=attachment_id,
        rule_pack=rule_pack,
    )
