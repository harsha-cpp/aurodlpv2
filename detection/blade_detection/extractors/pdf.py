from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from importlib import import_module
from io import BytesIO
from typing import Any, Protocol, cast

import structlog
from PIL import Image

logger = structlog.get_logger(__name__)

LOW_TEXT_CHARS = 50
MAX_PDF_PAGES = 50
PDF_BASE_DPI = 72
OCR_TARGET_DPI = 300


class _Pixmap(Protocol):
    def tobytes(self, output: str) -> bytes: ...


class _PdfPage(Protocol):
    def get_text(self, option: str = "text") -> str: ...

    def get_images(self, full: bool = False) -> list[object]: ...

    def get_pixmap(self, **kwargs: object) -> _Pixmap: ...


class _PdfDocument(Protocol):
    def __iter__(self) -> Iterator[_PdfPage]: ...

    def close(self) -> None: ...

    @property
    def needs_pass(self) -> bool: ...


@dataclass(frozen=True, slots=True)
class PdfPageText:
    text: str
    ocr_image: Image.Image | None = None


def extract_pages(data: bytes) -> list[PdfPageText]:
    try:
        fitz = cast(Any, import_module("fitz"))
        document = cast(_PdfDocument, fitz.open(stream=data, filetype="pdf"))
    except Exception:
        logger.warning("pdf attachment open failed")
        return []

    pages: list[PdfPageText] = []
    try:
        if getattr(document, "needs_pass", False):
            logger.warning("pdf attachment is password protected")
            return []
        for page_index, page in enumerate(document, start=1):
            if page_index > MAX_PDF_PAGES:
                logger.warning("pdf attachment page limit reached", max_pages=MAX_PDF_PAGES)
                break
            text = page.get_text("text").strip()
            ocr_image = _render_for_ocr(page) if len(text) < LOW_TEXT_CHARS else None
            pages.append(PdfPageText(text=text, ocr_image=ocr_image))
    except Exception:
        logger.warning("pdf attachment extraction failed")
        return pages
    finally:
        document.close()
    return pages


def extract_text_pages(data: bytes) -> list[str]:
    return [page.text for page in extract_pages(data)]


def _render_for_ocr(page: _PdfPage) -> Image.Image | None:
    try:
        fitz = cast(Any, import_module("fitz"))
        zoom = OCR_TARGET_DPI / PDF_BASE_DPI
        pixmap = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
        image = Image.open(BytesIO(pixmap.tobytes("png")))
        image.load()
        return image.convert("RGB")
    except Exception:
        logger.warning("pdf page render for OCR failed")
        return None
