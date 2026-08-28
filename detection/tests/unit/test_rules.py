"""Rule-pack behaviour: validators, context gating and overlap resolution.

Each test here corresponds to a false positive or false negative that was real
before the rule pack existed.
"""

from __future__ import annotations

import pytest

from aurodlpv2_detection.api import detect_email
from aurodlpv2_detection.models import EmailPayload
from aurodlpv2_detection.recognition.validators import (
    validate_aadhaar,
    validate_driving_license,
    validate_gstin,
    validate_ifsc,
    validate_pan,
    validate_passport,
)


def _types(body: str, subject: str = "") -> list[str]:
    result = detect_email(EmailPayload(subject=subject, body=body))
    return [entity.type for entity in result.entities]


# --------------------------------------------------------------- validators --


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("7534 7930 7460", True),
        ("753479307460", True),
        ("7534-7930-7460", True),
        ("2345 6789 0123", False),  # checksum fails
        ("1234 5678 9012", False),  # leading 1 is not issued
        ("1111 1111 1111", False),  # repeated digits
        ("75347930746", False),  # too short
    ],
)
def test_validate_aadhaar(value: str, expected: bool) -> None:
    assert validate_aadhaar(value) is expected


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("HKPPS5875Q", True),
        ("ABCDE1234F", False),  # the canonical placeholder
        ("HKPZS5875Q", False),  # Z is not a holder type
        ("-7236-8829", False),  # the string Presidio used to report as a PAN
        ("AAAAA1234A", False),
    ],
)
def test_validate_pan(value: str, expected: bool) -> None:
    assert validate_pan(value) is expected


def test_validate_gstin_checks_the_check_digit() -> None:
    assert validate_gstin("29ILVPC5151I1ZI") is True
    assert validate_gstin("29ILVPC5151I1ZP") is False


def test_validate_ifsc() -> None:
    assert validate_ifsc("NBEF0A9M3FI") is True
    assert validate_ifsc("NBEF1A9M3FI") is False  # fifth character must be 0


def test_validate_passport_and_licence() -> None:
    assert validate_passport("M8234567") is True
    assert validate_passport("Q8234567") is False  # Q is not issued
    assert validate_driving_license("MH1220110012345") is True
    assert validate_driving_license("ZZ1220110012345") is False  # not a state code


# ------------------------------------------------------------ context gating --


def test_raw_fourteen_digits_need_abha_vocabulary() -> None:
    assert "ABHA_NUMBER" not in _types("Please process vendor invoice 12345678901234.")
    assert "ABHA_NUMBER" in _types("The health ID captured at the camp was 45120099887766.")


def test_prefixed_id_needs_clinical_context() -> None:
    assert "MRN" not in _types("Order HSP-2026-0012 for stationery has been delivered.")
    assert "MRN" in _types("Patient record SMH-2026-004417 admitted for treatment.")


def test_bare_icd_category_needs_clinical_context() -> None:
    assert "ICD10" not in _types("Known issue K21 in the tracker is deferred to v2.15.")
    assert "ICD10" in _types("Primary diagnosis K21 recorded for the admitted patient.")


def test_specific_icd_code_stands_without_a_diagnosis_keyword() -> None:
    """E78.5 carries a decimal, so it does not need the word 'diagnosis'."""
    assert "ICD10" in _types("Known hyperlipidaemia (E78.5) noted on the clinical review.")


def test_ten_digit_amounts_are_not_phone_numbers() -> None:
    assert "IN_PHONE" not in _types(
        "Capital budget 9845000000 rupees against a revised estimate of 8420000000."
    )
    assert "IN_PHONE" in _types("The patient's mobile number is 9845123456.")


def test_ordinary_prose_after_policy_is_not_a_policy_number() -> None:
    assert "INSURANCE_POLICY" not in _types(
        "The consent policy has been revised to require a witness signature."
    )
    assert "INSURANCE_POLICY" in _types("Policy number: P/181234/12/2026/004567")


# ------------------------------------------------------- overlap resolution --


def test_gstin_beats_the_pan_embedded_inside_it() -> None:
    types = _types("The employer's GSTIN is 29ILVPC5151I1ZI for billing.")
    assert "IN_GSTIN" in types
    assert "IN_PAN" not in types


def test_upi_handle_beats_email_and_phone() -> None:
    types = _types("Patient paid the deposit from 9845123456@ybl this morning.")
    assert "IN_UPI" in types
    assert "EMAIL_ADDRESS" not in types


def test_abha_address_beats_email() -> None:
    types = _types("Health locker address is ramesh.iyer@abdm for the upload.")
    assert "ABHA_ADDRESS" in types
    assert "EMAIL_ADDRESS" not in types


# ------------------------------------------------------------- list handling --


def test_comma_separated_identifier_lists_are_all_captured() -> None:
    """A bulk list is the exposure the risk model must not under-read."""
    result = detect_email(
        EmailPayload(body="UHIDs 0038001, 0038007 and 0038014 need follow up.")
    )
    mrns = [entity for entity in result.entities if entity.type == "MRN"]
    assert len(mrns) == 3


# -------------------------------------------------------------------- names --


def test_lowercase_prose_is_not_a_person() -> None:
    """The PERSON rules are case-sensitive; 'the patient' is not a name."""
    assert "PERSON" not in _types("the patient in bed 7 became oliguric overnight")


def test_titled_and_labelled_names_are_detected() -> None:
    assert "PERSON" in _types("Please admit Mrs Kalpana Venkataraman today.")
    assert "PERSON" in _types("Patient: Meera Sundaram, 62F, for review.")
