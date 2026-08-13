"""Risk scoring.

Weights and aggregation formula live in ``weights.py``. See
``docs/plans/detection-engine.md`` §10.

    entity_score = SENSITIVITY_WEIGHTS[type] * confidence * checksum_boost
    raw_score    = log1p(sum(entity_score)) * context_multiplier
    risk_score   = 100 * (1 - exp(-raw_score / normalization_scale))
    severity     = bucket(risk_score)
"""

from __future__ import annotations

from math import exp, log1p

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.models import Entity, Severity
from aurodlpv2_detection.scoring.weights import (
    CHECKSUM_VALIDATED_BOOST,
    RISK_NORMALIZATION_SCALE,
    SENSITIVITY_WEIGHTS,
    bucket,
)

MEDICAL_CONTEXT_TYPES = {"ICD10", "MEDICAL_DISEASE_DISORDER", "MEDICAL_MEDICATION"}
MEDICAL_CONTEXT_BOOST_TARGETS = {"PERSON", "MRN", "ABHA", "IN_ABHA", "IN_AADHAAR"}


def score(
    entities: list[Entity],
    config: DetectionConfig | None = None,
) -> tuple[float, Severity]:
    resolved_config = config or DetectionConfig()
    raw_score = log1p(sum(_entity_contribution(entity) for entity in entities))
    if _has_medical_context(entities) and resolved_config.nlp.medical_ner_context_boost:
        raw_score *= resolved_config.nlp.context_boost_multiplier
    normalized_score = 100 * (1 - exp(-raw_score / RISK_NORMALIZATION_SCALE))
    rounded_score = round(min(100.0, max(0.0, normalized_score)), 2)
    return rounded_score, bucket(rounded_score)


def _entity_contribution(entity: Entity) -> float:
    checksum_boost = CHECKSUM_VALIDATED_BOOST if _checksum_validated(entity) else 1.0
    return SENSITIVITY_WEIGHTS.get(entity.type, 1.0) * entity.confidence * checksum_boost


def _checksum_validated(entity: Entity) -> bool:
    return entity.type == "IN_AADHAAR"


def _has_medical_context(entities: list[Entity]) -> bool:
    entity_types = {entity.type for entity in entities}
    return bool(
        entity_types & MEDICAL_CONTEXT_TYPES and entity_types & MEDICAL_CONTEXT_BOOST_TARGETS
    )
