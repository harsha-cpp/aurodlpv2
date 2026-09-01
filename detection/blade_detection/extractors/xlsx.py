from __future__ import annotations

from collections.abc import Iterable
from importlib import import_module
from io import BytesIO
from typing import Any, Protocol, cast

import structlog

from blade_detection.extractors.tabular import render_rows

logger = structlog.get_logger(__name__)

MAX_CELLS = 200_000
MAX_EXTRACTED_CHARS = 1_000_000


class _Worksheet(Protocol):
    def iter_rows(self, *, values_only: bool) -> Iterable[tuple[object, ...]]: ...


class _Workbook(Protocol):
    worksheets: list[_Worksheet]

    def close(self) -> None: ...


def extract_text(data: bytes) -> str:
    text = _extract_xlsx(data)
    if text:
        return text
    return _extract_xls(data)


def _extract_xlsx(data: bytes) -> str:
    try:
        openpyxl = cast(Any, import_module("openpyxl"))
        workbook = cast(
            _Workbook,
            openpyxl.load_workbook(BytesIO(data), read_only=True, data_only=True),
        )
    except Exception:
        return ""

    chunks: list[str] = []
    try:
        cells = 0
        total = 0
        for worksheet in workbook.worksheets:
            rows: list[list[str]] = []
            for row in worksheet.iter_rows(values_only=True):
                values = [str(value) if value is not None else "" for value in row]
                cells += len(values)
                if cells > MAX_CELLS:
                    logger.warning("xlsx cell limit reached", max_cells=MAX_CELLS)
                    break
                rows.append(values)
            for line in render_rows(rows):
                total = _append(chunks, line, total)
                if total >= MAX_EXTRACTED_CHARS:
                    logger.warning("xlsx text limit reached")
                    return "\n".join(chunks)
    except Exception:
        logger.warning("xlsx attachment extraction failed")
    finally:
        workbook.close()
    return "\n".join(chunks)


def _extract_xls(data: bytes) -> str:
    try:
        xlrd = cast(Any, import_module("xlrd"))
        book = xlrd.open_workbook(file_contents=data)
    except Exception:
        logger.warning("xls attachment open failed")
        return ""

    chunks: list[str] = []
    try:
        cells = 0
        total = 0
        for sheet in book.sheets():
            rows: list[list[str]] = []
            for row_index in range(sheet.nrows):
                values = [str(value) for value in sheet.row_values(row_index)]
                cells += len(values)
                if cells > MAX_CELLS:
                    break
                rows.append(values)
            for line in render_rows(rows):
                total = _append(chunks, line, total)
                if total >= MAX_EXTRACTED_CHARS:
                    return "\n".join(chunks)
    except Exception:
        logger.warning("xls attachment extraction failed")
    return "\n".join(chunks)


def _append(chunks: list[str], value: str, total: int) -> int:
    if not value or not value.strip():
        return total
    remaining = MAX_EXTRACTED_CHARS - total
    if remaining <= 0:
        return total
    chunk = value[:remaining]
    chunks.append(chunk)
    return total + len(chunk)
