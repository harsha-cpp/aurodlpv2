from __future__ import annotations

import time
from pathlib import Path

import pytest
from docx import Document
from PIL import Image

import aurodlpv2_detection.api as detection_api
from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.extractors import ExtractionResult
from aurodlpv2_detection.models import Attachment, EmailPayload
from aurodlpv2_detection.ocr import OcrResult


def test_detect_email_finds_abha() -> None:
    result = detect_email(
        EmailPayload(
            subject="",
            body="ABHA 12-3456-7890-1234 for discharge summary",
            recipients=[],
        )
    )

    assert result.entities[0].type == "ABHA"
    assert result.entities[0].masked_value.endswith("1234")
    assert result.risk_score > 0


def test_detect_email_scans_docx_attachment(tmp_path: Path) -> None:
    document_path = tmp_path / "report.docx"
    document = Document()
    document.add_paragraph("Patient MRN HSP-2026-0012 has diagnosis E11.9")
    document.save(str(document_path))

    result = detect_email(
        EmailPayload(
            attachments=[
                Attachment(
                    id="attachment-1",
                    filename="report.docx",
                    mime_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    size_bytes=document_path.stat().st_size,
                    sha256="placeholder",
                    local_path=str(document_path),
                )
            ]
        )
    )

    assert {entity.type for entity in result.entities} == {"MRN", "ICD10"}
    assert {entity.source for entity in result.entities} == {"attachment"}
    assert {entity.attachment_id for entity in result.entities} == {"attachment-1"}


def test_detect_email_text_path_perf_under_budget() -> None:
    body = " ".join(["routine"] * 500)
    body += " ABHA 12-3456-7890-1234 MRN HSP-2026-0012 diagnosis E11.9"

    detect_email(EmailPayload(body=body))
    started = time.perf_counter()
    result = detect_email(EmailPayload(body=body))
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert len(result.entities) == 3
    assert elapsed_ms < 500


@pytest.mark.parametrize(
    ("ocr_result", "expected_error"),
    [
        (OcrResult(text="", confidence=0.0, pages=1), True),
        (OcrResult(text="clear text", confidence=0.2, pages=1), True),
        (OcrResult(text="clear text", confidence=0.9, pages=0), True),
        (OcrResult(text="clear text", confidence=0.9, pages=1), False),
    ],
)
def test_detect_email_reports_incomplete_ocr(
    monkeypatch: pytest.MonkeyPatch,
    ocr_result: OcrResult,
    expected_error: bool,
) -> None:
    image = Image.new("RGB", (1, 1))

    def extract_attachment(_attachment: Attachment) -> ExtractionResult:
        return ExtractionResult(text="", ocr_images=[image], errors=[])

    def extract_ocr_text(
        _images: list[Image.Image],
        _config: DetectionConfig,
        *,
        deadline: float | None = None,
    ) -> OcrResult:
        del deadline
        return ocr_result

    monkeypatch.setattr(detection_api, "extract_attachment", extract_attachment)
    monkeypatch.setattr(detection_api, "extract_ocr_text", extract_ocr_text)

    result = detect_email(
        EmailPayload(
            attachments=[
                Attachment(
                    id="image-1",
                    filename="scan.png",
                    mime_type="image/png",
                    size_bytes=1,
                    sha256="placeholder",
                    local_path="unused",
                )
            ]
        )
    )

    assert bool(result.extraction_errors) is expected_error
