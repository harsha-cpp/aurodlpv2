from __future__ import annotations

import structlog
from PIL import Image, ImageFilter, ImageOps

logger = structlog.get_logger(__name__)

MIN_OCR_WIDTH = 1600
MAX_OCR_WIDTH = 4000
MAX_OCR_PIXELS = 40_000_000


def prepare(image: Image.Image) -> Image.Image:
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
