from __future__ import annotations

import pytest

from aurodlpv2_detection.config import DetectionConfig
from aurodlpv2_detection.models import Entity
from aurodlpv2_detection.scoring import score
from aurodlpv2_detection.scoring.weights import bucket


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.0, "none"),
        (0.4, "low"),
        (24.99, "low"),
        (25.0, "medium"),
        (50.0, "high"),
        (75.0, "critical"),
    ],
)
def test_bucket(score: float, expected: str) -> None:
    assert bucket(score) == expected


def test_score_uses_weighted_log_formula() -> None:
    risk_score, severity = score(
        [
            Entity(type="ABHA", masked_value="*************1234", confidence=0.85, source="body"),
            Entity(type="MRN", masked_value="*********0012", confidence=0.7, source="body"),
        ]
    )

    assert risk_score == 58.75
    assert severity == "high"


def test_score_applies_checksum_boost_for_aadhaar() -> None:
    risk_score, severity = score(
        [
            Entity(
                type="IN_AADHAAR",
                masked_value="********0124",
                confidence=1.0,
                source="body",
            )
        ]
    )

    assert risk_score == 58.0
    assert severity == "high"


def test_score_applies_medical_context_multiplier() -> None:
    config = DetectionConfig()
    config.nlp.medical_ner_context_boost = True
    risk_score, _severity = score(
        [
            Entity(type="MRN", masked_value="*********0012", confidence=0.7, source="body"),
            Entity(
                type="MEDICAL_DISEASE_DISORDER",
                masked_value="****",
                confidence=0.8,
                source="body",
            ),
        ],
        config,
    )

    assert risk_score == 53.57


def test_score_is_bounded_to_percentage_contract() -> None:
    entities = [
        Entity(type="IN_AADHAAR", masked_value="********0124", confidence=1.0, source="body")
        for _ in range(100)
    ]

    risk_score, severity = score(entities)

    assert 58 < risk_score <= 100
    assert severity == "critical"
