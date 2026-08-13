"""XLSX extraction via openpyxl (iter_rows, values_only=True)."""

from __future__ import annotations

from collections.abc import Iterable
from importlib import import_module
from io import BytesIO
from typing import Protocol, cast

import structlog

logger = structlog.get_logger(__name__)
MAX_XLSX_CELLS = 100_000
MAX_EXTRACTED_CHARS = 1_000_000


class _Worksheet(Protocol):
    def iter_rows(self, *, values_only: bool) -> Iterable[tuple[object, ...]]: ...


class _Workbook(Protocol):
    worksheets: list[_Worksheet]

    def close(self) -> None: ...


class _OpenpyxlModule(Protocol):
    def load_workbook(
        self,
        filename: BytesIO,
        *,
        read_only: bool,
        data_only: bool,
    ) -> _Workbook: ...


def extract_text(data: bytes) -> str:
    try:
        openpyxl = cast(_OpenpyxlModule, import_module("openpyxl"))
        workbook = openpyxl.load_workbook(
            BytesIO(data),
            read_only=True,
            data_only=True,
        )
    except Exception:
        logger.warning("xlsx attachment open failed")
        return ""

    chunks: list[str] = []
    try:
        cells_seen = 0
        total_chars = 0
        for worksheet in workbook.worksheets:
            for row in worksheet.iter_rows(values_only=True):
                for value in row:
                    if value is None:
                        continue
                    cells_seen += 1
                    if cells_seen > MAX_XLSX_CELLS:
                        logger.warning(
                            "xlsx attachment cell limit reached",
                            max_cells=MAX_XLSX_CELLS,
                        )
                        return "\n".join(chunks)
                    total_chars = _append_chunk(chunks, str(value), total_chars)
                    if total_chars >= MAX_EXTRACTED_CHARS:
                        logger.warning(
                            "xlsx attachment text limit reached",
                            max_chars=MAX_EXTRACTED_CHARS,
                        )
                        return "\n".join(chunks)
    except Exception:
        logger.warning("xlsx attachment extraction failed")
    finally:
        workbook.close()
    return "\n".join(chunks)


def _append_chunk(chunks: list[str], value: str, total_chars: int) -> int:
    remaining = MAX_EXTRACTED_CHARS - total_chars
    if remaining <= 0:
        return total_chars
    chunk = value[:remaining]
    chunks.append(chunk)
    return total_chars + len(chunk)
