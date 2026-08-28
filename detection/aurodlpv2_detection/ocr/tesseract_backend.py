"""Tesseract 5 backend via pytesseract.

An unavailable OCR engine is not the same as a page with no text. If the binary
or the bindings are missing, a scanned discharge summary yields "" and passes
the DLP scan clean — a false negative on PHI. Failures are raised as
``OcrUnavailableError`` so the caller records an extraction error instead of an
empty result.
"""

from __future__ import annotations

from importlib import import_module
from typing import Protocol, cast

import structlog
from PIL import Image

from aurodlpv2_detection.config import DetectionConfig

logger = structlog.get_logger(__name__)


class OcrUnavailableError(RuntimeError):
    """The OCR engine could not run, as opposed to finding no text."""


class _Output(Protocol):
    DICT: object


class _PytesseractModule(Protocol):
    Output: _Output

    def image_to_data(
        self,
        image: Image.Image,
        *,
        lang: str,
        output_type: object,
        timeout: float,
    ) -> dict[str, list[object]]: ...


def run(image: Image.Image, config: DetectionConfig) -> tuple[str, float]:
    try:
        pytesseract = cast(_PytesseractModule, import_module("pytesseract"))
        data = pytesseract.image_to_data(
            image,
            lang="+".join(config.ocr.languages),
            output_type=pytesseract.Output.DICT,
            timeout=config.ocr.page_timeout_seconds,
        )
    except ImportError as exc:
        raise OcrUnavailableError(
            "pytesseract is not installed; scanned documents cannot be read"
        ) from exc
    except RuntimeError as exc:
        message = str(exc).lower()
        if "timeout" in message or "timed out" in message:
            logger.warning("tesseract OCR timed out")
            return "", 0.0
        raise OcrUnavailableError(f"tesseract failed: {exc}") from exc

    texts = [str(value).strip() for value in data.get("text", []) if str(value).strip()]
    confidences = [_parse_confidence(value) for value in data.get("conf", [])]
    valid_confidences = [confidence for confidence in confidences if confidence >= 0.0]
    mean_confidence = (
        sum(valid_confidences) / (len(valid_confidences) * 100.0)
        if valid_confidences
        else 0.0
    )
    return " ".join(texts), round(mean_confidence, 3)


def _parse_confidence(value: object) -> float:
    if not isinstance(value, int | float | str):
        return -1.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return -1.0
