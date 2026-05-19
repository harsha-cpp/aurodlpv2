"""XLSX extraction via openpyxl (iter_rows, values_only=True)."""

from __future__ import annotations

from collections.abc import Iterable
from importlib import import_module
from io import BytesIO
from typing import Protocol, cast

import structlog

logger = structlog.get_logger(__name__)


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
        for worksheet in workbook.worksheets:
            for row in worksheet.iter_rows(values_only=True):
                chunks.extend(str(value) for value in row if value is not None)
    except Exception:
        logger.warning("xlsx attachment extraction failed")
    finally:
        workbook.close()
    return "\n".join(chunks)
