from __future__ import annotations

from medshield_detection.recognizers import AbhaRecognizer, Icd10Recognizer, MrnRecognizer


def test_abha_formatted_high_confidence() -> None:
    hits = AbhaRecognizer().analyze("ABHA 12-3456-7890-1234", ["ABHA"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.85) < 0.001


def test_abha_raw_medium_confidence() -> None:
    hits = AbhaRecognizer().analyze("health ID 12345678901234", ["ABHA"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.5) < 0.001


def test_abha_rejects_leading_zero() -> None:
    assert AbhaRecognizer().analyze("ABHA 02-3456-7890-1234", ["ABHA"]) == []


def test_abha_rejects_short_raw_value() -> None:
    assert AbhaRecognizer().analyze("ABHA 1234567890123", ["ABHA"]) == []


def test_abha_detects_multiple_values() -> None:
    hits = AbhaRecognizer().analyze(
        "ABHA 12-3456-7890-1234 and 19876543210987",
        ["ABHA"],
    )

    assert len(hits) == 2


def test_mrn_default_pattern() -> None:
    hits = MrnRecognizer().analyze("MRN HSP-2026-0012", ["MRN"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.7) < 0.001


def test_mrn_accepts_four_letter_prefix() -> None:
    assert len(MrnRecognizer().analyze("UHID ABCD-2026-123456", ["MRN"])) == 1


def test_mrn_rejects_five_letter_prefix() -> None:
    assert MrnRecognizer().analyze("ABCDE-2026-1234", ["MRN"]) == []


def test_mrn_accepts_custom_pattern() -> None:
    hits = MrnRecognizer(["IPD-\\d{6}"]).analyze("patient ID IPD-123456", ["MRN"])

    assert len(hits) == 1


def test_mrn_ignores_oversized_custom_pattern() -> None:
    oversized_pattern = "A" * 201

    assert MrnRecognizer([oversized_pattern]).analyze(oversized_pattern, ["MRN"]) == []


def test_icd10_valid_code_high_confidence() -> None:
    hits = Icd10Recognizer().analyze("diagnosis E11.9", ["ICD10"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.9) < 0.001


def test_icd10_valid_code_case_insensitive() -> None:
    hits = Icd10Recognizer().analyze("condition e11.9", ["ICD10"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.9) < 0.001


def test_icd10_regex_only_candidate_lower_confidence() -> None:
    hits = Icd10Recognizer().analyze("ICD A01.9999", ["ICD10"])

    assert len(hits) == 1
    assert abs(hits[0].score - 0.4) < 0.001


def test_icd10_rejects_u_codes_by_pattern() -> None:
    assert Icd10Recognizer().analyze("ICD U07.1", ["ICD10"]) == []


def test_icd10_detects_multiple_codes() -> None:
    hits = Icd10Recognizer().analyze("dx E11.9 and condition Z99.89", ["ICD10"])

    assert len(hits) == 2
