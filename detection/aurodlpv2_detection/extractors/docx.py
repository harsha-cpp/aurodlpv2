"""DOCX extraction via python-docx."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from importlib import import_module
from io import BytesIO
from typing import Protocol, cast

import structlog

logger = structlog.get_logger(__name__)


class _Paragraph(Protocol):
    text: str


class _Cell(Protocol):
    text: str


class _Row(Protocol):
    cells: Iterable[_Cell]


class _Table(Protocol):
    rows: Iterable[_Row]


class _Document(Protocol):
    paragraphs: Iterable[_Paragraph]
    tables: Iterable[_Table]


def extract_text(data: bytes) -> str:
    try:
        document_factory = cast(Callable[[BytesIO], _Document], import_module("docx").Document)
        document = document_factory(BytesIO(data))
        chunks = [paragraph.text for paragraph in document.paragraphs if paragraph.text]
        for table in document.tables:
            for row in table.rows:
                chunks.extend(cell.text for cell in row.cells if cell.text)
        return "\n".join(chunks)
    except Exception:
        logger.warning("docx attachment extraction failed")
        return ""
