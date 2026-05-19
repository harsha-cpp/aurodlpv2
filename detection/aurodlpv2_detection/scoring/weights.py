"""Per-entity sensitivity weights and severity buckets.

See ``docs/plans/detection-engine.md`` §10.
"""

from __future__ import annotations

from aurodlpv2_detection.models import Severity

SENSITIVITY_WEIGHTS: dict[str, float] = {
    "IN_AADHAAR": 10.0,
    "IN_PAN": 7.0,
    "ABHA": 9.0,
    "IN_ABHA": 9.0,
    "MRN": 8.0,
    "ICD10": 4.0,
    "PERSON": 2.0,
    "EMAIL_ADDRESS": 1.0,
    "PHONE_NUMBER": 1.5,
    "DATE_TIME": 0.5,
    "MEDICAL_LICENSE": 6.0,
    "US_SSN": 8.0,
}

CHECKSUM_VALIDATED_BOOST = 1.25

SEVERITY_BUCKETS: list[tuple[float, Severity]] = [
    (0.5, "none"),
    (2.0, "low"),
    (4.0, "medium"),
    (7.0, "high"),
    (float("inf"), "critical"),
]


def bucket(score: float) -> Severity:
    for cutoff, label in SEVERITY_BUCKETS:
        if score < cutoff:
            return label
    return "critical"
