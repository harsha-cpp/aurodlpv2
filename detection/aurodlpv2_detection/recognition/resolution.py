from __future__ import annotations

from aurodlpv2_detection.recognition.patterns import RawMatch


def _overlaps(left: RawMatch, right: RawMatch) -> bool:
    return left.start < right.end and right.start < left.end


def _rank(match: RawMatch) -> tuple[int, int, float]:
    return (match.priority, match.end - match.start, match.confidence)


def resolve_overlaps(matches: list[RawMatch]) -> list[RawMatch]:
    ordered = sorted(matches, key=_rank, reverse=True)
    kept: list[RawMatch] = []
    for candidate in ordered:
        if any(_overlaps(candidate, accepted) for accepted in kept):
            continue
        kept.append(candidate)
    return sorted(kept, key=lambda match: (match.start, match.end))


def _normalize(entity_type: str, value: str) -> str:
    compact = value.strip().upper()
    if entity_type in {"PERSON", "EMAIL_ADDRESS", "ABHA_ADDRESS", "IN_UPI"}:
        return " ".join(compact.split())
    return "".join(character for character in compact if character.isalnum())


def group_by_value(matches: list[RawMatch]) -> dict[tuple[str, str], list[RawMatch]]:
    grouped: dict[tuple[str, str], list[RawMatch]] = {}
    for match in matches:
        key = (match.entity_type, _normalize(match.entity_type, match.value))
        grouped.setdefault(key, []).append(match)
    return grouped
