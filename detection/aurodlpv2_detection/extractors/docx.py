from __future__ import annotations

import zipfile
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from importlib import import_module
from io import BytesIO
from typing import Any, Protocol, cast

import structlog
from PIL import Image, UnidentifiedImageError

logger = structlog.get_logger(__name__)

MAX_EXTRACTED_CHARS = 1_000_000
MAX_EMBEDDED_IMAGES = 20
_TEXT_XMLNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"


class _Paragraph(Protocol):
    text: str


class _Cell(Protocol):
    text: str


class _Row(Protocol):
    cells: Iterable[_Cell]


class _Table(Protocol):
    rows: Iterable[_Row]


def _empty_images() -> list[Image.Image]:
    return []


@dataclass(frozen=True, slots=True)
class DocxContent:
    text: str
    images: list[Image.Image] = field(default_factory=_empty_images)


def extract(data: bytes) -> DocxContent:
    chunks: list[str] = []
    total = 0

    try:
        document_factory = cast(Callable[[BytesIO], Any], import_module("docx").Document)
        document = document_factory(BytesIO(data))
    except Exception:
        logger.warning("docx attachment open failed")
        return DocxContent("")

    try:
        for paragraph in cast(Iterable[_Paragraph], document.paragraphs):
            total = _append(chunks, paragraph.text, total)
        for table in cast(Iterable[_Table], document.tables):
            for row in table.rows:
                for cell in row.cells:
                    total = _append(chunks, cell.text, total)
        for section in cast(Iterable[Any], document.sections):
            for container in (section.header, section.footer):
                for paragraph in cast(Iterable[_Paragraph], container.paragraphs):
                    total = _append(chunks, paragraph.text, total)
    except Exception:
        logger.warning("docx attachment extraction failed")

    chunks.extend(_textbox_text(data))
    return DocxContent("\n".join(chunk for chunk in chunks if chunk), _embedded_images(data))


def extract_text(data: bytes) -> str:
    return extract(data).text


def _append(chunks: list[str], value: str, total: int) -> int:
    if not value or not value.strip():
        return total
    remaining = MAX_EXTRACTED_CHARS - total
    if remaining <= 0:
        return total
    chunk = value[:remaining]
    chunks.append(chunk)
    return total + len(chunk)


def _textbox_text(data: bytes) -> list[str]:
    try:
        from xml.etree import ElementTree

        with zipfile.ZipFile(BytesIO(data)) as archive:
            names = [
                name
                for name in archive.namelist()
                if name.startswith("word/") and name.endswith(".xml")
            ]
            found: list[str] = []
            for name in names[:20]:
                root = ElementTree.fromstring(archive.read(name))
                for node in root.iter(f"{{{_TEXT_XMLNS}}}txbxContent"):
                    text = "".join(
                        element.text or "" for element in node.iter(f"{{{_TEXT_XMLNS}}}t")
                    )
                    if text.strip():
                        found.append(text)
            return found
    except Exception:
        logger.warning("docx text box extraction failed")
        return []


def _embedded_images(data: bytes) -> list[Image.Image]:
    images: list[Image.Image] = []
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            media = [
                name
                for name in archive.namelist()
                if name.startswith("word/media/")
                and name.lower().endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff", ".bmp"))
            ]
            for name in media[:MAX_EMBEDDED_IMAGES]:
                try:
                    image = Image.open(BytesIO(archive.read(name)))
                    image.load()
                    images.append(image.convert("RGB"))
                except (OSError, UnidentifiedImageError, ValueError):
                    continue
    except Exception:
        logger.warning("docx embedded image extraction failed")
    return images
