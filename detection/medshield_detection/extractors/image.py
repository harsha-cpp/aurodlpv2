"""Image -> OCR pipeline (delegates to ocr.router)."""

from __future__ import annotations

from io import BytesIO

import structlog
from PIL import Image, UnidentifiedImageError

logger = structlog.get_logger(__name__)
MAX_IMAGE_PIXELS = 10000 * 10000


def open_image(data: bytes) -> Image.Image | None:
    try:
        image = Image.open(BytesIO(data))
        width, height = image.size
        if width * height > MAX_IMAGE_PIXELS:
            logger.warning("image attachment exceeds dimension limit")
            return None
        image.load()
        return image.convert("RGB")
    except (OSError, UnidentifiedImageError):
        logger.warning("image attachment extraction failed")
        return None
