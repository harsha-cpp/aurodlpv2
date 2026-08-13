"""Public detection entrypoint."""

from __future__ import annotations

import time
from datetime import UTC, datetime
from typing import Literal

from presidio_analyzer import RecognizerResult

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.extractors import extract_attachment
from aurodlpv2_detection.masking import mask_value
from aurodlpv2_detection.models import EmailPayload, Entity, ScanResult
from aurodlpv2_detection.nlp import build_analyzer
from aurodlpv2_detection.ocr import extract_text as extract_ocr_text
from aurodlpv2_detection.scoring import score

Source = Literal["body", "subject", "attachment"]
MIN_ENTITY_SCORE = 0.35


def detect_email(payload: EmailPayload, config: DetectionConfig | None = None) -> ScanResult:
    started = time.perf_counter()
    resolved_config = config or DetectionConfig()
    deadline = time.monotonic() + resolved_config.ocr.document_timeout_seconds

    entities = [
        *_detect_text(payload.subject, "subject", resolved_config),
        *_detect_text(payload.body, "body", resolved_config),
    ]
    extraction_errors: list[str] = []
    ocr_pages = 0

    for attachment in payload.attachments:
        extraction = extract_attachment(attachment)
        extraction_errors.extend(extraction.errors)
        if extraction.text:
            entities.extend(
                _detect_text(
                    extraction.text,
                    "attachment",
                    resolved_config,
                    attachment_id=attachment.id,
                )
            )
        if extraction.ocr_images:
            ocr_result = extract_ocr_text(
                extraction.ocr_images,
                resolved_config,
                deadline=deadline,
            )
            ocr_pages += ocr_result.pages
            if (
                ocr_result.pages != len(extraction.ocr_images)
                or not ocr_result.text.strip()
                or ocr_result.confidence < resolved_config.ocr.fallback_confidence_threshold
            ):
                extraction_errors.append(f"{attachment.id}: OCR incomplete")
            if ocr_result.text:
                entities.extend(
                    _detect_text(
                        ocr_result.text,
                        "attachment",
                        resolved_config,
                        attachment_id=attachment.id,
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


def _detect_text(
    text: str,
    source: Source,
    config: DetectionConfig,
    *,
    attachment_id: str | None = None,
) -> list[Entity]:
    if not text.strip():
        return []

    analyzer = build_analyzer(config)
    results = analyzer.analyze(
        text=text,
        language="en",
        entities=_enabled_entities(config),
        score_threshold=MIN_ENTITY_SCORE,
    )
    return [
        _entity_from_result(text, result, source, attachment_id=attachment_id) for result in results
    ]


def _entity_from_result(
    text: str,
    result: RecognizerResult,
    source: Source,
    *,
    attachment_id: str | None,
) -> Entity:
    return Entity(
        type=result.entity_type,
        masked_value=mask_value(text[result.start : result.end]),
        confidence=max(0.0, min(1.0, result.score)),
        source=source,
        attachment_id=attachment_id,
        start=result.start,
        end=result.end,
    )


def _enabled_entities(config: DetectionConfig) -> list[str]:
    entities: list[str] = []
    if config.recognizers.enable_aadhaar:
        entities.append("IN_AADHAAR")
    if config.recognizers.enable_pan:
        entities.append("IN_PAN")
    if config.recognizers.enable_abha:
        entities.append("ABHA")
    if config.recognizers.enable_mrn:
        entities.append("MRN")
    if config.recognizers.enable_icd10:
        entities.append("ICD10")
    if config.recognizers.enable_patient_demographics:
        entities.extend(["PATIENT_NAME", "PATIENT_DOB", "PATIENT_EMAIL", "PATIENT_PHONE"])
    return entities
