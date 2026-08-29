from __future__ import annotations

from math import exp, log2
from typing import Final

from aurodlpv2_detection.models import Severity

SENSITIVITY_WEIGHTS: Final[dict[str, float]] = {
    "IN_AADHAAR": 10.0,
    "IN_PASSPORT": 8.0,
    "IN_PAN": 7.0,
    "IN_DRIVING_LICENSE": 6.5,
    "IN_VOTER_ID": 6.0,
    "ABHA_NUMBER": 9.0,
    "ABHA_ADDRESS": 7.0,
    "MRN": 7.0,
    "PATIENT_VISIT_ID": 6.0,
    "LAB_ACCESSION": 5.0,
    "MEDICAL_LICENSE": 4.0,
    "BANK_ACCOUNT": 7.5,
    "IN_GSTIN": 4.0,
    "IN_UPI": 5.0,
    "IN_IFSC": 3.0,
    "INSURANCE_POLICY": 5.5,
    "PERSON": 2.5,
    "DATE_OF_BIRTH": 3.0,
    "IN_PHONE": 2.5,
    "EMAIL_ADDRESS": 2.0,
    "ICD10": 3.0,
}

DEFAULT_WEIGHT: Final[float] = 2.0

RISK_CURVE_K: Final[float] = 8.0

REPEAT_DAMPING: Final[float] = 0.35

SEVERITY_BUCKETS: Final[list[tuple[float, Severity]]] = [
    (1.0, "none"),
    (30.0, "low"),
    (55.0, "medium"),
    (78.0, "high"),
    (float("inf"), "critical"),
]


def weight_for(entity_type: str) -> float:
    return SENSITIVITY_WEIGHTS.get(entity_type, DEFAULT_WEIGHT)


def repeat_factor(occurrences: int) -> float:
    if occurrences <= 1:
        return 1.0
    return 1.0 + REPEAT_DAMPING * log2(occurrences)


def risk_from_weight(total_weight: float) -> float:
    if total_weight <= 0:
        return 0.0
    return round(100.0 * (1.0 - exp(-total_weight / RISK_CURVE_K)), 2)


def bucket(risk_score: float) -> Severity:
    for cutoff, label in SEVERITY_BUCKETS:
        if risk_score < cutoff:
            return label
    return "critical"
