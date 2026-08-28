"""Risk scoring on the 0-100 scale.

These pin the properties the policy engine depends on: the scale is genuinely
0-100, combinations outrank single identifiers, and repeating one value never
outranks exposing several distinct ones.
"""

from __future__ import annotations

import pytest

from aurodlpv2_detection.models import Entity
from aurodlpv2_detection.scoring import score
from aurodlpv2_detection.scoring.weights import bucket


def _entity(entity_type: str, value: str, confidence: float = 1.0) -> Entity:
    return Entity(
        type=entity_type,
        masked_value=value,
        confidence=confidence,
        source="body",
    )


@pytest.mark.parametrize(
    ("risk", "expected"),
    [
        (0.0, "none"),
        (0.9, "none"),
        (1.0, "low"),
        (29.9, "low"),
        (30.0, "medium"),
        (54.9, "medium"),
        (55.0, "high"),
        (77.9, "high"),
        (78.0, "critical"),
        (100.0, "critical"),
    ],
)
def test_bucket_boundaries(risk: float, expected: str) -> None:
    assert bucket(risk) == expected


def test_no_entities_scores_zero() -> None:
    assert score([]) == (0.0, "none")


def test_scale_is_zero_to_one_hundred() -> None:
    """The previous scale topped out near 7 while policy tested for >= 80."""
    risk, _ = score([_entity("IN_AADHAAR", "****7460")] * 1)
    assert 0.0 <= risk <= 100.0
    assert risk > 50.0


def test_single_aadhaar_is_high_severity() -> None:
    risk, severity = score([_entity("IN_AADHAAR", "****7460")])
    assert severity == "high"
    assert 65.0 < risk < 80.0


def test_combination_outranks_its_parts() -> None:
    """A record number beside a diagnosis and a name is the PHI case."""
    mrn_only, _ = score([_entity("MRN", "***4518")])
    combined, severity = score(
        [
            _entity("MRN", "***4518"),
            _entity("ICD10", "E11.9"),
            _entity("PERSON", "Lakshmi Devi"),
        ]
    )
    assert combined > mrn_only
    assert severity in {"high", "critical"}


def test_repeating_one_value_scores_below_several_distinct_values() -> None:
    """Repetition is not exposure: five copies of one Aadhaar is one patient."""
    repeated, _ = score([_entity("IN_AADHAAR", "****7460") for _ in range(5)])
    distinct, _ = score(
        [
            _entity("IN_AADHAAR", f"****{suffix}")
            for suffix in ("7460", "9197", "7545", "1839", "0811")
        ]
    )
    assert repeated < distinct


def test_repetition_is_dampened_not_linear() -> None:
    single, _ = score([_entity("IN_AADHAAR", "****7460")])
    quintuple, _ = score([_entity("IN_AADHAAR", "****7460") for _ in range(5)])
    assert quintuple < single * 5


def test_confidence_scales_contribution() -> None:
    certain, _ = score([_entity("MRN", "***4518", confidence=1.0)])
    unsure, _ = score([_entity("MRN", "***4518", confidence=0.5)])
    assert unsure < certain


def test_bulk_export_reaches_critical() -> None:
    """The case the old log scale could never push past 'high'."""
    entities = [
        _entity("MRN", f"***{index:04d}") for index in range(10)
    ] + [_entity("PERSON", f"Patient {index}") for index in range(10)]
    risk, severity = score(entities)
    assert severity == "critical"
    assert risk > 95.0
