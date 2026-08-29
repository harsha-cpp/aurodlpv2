from __future__ import annotations

from typing import Final

CANONICAL_TYPES: Final[frozenset[str]] = frozenset(
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
        "LAB_ACCESSION",
        "ICD10",
        "MEDICAL_LICENSE",
        "INSURANCE_POLICY",
        "BANK_ACCOUNT",
        "IN_IFSC",
        "IN_UPI",
        "IN_GSTIN",
        "PERSON",
        "DATE_OF_BIRTH",
        "IN_PHONE",
        "EMAIL_ADDRESS",
    }
)

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
    return ENGINE_TYPE_ALIASES.get(engine_type, engine_type)
