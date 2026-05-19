"""PDF extraction via PyMuPDF. Falls back to OCR per page when text density is low."""

from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass
from importlib import import_module
from io import BytesIO
from typing import Protocol, cast

import structlog
from PIL import Image

logger = structlog.get_logger(__name__)
LOW_TEXT_CHARS = 50


class _Pixmap(Protocol):
    def tobytes(self, output: str) -> bytes: ...


class _PdfPage(Protocol):
    def get_text(self, option: str = "text") -> str: ...

    def get_images(self, full: bool = False) -> list[object]: ...

    def get_pixmap(self) -> _Pixmap: ...


class _PdfDocument(Protocol):
    def __iter__(self) -> Iterator[_PdfPage]: ...

    def close(self) -> None: ...


class _FitzModule(Protocol):
    def open(self, *, stream: bytes, filetype: str) -> _PdfDocument: ...


@dataclass(frozen=True)
class PdfPageText:
    text: str
    ocr_image: Image.Image | None = None


def extract_pages(data: bytes) -> list[PdfPageText]:
    try:
        fitz = cast(_FitzModule, import_module("fitz"))
        document = fitz.open(stream=data, filetype="pdf")
    except Exception:
        logger.warning("pdf attachment open failed")
        return []

    pages: list[PdfPageText] = []
    try:
        for page in document:
            text = page.get_text("text").strip()
            image_count = len(page.get_images(full=True))
            ocr_image = (
                _render_page(page) if image_count > 0 and len(text) < LOW_TEXT_CHARS else None
            )
            pages.append(PdfPageText(text=text, ocr_image=ocr_image))
    except Exception:
        logger.warning("pdf attachment extraction failed")
        return pages
    finally:
        document.close()
    return pages


def extract_text_pages(data: bytes) -> list[str]:
    return [page.text for page in extract_pages(data)]


def _render_page(page: _PdfPage) -> Image.Image | None:
    try:
        png_bytes = page.get_pixmap().tobytes("png")
        image = Image.open(BytesIO(png_bytes))
        image.load()
        return image.convert("RGB")
    except Exception:
        logger.warning("pdf page render for OCR failed")
        return None
