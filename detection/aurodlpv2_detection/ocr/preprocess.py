"""Image preparation for OCR.

Tesseract wants roughly 300 DPI, greyscale, high-contrast input. Feeding it a
72-DPI colour screenshot of a prescription is the single biggest cause of empty
OCR output, and the previous pipeline did exactly that.
"""

from __future__ import annotations

import structlog
from PIL import Image, ImageFilter, ImageOps

logger = structlog.get_logger(__name__)

#: Below this, upscale before OCR. A scanned page at 72 DPI is ~612x792.
MIN_OCR_WIDTH = 1600
#: Never blow an image up past this; the gain flattens and the cost does not.
MAX_OCR_WIDTH = 4000
MAX_OCR_PIXELS = 40_000_000


def prepare(image: Image.Image) -> Image.Image:
    """Greyscale, upscale small images, normalise contrast, sharpen."""
    try:
        working = image.convert("L")
        working = _upscale(working)
        working = ImageOps.autocontrast(working, cutoff=1)
        return working.filter(ImageFilter.SHARPEN)
    except (OSError, ValueError):
        logger.warning("OCR preprocessing failed; using the original image")
        return image


def _upscale(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width <= 0 or height <= 0 or width >= MIN_OCR_WIDTH:
        return image

    scale = min(MIN_OCR_WIDTH / width, MAX_OCR_WIDTH / max(width, 1))
    target = (int(width * scale), int(height * scale))
    if target[0] * target[1] > MAX_OCR_PIXELS:
        return image
    return image.resize(target, Image.Resampling.LANCZOS)
