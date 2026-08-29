from __future__ import annotations


def mask_value(value: str) -> str:
    visible = 4
    compact = value.strip()
    if len(compact) <= visible:
        return "*" * len(compact)
    return f"{'*' * (len(compact) - visible)}{compact[-visible:]}"
