"""Canonical PHI/PII entity vocabulary used by the labelled corpus.

Ground truth is labelled against this vocabulary, not against whatever the
engine happens to emit today. Types the engine does not implement yet are
still labelled — they surface as recall misses, which is the point.
"""

from __future__ import annotations

from typing import Final

#: Every entity type the corpus may label. Detections carrying a type outside
#: this set are counted as false positives against ``UNKNOWN``.
CANONICAL_TYPES: Final[frozenset[str]] = frozenset(
    {
        # Government identifiers
        "IN_AADHAAR",
        "IN_PAN",
        "IN_PASSPORT",
        "IN_DRIVING_LICENSE",
        "IN_VOTER_ID",
        # Health identifiers
        "ABHA_NUMBER",
        "ABHA_ADDRESS",
        "MRN",
        "PATIENT_VISIT_ID",
        "LAB_ACCESSION",
        "ICD10",
        "MEDICAL_LICENSE",
        # Financial
        "INSURANCE_POLICY",
        "BANK_ACCOUNT",
        "IN_IFSC",
        "IN_UPI",
        "IN_GSTIN",
        # Personal
        "PERSON",
        "DATE_OF_BIRTH",
        "IN_PHONE",
        "EMAIL_ADDRESS",
    }
)

#: Types the current engine can emit, mapped onto the canonical vocabulary.
#: Lets the harness score today's engine without pretending its names are final.
ENGINE_TYPE_ALIASES: Final[dict[str, str]] = {
    "IN_AADHAAR": "IN_AADHAAR",
    "IN_PAN": "IN_PAN",
    "ABHA": "ABHA_NUMBER",
    "IN_ABHA": "ABHA_NUMBER",
    "ABHA_ID": "ABHA_NUMBER",
    "MRN": "MRN",
    "ICD10": "ICD10",
    "ICD10_CODE": "ICD10",
    "PERSON": "PERSON",
    "EMAIL_ADDRESS": "EMAIL_ADDRESS",
    "PHONE_NUMBER": "IN_PHONE",
    "IN_PHONE": "IN_PHONE",
    "DATE_TIME": "DATE_OF_BIRTH",
    "MEDICAL_LICENSE": "MEDICAL_LICENSE",
}


def canonicalize(engine_type: str) -> str:
    """Map an engine entity type onto the canonical vocabulary."""
    return ENGINE_TYPE_ALIASES.get(engine_type, engine_type)
