"""Risk scoring on a real 0-100 scale.

    weight = sum over distinct values of (sensitivity * confidence * repeat_factor)
    risk   = 100 * (1 - exp(-weight / K))
    severity = bucket(risk)

Scoring works from *distinct* values so that repetition of one identifier does
not read as exposure of many, and combinations count: a record number beside a
diagnosis and a name is a bigger exposure than any of them alone.
"""

from __future__ import annotations

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.models import Entity, Severity
from aurodlpv2_detection.scoring.weights import (
    SENSITIVITY_WEIGHTS,
    bucket,
    repeat_factor,
    risk_from_weight,
    weight_for,
)

#: Identifiers that make a person directly re-identifiable on their own.
DIRECT_IDENTIFIERS = frozenset(
    {
        "IN_AADHAAR",
        "IN_PAN",
        "IN_PASSPORT",
        "IN_DRIVING_LICENSE",
        "IN_VOTER_ID",
        "ABHA_NUMBER",
        "ABHA_ADDRESS",
        "MRN",
        "PATIENT_VISIT_ID",
        "BANK_ACCOUNT",
    }
)

#: Clinical context that turns a bare identifier into health information.
CLINICAL_TYPES = frozenset({"ICD10", "LAB_ACCESSION", "MEDICAL_LICENSE"})

#: Applied when a direct identifier appears alongside clinical content - the
#: combination is what makes a message PHI rather than merely personal data.
COMBINATION_MULTIPLIER = 1.2


def _normalize(entity: Entity) -> str:
    compact = entity.masked_value.strip().upper()
    if entity.type in {"PERSON", "EMAIL_ADDRESS", "ABHA_ADDRESS", "IN_UPI"}:
        return " ".join(compact.split())
    return "".join(character for character in compact if character.isalnum())


def total_weight(entities: list[Entity]) -> float:
    """Accumulated sensitivity weight across distinct values."""
    grouped: dict[tuple[str, str], list[Entity]] = {}
    for entity in entities:
        grouped.setdefault((entity.type, _normalize(entity)), []).append(entity)

    weight = 0.0
    for (entity_type, _value), group in grouped.items():
        best_confidence = max(item.confidence for item in group)
        weight += weight_for(entity_type) * best_confidence * repeat_factor(len(group))

    present = {entity.type for entity in entities}
    if present & DIRECT_IDENTIFIERS and present & CLINICAL_TYPES:
        weight *= COMBINATION_MULTIPLIER
    return weight


def score(
    entities: list[Entity],
    config: DetectionConfig | None = None,
) -> tuple[float, Severity]:
    """Return ``(risk_score_0_100, severity)``."""
    del config  # per-tenant weighting is applied by the caller's rule pack
    if not entities:
        return 0.0, "none"
    risk = risk_from_weight(total_weight(entities))
    return risk, bucket(risk)


__all__ = ["SENSITIVITY_WEIGHTS", "bucket", "score", "total_weight"]
