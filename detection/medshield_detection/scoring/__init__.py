"""Risk scoring.

Weights and aggregation formula live in ``weights.py``. See
``docs/plans/detection-engine.md`` §10.

    entity_score = SENSITIVITY_WEIGHTS[type] * confidence * checksum_boost
    doc_score    = log1p(sum(entity_score)) * context_multiplier
    severity     = bucket(doc_score)
"""

from __future__ import annotations

from math import log1p

from medshield_detection.config import DetectionConfig
from medshield_detection.models import Entity, Severity
from medshield_detection.scoring.weights import (
    CHECKSUM_VALIDATED_BOOST,
    SENSITIVITY_WEIGHTS,
    bucket,
)

MEDICAL_CONTEXT_TYPES = {"MEDICAL_DISEASE_DISORDER", "MEDICAL_MEDICATION"}
MEDICAL_CONTEXT_BOOST_TARGETS = {"PERSON", "MRN", "ABHA", "IN_ABHA", "IN_AADHAAR"}


def score(
    entities: list[Entity],
    config: DetectionConfig | None = None,
) -> tuple[float, Severity]:
    resolved_config = config or DetectionConfig()
    raw_score = log1p(sum(_entity_contribution(entity) for entity in entities))
    if _has_medical_context(entities) and resolved_config.nlp.medical_ner_context_boost:
        raw_score *= resolved_config.nlp.context_boost_multiplier
    rounded_score = round(raw_score, 2)
    return rounded_score, bucket(rounded_score)


def _entity_contribution(entity: Entity) -> float:
    checksum_boost = CHECKSUM_VALIDATED_BOOST if _checksum_validated(entity) else 1.0
    return SENSITIVITY_WEIGHTS.get(entity.type, 1.0) * entity.confidence * checksum_boost


def _checksum_validated(entity: Entity) -> bool:
    return entity.type == "IN_AADHAAR"


def _has_medical_context(entities: list[Entity]) -> bool:
    entity_types = {entity.type for entity in entities}
    return bool(
        entity_types & MEDICAL_CONTEXT_TYPES
        and entity_types & MEDICAL_CONTEXT_BOOST_TARGETS
    )
