"""Overlap resolution across rules.

Without this, ``96-9015-1720-1488`` reports as both an ABHA number and the
Aadhaar hiding inside it — the twelve digits pass Verhoeff about one time in
ten. Composite identifiers outrank their fragments by priority, then by span
length, then by confidence.
"""

from __future__ import annotations

from aurodlpv2_detection.recognition.patterns import RawMatch


def _overlaps(left: RawMatch, right: RawMatch) -> bool:
    return left.start < right.end and right.start < left.end


def _rank(match: RawMatch) -> tuple[int, int, float]:
    return (match.priority, match.end - match.start, match.confidence)


def resolve_overlaps(matches: list[RawMatch]) -> list[RawMatch]:
    """Keep the strongest match on each overlapping span."""
    ordered = sorted(matches, key=_rank, reverse=True)
    kept: list[RawMatch] = []
    for candidate in ordered:
        if any(_overlaps(candidate, accepted) for accepted in kept):
            continue
        kept.append(candidate)
    return sorted(kept, key=lambda match: (match.start, match.end))


def _normalize(entity_type: str, value: str) -> str:
    """Comparison key for "the same identifier written twice"."""
    compact = value.strip().upper()
    if entity_type in {"PERSON", "EMAIL_ADDRESS", "ABHA_ADDRESS", "IN_UPI"}:
        return " ".join(compact.split())
    return "".join(character for character in compact if character.isalnum())


def group_by_value(matches: list[RawMatch]) -> dict[tuple[str, str], list[RawMatch]]:
    """Group matches by entity type and normalized value.

    Repetition of one identifier is not the same signal as exposure of many, so
    scoring works from these groups rather than the raw match list.
    """
    grouped: dict[tuple[str, str], list[RawMatch]] = {}
    for match in matches:
        key = (match.entity_type, _normalize(match.entity_type, match.value))
        grouped.setdefault(key, []).append(match)
    return grouped
