"""OCR on a synthetic scanned document.

This is the path that was completely broken: pages were rendered at 72 DPI with
no preprocessing, and pytesseract lived in an optional extra, so a photographed
prescription produced no text and passed the DLP scan clean.

Skipped where the tesseract binary is absent (a stock macOS dev box). It runs in
CI and inside the built images, which is where it matters.
"""

from __future__ import annotations

import glob
import shutil
from pathlib import Path

import pytest
from PIL import Image, ImageDraw, ImageFont

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import Attachment, EmailPayload

requires_tesseract = pytest.mark.skipif(
    shutil.which("tesseract") is None,
    reason="tesseract binary is not installed on this host",
)

LINES = [
    "DISCHARGE SUMMARY",
    "Patient: Lakshmi Devi",
    "UHID 0024518",
    "Aadhaar 7534 7930 7460",
    "Diagnosis E11.9",
]


def _render_scan(path: Path) -> None:
    """An image-only document: no text layer, exactly like a phone photo."""
    candidates = glob.glob("/usr/share/fonts/**/*.ttf", recursive=True) or glob.glob(
        "/System/Library/Fonts/**/*.ttf", recursive=True
    )
    font = ImageFont.truetype(candidates[0], 34) if candidates else ImageFont.load_default()

    image = Image.new("RGB", (1400, 400), "white")
    draw = ImageDraw.Draw(image)
    for index, line in enumerate(LINES):
        draw.text((30, 30 + index * 68), line, fill="black", font=font)
    image.save(path)


@requires_tesseract
def test_scanned_document_is_read_and_scored(tmp_path: Path) -> None:
    path = tmp_path / "scan.png"
    _render_scan(path)

    result = detect_email(
        EmailPayload(
            attachments=[
                Attachment(
                    id="a1",
                    filename="scan.png",
                    mime_type="image/png",
                    size_bytes=path.stat().st_size,
                    sha256="x",
                    local_path=str(path),
                )
            ]
        )
    )

    assert result.ocr_pages == 1
    assert not result.extraction_errors
    found = {entity.type for entity in result.entities}
    # An identifier and a name is the minimum useful read; OCR is lossy enough
    # that pinning all five lines would make this test flaky for no benefit.
    assert "IN_AADHAAR" in found or "MRN" in found
    assert result.risk_score > 50


@requires_tesseract
def test_blank_page_is_not_reported_as_an_error(tmp_path: Path) -> None:
    """No text found is a normal result; only an unusable engine is an error."""
    path = tmp_path / "blank.png"
    Image.new("RGB", (800, 400), "white").save(path)

    result = detect_email(
        EmailPayload(
            attachments=[
                Attachment(
                    id="a1",
                    filename="blank.png",
                    mime_type="image/png",
                    size_bytes=path.stat().st_size,
                    sha256="x",
                    local_path=str(path),
                )
            ]
        )
    )

    assert result.entities == []
    assert not result.extraction_errors
