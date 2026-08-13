"""DOCX extraction via python-docx."""

from __future__ import annotations

from collections.abc import Callable, Iterable
from importlib import import_module
from io import BytesIO
from typing import Protocol, cast

import structlog

logger = structlog.get_logger(__name__)
MAX_EXTRACTED_CHARS = 1_000_000


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
        chunks: list[str] = []
        total_chars = 0
        for paragraph in document.paragraphs:
            total_chars = _append_chunk(chunks, paragraph.text, total_chars)
            if total_chars >= MAX_EXTRACTED_CHARS:
                return "\n".join(chunks)
        for table in document.tables:
            for row in table.rows:
                for cell in row.cells:
                    total_chars = _append_chunk(chunks, cell.text, total_chars)
                    if total_chars >= MAX_EXTRACTED_CHARS:
                        return "\n".join(chunks)
        return "\n".join(chunks)
    except Exception:
        logger.warning("docx attachment extraction failed")
        return ""


def _append_chunk(chunks: list[str], value: str, total_chars: int) -> int:
    if not value:
        return total_chars
    remaining = MAX_EXTRACTED_CHARS - total_chars
    if remaining <= 0:
        return total_chars
    chunk = value[:remaining]
    chunks.append(chunk)
    return total_chars + len(chunk)
