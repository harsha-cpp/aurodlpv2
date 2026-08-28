"""Hybrid OCR router.

Algorithm:
    1. Preprocess (greyscale, upscale to ~300 DPI equivalent, contrast, sharpen).
    2. Run Tesseract with every configured language at once.
    3. Fall back to PaddleOCR when Tesseract's mean confidence is low, or when
       the tenant has configured an Indic language.
    4. Per-page and whole-document deadlines.

The Indic decision is made from *configuration*, not from Tesseract's output.
The previous version tested Tesseract's text for Devanagari codepoints while
running it with ``lang="eng"``, which cannot emit Devanagari — so the fallback
could never fire.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from time import monotonic

import structlog
from PIL import Image

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.ocr import paddle_backend, tesseract_backend
from aurodlpv2_detection.ocr.preprocess import prepare
from aurodlpv2_detection.ocr.tesseract_backend import OcrUnavailableError

logger = structlog.get_logger(__name__)

INDIC_RANGES = (
    (0x0900, 0x097F),  # Devanagari
    (0x0980, 0x09FF),  # Bengali
    (0x0A00, 0x0A7F),  # Gurmukhi
    (0x0A80, 0x0AFF),  # Gujarati
    (0x0B00, 0x0B7F),  # Oriya
    (0x0B80, 0x0BFF),  # Tamil
    (0x0C00, 0x0C7F),  # Telugu
    (0x0C80, 0x0CFF),  # Kannada
    (0x0D00, 0x0D7F),  # Malayalam
)

#: Tesseract language codes that are not Latin script.
INDIC_TESSERACT_LANGS = frozenset(
    {
        "hin", "ben", "pan", "guj", "ori", "tam", "tel", "kan", "mal",
        "mar", "nep", "san", "asm", "urd",
    }
)


def _empty_errors() -> list[str]:
    return []


@dataclass(frozen=True, slots=True)
class OcrResult:
    text: str
    confidence: float
    pages: int
    #: Non-empty when OCR could not run. The caller surfaces these so a page
    #: that could not be read is visibly unread rather than silently clean.
    errors: list[str] = field(default_factory=_empty_errors)


def wants_indic(config: DetectionConfig) -> bool:
    """True when the tenant has configured a non-Latin script."""
    languages = {language.lower() for language in config.ocr.languages}
    return bool(languages & INDIC_TESSERACT_LANGS)


def has_indic_script(text: str) -> bool:
    return any(
        any(start <= ord(character) <= end for start, end in INDIC_RANGES) for character in text
    )


def extract_text(
    images: list[Image.Image],
    config: DetectionConfig,
    *,
    deadline: float | None = None,
) -> OcrResult:
    texts: list[str] = []
    confidences: list[float] = []
    errors: list[str] = []
    pages = 0
    for image in images:
        if deadline is not None and monotonic() >= deadline:
            logger.warning("OCR document deadline reached", pages_done=pages)
            break
        try:
            text, confidence = extract_image_text(image, config, deadline=deadline)
        except OcrUnavailableError as exc:
            # Report once and stop: if the engine is missing for one page it is
            # missing for all of them.
            logger.error("OCR engine unavailable", error=str(exc))
            errors.append(f"ocr unavailable: {exc}")
            break
        pages += 1
        if text:
            texts.append(text)
        confidences.append(confidence)
    mean_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return OcrResult("\n".join(texts), round(mean_confidence, 3), pages, errors)


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

    prepared = prepare(image)
    text, confidence = tesseract_backend.run(prepared, config)

    should_fallback = confidence < config.ocr.fallback_confidence_threshold or (
        config.ocr.use_paddle_for_indic and wants_indic(config)
    )
    if not should_fallback:
        return text, confidence
    if deadline is not None and monotonic() >= deadline:
        return text, confidence

    fallback_text, fallback_confidence = paddle_backend.run(prepared, config)
    if fallback_text and fallback_confidence >= confidence:
        return fallback_text, fallback_confidence
    return text, confidence
