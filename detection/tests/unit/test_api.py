from __future__ import annotations

import time
from pathlib import Path

from docx import Document

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload


def test_detect_email_finds_abha() -> None:
    result = detect_email(
        EmailPayload(
            subject="",
            body="ABHA 12-3456-7890-1234 for discharge summary",
            recipients=[],
        )
    )

    abha = [entity for entity in result.entities if entity.type == "ABHA_NUMBER"]
    assert len(abha) == 1
    assert abha[0].masked_value.endswith("1234")
    assert result.risk_score > 0


def test_detect_email_masks_raw_values() -> None:
    result = detect_email(EmailPayload(body="Aadhaar 7534 7930 7460 on file"))

    assert result.entities
    for entity in result.entities:
        assert "7534" not in entity.masked_value


def test_detect_email_scans_docx_attachment(tmp_path: Path) -> None:
    document_path = tmp_path / "report.docx"
    document = Document()
    document.add_paragraph("Patient UHID 0024518 has diagnosis E11.9")
    document.save(str(document_path))

    result = detect_email(
        EmailPayload(
            attachments=[
                Attachment(
                    id="attachment-1",
                    filename="report.docx",
                    mime_type=(
                        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    ),
                    size_bytes=document_path.stat().st_size,
                    sha256="placeholder",
                    local_path=str(document_path),
                )
            ]
        )
    )

    assert {"MRN", "ICD10"} <= {entity.type for entity in result.entities}
    assert {entity.source for entity in result.entities} == {"attachment"}
    assert {entity.attachment_id for entity in result.entities} == {"attachment-1"}


def test_detect_email_text_path_perf_under_budget() -> None:
    body = " ".join(["routine"] * 500)
    body += " ABHA 12-3456-7890-1234 UHID 0024518 diagnosis E11.9"

    detect_email(EmailPayload(body=body))
    started = time.perf_counter()
    result = detect_email(EmailPayload(body=body))
    elapsed_ms = (time.perf_counter() - started) * 1000

    assert {"ABHA_NUMBER", "MRN", "ICD10"} <= {entity.type for entity in result.entities}
    assert elapsed_ms < 500


def test_overlapping_matches_resolve_to_the_composite_identifier() -> None:
    result = detect_email(EmailPayload(body="ABHA 96-9015-1720-1488 verified"))

    types = [entity.type for entity in result.entities]
    assert "ABHA_NUMBER" in types
    assert "IN_AADHAAR" not in types


def test_invalid_icd10_codes_are_dropped() -> None:
    result = detect_email(
        EmailPayload(body="Clinical meeting in room A12, patient needs vitamin B12.")
    )

    assert [entity for entity in result.entities if entity.type == "ICD10"] == []
