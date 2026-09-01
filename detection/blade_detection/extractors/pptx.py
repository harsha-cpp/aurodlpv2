from __future__ import annotations

from importlib import import_module
from io import BytesIO
from typing import Any, cast

import structlog

logger = structlog.get_logger(__name__)

MAX_EXTRACTED_CHARS = 1_000_000
MAX_SLIDES = 200


def extract_text(data: bytes) -> str:
    try:
        presentation_factory: Any = import_module("pptx").Presentation
        presentation = presentation_factory(BytesIO(data))
    except Exception:
        logger.warning("pptx attachment open failed")
        return ""

    chunks: list[str] = []
    total = 0
    try:
        for index, slide in enumerate(presentation.slides):
            if index >= MAX_SLIDES:
                break
            for shape in slide.shapes:
                total = _append(chunks, _shape_text(shape), total)
                if total >= MAX_EXTRACTED_CHARS:
                    return "\n".join(chunks)
            notes = getattr(slide, "notes_slide", None)
            if notes is not None and getattr(notes, "notes_text_frame", None) is not None:
                total = _append(chunks, notes.notes_text_frame.text, total)
    except Exception:
        logger.warning("pptx attachment extraction failed")
    return "\n".join(chunks)


def _shape_text(shape: Any) -> str:
    parts: list[str] = []
    if getattr(shape, "has_text_frame", False):
        parts.append(cast(str, shape.text_frame.text))
    if getattr(shape, "has_table", False):
        for row in shape.table.rows:
            parts.extend(cast(str, cell.text) for cell in row.cells)
    return "\n".join(part for part in parts if part)


def _append(chunks: list[str], value: str, total: int) -> int:
    if not value or not value.strip():
        return total
    remaining = MAX_EXTRACTED_CHARS - total
    if remaining <= 0:
        return total
    chunk = value[:remaining]
    chunks.append(chunk)
    return total + len(chunk)
