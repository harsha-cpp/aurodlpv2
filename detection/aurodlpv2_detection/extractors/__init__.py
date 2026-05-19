"""File text extraction.

Dispatcher in ``__init__.py`` chooses backend by MIME:
    application/pdf                                                  -> pdf.py (PyMuPDF)
    application/vnd.openxmlformats-officedocument.wordprocessingml.* -> docx.py (python-docx)
    application/vnd.openxmlformats-officedocument.spreadsheetml.*    -> xlsx.py (openpyxl)
    image/*                                                          -> image.py (-> OCR)
"""

from __future__ import annotations

from dataclasses import dataclass
from importlib import import_module
from pathlib import Path
from typing import Protocol, cast

import structlog
from PIL import Image

from aurodlpv2_detection.extractors import docx, image, pdf, xlsx
from aurodlpv2_detection.models import Attachment

logger = structlog.get_logger(__name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class _MagicModule(Protocol):
    def from_buffer(self, buffer: bytes, *, mime: bool) -> str: ...


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    ocr_images: list[Image.Image]
    errors: list[str]


def extract_attachment(attachment: Attachment) -> ExtractionResult:
    if attachment.local_path is None:
        return ExtractionResult("", [], [f"{attachment.id}: missing local path"])

    try:
        data = Path(attachment.local_path).read_bytes()
    except OSError:
        logger.warning("attachment read failed", attachment_id=attachment.id)
        return ExtractionResult("", [], [f"{attachment.id}: read failed"])

    detected_mime = _detect_mime(data, attachment.mime_type)
    try:
        if detected_mime == "application/pdf":
            pages = pdf.extract_pages(data)
            return ExtractionResult(
                text="\n".join(page.text for page in pages if page.text),
                ocr_images=[page.ocr_image for page in pages if page.ocr_image is not None],
                errors=[],
            )
        if detected_mime == DOCX_MIME:
            return ExtractionResult(docx.extract_text(data), [], [])
        if detected_mime == XLSX_MIME:
            return ExtractionResult(xlsx.extract_text(data), [], [])
        if detected_mime.startswith("image/"):
            opened_image = image.open_image(data)
            return ExtractionResult("", [opened_image] if opened_image is not None else [], [])
    except Exception:
        logger.warning("attachment extraction failed", attachment_id=attachment.id)
        return ExtractionResult("", [], [f"{attachment.id}: extraction failed"])

    logger.warning(
        "unsupported attachment MIME",
        attachment_id=attachment.id,
        mime_type=detected_mime,
    )
    return ExtractionResult("", [], [f"{attachment.id}: unsupported MIME"])


def _detect_mime(data: bytes, fallback: str) -> str:
    try:
        magic = cast(_MagicModule, import_module("magic"))
        detected = magic.from_buffer(data[:4096], mime=True)
        return detected or fallback
    except Exception:
        return fallback
