from __future__ import annotations

import pytest

from medshield_detection.config import DetectionConfig
from medshield_detection.models import Entity
from medshield_detection.scoring import score
from medshield_detection.scoring.weights import bucket


@pytest.mark.parametrize(
    ("score", "expected"),
    [
        (0.0, "none"),
        (0.4, "none"),
        (1.0, "low"),
        (3.0, "medium"),
        (6.5, "high"),
        (15.0, "critical"),
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

    assert risk_score == 2.66
    assert severity == "medium"


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

    assert risk_score == 2.6
    assert severity == "medium"


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

    assert risk_score == 2.3
