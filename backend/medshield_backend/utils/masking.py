"""Value masking for logs/audit/responses - never persist raw PHI."""

from __future__ import annotations


def mask_value(value: str, *, keep_last: int = 4) -> str:
    """Return ``****1234`` style mask. Keeps last N visible chars."""
    if not value:
        return ""
    if len(value) <= keep_last:
        return "*" * len(value)
    return "*" * (len(value) - keep_last) + value[-keep_last:]
