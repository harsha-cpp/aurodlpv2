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
    "PATIENT_NAME": 4.0,
    "PATIENT_DOB": 6.0,
    "PATIENT_EMAIL": 5.0,
    "PATIENT_PHONE": 5.0,
    "PERSON": 2.0,
    "EMAIL_ADDRESS": 1.0,
    "PHONE_NUMBER": 1.5,
    "DATE_TIME": 0.5,
    "MEDICAL_LICENSE": 6.0,
    "US_SSN": 8.0,
}

CHECKSUM_VALIDATED_BOOST = 1.25
RISK_NORMALIZATION_SCALE = 3.0

SEVERITY_BUCKETS: list[tuple[float, Severity]] = [
    (0.01, "none"),
    (25.0, "low"),
    (50.0, "medium"),
    (75.0, "high"),
    (float("inf"), "critical"),
]


def bucket(score: float) -> Severity:
    for cutoff, label in SEVERITY_BUCKETS:
        if score < cutoff:
            return label
    return "critical"
