from __future__ import annotations

from collections.abc import Iterable, Sequence

MAX_HEADER_LENGTH = 40


def _looks_like_header(row: Sequence[str]) -> bool:
    filled = [cell for cell in row if cell.strip()]
    if len(filled) < 2:
        return False
    for cell in filled:
        if len(cell) > MAX_HEADER_LENGTH:
            return False
        if any(character.isdigit() for character in cell):
            return False
    return True


def render_rows(rows: Iterable[Sequence[str]]) -> list[str]:
    header: list[str] | None = None
    lines: list[str] = []

    for row in rows:
        cells = [str(cell).strip() for cell in row]
        if not any(cells):
            continue
        if header is None and _looks_like_header(cells):
            header = cells
            lines.append(" ".join(cell for cell in cells if cell))
            continue
        if header is None:
            lines.append(" ".join(cell for cell in cells if cell))
            continue
        lines.append(_pair_with_header(header, cells))
    return lines


def _pair_with_header(header: Sequence[str], cells: Sequence[str]) -> str:
    parts: list[str] = []
    for index, cell in enumerate(cells):
        if not cell:
            continue
        label = header[index].strip() if index < len(header) else ""
        parts.append(f"{label} {cell}" if label else cell)
    return ", ".join(parts)
