"""Hybrid OCR router.

Algorithm (``docs/plans/detection-engine.md`` §9):
    1. Detect script (latin vs indic) via heuristic.
    2. Try Tesseract first (CPU, fast).
    3. If mean confidence < ``ocr.fallback_confidence_threshold`` OR
       script is Indic OR script is handwritten -> retry with PaddleOCR.
    4. Per-page timeout = ``ocr.page_timeout_seconds`` (default 4s).
    5. Document cap = ``ocr.document_timeout_seconds`` (default 60s).
"""

from __future__ import annotations

from dataclasses import dataclass
from time import monotonic

import structlog
from PIL import Image

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.ocr import paddle_backend, tesseract_backend

logger = structlog.get_logger(__name__)

INDIC_RANGES = (
    (0x0900, 0x097F),
    (0x0980, 0x09FF),
    (0x0A00, 0x0A7F),
    (0x0A80, 0x0AFF),
    (0x0B00, 0x0B7F),
    (0x0B80, 0x0BFF),
    (0x0C00, 0x0C7F),
    (0x0C80, 0x0CFF),
    (0x0D00, 0x0D7F),
)


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float
    pages: int


def extract_text(
    images: list[Image.Image],
    config: DetectionConfig,
    *,
    deadline: float | None = None,
) -> OcrResult:
    texts: list[str] = []
    confidences: list[float] = []
    pages = 0
    for image in images:
        if deadline is not None and monotonic() >= deadline:
            logger.warning("OCR document deadline reached")
            break
        text, confidence = extract_image_text(image, config, deadline=deadline)
        pages += 1
        if text:
            texts.append(text)
        confidences.append(confidence)
    mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return OcrResult("\n".join(texts), round(mean_confidence, 3), pages)


def extract_image_text(
    image: Image.Image,
    config: DetectionConfig,
    *,
    deadline: float | None = None,
) -> tuple[str, float]:
    if not config.ocr.enabled:
        return "", 0.0
    if deadline is not None and monotonic() >= deadline:
        return "", 0.0

    text, confidence = tesseract_backend.run(image, config)
    should_fallback = confidence < config.ocr.fallback_confidence_threshold or (
        config.ocr.use_paddle_for_indic and _has_indic_script(text)
    )
    if not should_fallback:
        return text, confidence
    if deadline is not None and monotonic() >= deadline:
        return text, confidence

    fallback_text, fallback_confidence = paddle_backend.run(image, config)
    if fallback_text and fallback_confidence >= confidence:
        return fallback_text, fallback_confidence
    return text, confidence


def _has_indic_script(text: str) -> bool:
    for character in text:
        codepoint = ord(character)
        if any(start <= codepoint <= end for start, end in INDIC_RANGES):
            return True
    return False
