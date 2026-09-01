from __future__ import annotations

from typing import Final

from blade_detection.rules.schema import Rule, RulePack

RULE_PACK_VERSION: Final[str] = "2026.08.1"

_CLINICAL_CONTEXT: Final[list[str]] = [
    "diagnosis",
    "diagnosed",
    "diagnostic",
    "icd",
    "coded",
    "coding",
    "condition",
    "disease",
    "disorder",
    "syndrome",
    "patient",
    "admitted",
    "admission",
    "discharge",
    "discharged",
    "treatment",
    "treated",
    "clinical",
    "symptoms",
    "prognosis",
    "comorbidity",
    "presenting",
    "history of",
    "diabetes",
    "hypertension",
    "pneumonia",
    "asthma",
    "anaemia",
    "anemia",
    "carcinoma",
    "infection",
    "failure",
    "fracture",
    "delivery",
    "gastroenteritis",
    "dermatitis",
    "keratitis",
    "reaction",
    "epilepsy",
    "primary",
]

_COMMERCIAL_NEGATIVE: Final[list[str]] = [
    "invoice",
    "purchase order",
    "purchase",
    "vendor",
    "supplier",
    "quotation",
    "quoted",
    "quote",
    "series",
    "model",
    "asset",
    "serial",
    "stationery",
    "delivered",
    "store",
    "payment",
    "budget",
    "estimate",
    "release",
    "version",
    "tracker",
    "deferred",
    "warranty",
    "decommissioned",
    "register",
    "reorder",
    "stock",
    "batch",
    "shipment",
    "contract",
    "tender",
]

_ABHA_CONTEXT: Final[list[str]] = [
    "abha",
    "abdm",
    "health id",
    "health i.d",
    "health account",
    "ayushman",
    "nha",
    "health locker",
]

_AADHAAR_CONTEXT: Final[list[str]] = ["aadhaar", "aadhar", "uidai", "uid", "adhaar"]

_MRN_LABEL: Final[str] = (
    r"(?:UHIDs?|MRNs?|M\.R\.N|Medical\s+Record(?:\s+(?:No|Number))?|"
    r"Hospital\s+No|Patient\s+ID|Patient\s+No|Reg(?:istration)?\s+No)"
)

_ID_VALUE: Final[str] = r"(?=[A-Za-z0-9/-]*\d{2})[A-Za-z0-9][A-Za-z0-9/-]{3,20}"

_ID_CONTINUATION: Final[str] = rf"\s*(?:,|and|through|to)\s*({_ID_VALUE})"

_POLICY_VALUE: Final[str] = r"(?=[A-Z0-9/-]*\d)[A-Z0-9][A-Z0-9/-]{5,30}"

_NAME_VALUE: Final[str] = r"(?:[A-Z]\.?\s+)?[A-Z][a-z]{1,}(?:\s+[A-Z][a-z]{1,}){0,3}"

_NAME_VALUE_MULTI: Final[str] = r"(?:[A-Z]\.?\s+)?[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){1,3}"


def _rule(**kwargs: object) -> Rule:
    return Rule.model_validate(kwargs)


BUILTIN_RULES: Final[list[Rule]] = [
    _rule(
        entity_type="IN_AADHAAR",
        name="aadhaar-12-digit",
        pattern=r"\b[2-9]\d{3}[\s-]?\d{4}[\s-]?\d{4}\b",
        base_confidence=0.8,
        validator="aadhaar",
        context_terms=_AADHAAR_CONTEXT,
        negative_terms=["invoice", "transaction", "reference", "budget", "placeholder", "staging"],
        priority=50,
    ),
    _rule(
        entity_type="ABHA_NUMBER",
        name="abha-formatted",
        pattern=r"\b[1-9]\d-\d{4}-\d{4}-\d{4}\b",
        base_confidence=0.85,
        validator="abha_number",
        context_terms=_ABHA_CONTEXT,
        priority=60,
    ),
    _rule(
        entity_type="ABHA_NUMBER",
        name="abha-raw-14-digit",
        pattern=r"\b[1-9]\d{13}\b",
        base_confidence=0.45,
        validator="abha_number",
        context_terms=_ABHA_CONTEXT,
        negative_terms=_COMMERCIAL_NEGATIVE,
        requires_context=True,
        context_boost=0.3,
        priority=60,
    ),
    _rule(
        entity_type="ABHA_ADDRESS",
        name="abha-address",
        pattern=r"\b[a-zA-Z0-9](?:[a-zA-Z0-9._-]{1,30})@(?:abdm|sbx|pmjay)\b",
        base_confidence=0.9,
        priority=70,
    ),
    _rule(
        entity_type="IN_PAN",
        name="pan",
        pattern=r"\b[A-Z]{5}[0-9]{4}[A-Z]\b",
        base_confidence=0.85,
        validator="pan",
        case_sensitive=True,
        context_terms=["pan", "income tax", "form 16", "tax"],
        priority=50,
    ),
    _rule(
        entity_type="IN_GSTIN",
        name="gstin",
        pattern=r"\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b",
        base_confidence=0.9,
        validator="gstin",
        case_sensitive=True,
        priority=80,
    ),
    _rule(
        entity_type="MRN",
        name="mrn-labelled",
        pattern=rf"{_MRN_LABEL}\.?\s*[:#-]?\s*({_ID_VALUE})",
        base_confidence=0.85,
        value_group=1,
        continuation=_ID_CONTINUATION,
        priority=55,
    ),
    _rule(
        entity_type="MRN",
        name="mrn-prefixed-unlabelled",
        pattern=r"\b[A-Z]{2,4}-\d{4}-\d{3,6}\b",
        base_confidence=0.4,
        case_sensitive=True,
        context_terms=_CLINICAL_CONTEXT,
        negative_terms=_COMMERCIAL_NEGATIVE,
        requires_context=True,
        context_boost=0.3,
        priority=45,
    ),
    _rule(
        entity_type="PATIENT_VISIT_ID",
        name="visit-id-labelled",
        pattern=(
            r"(?:IP|OP|IPD|OPD|Admission|Visit|Encounter)\s*"
            rf"(?:No|Number|ID)\.?\s*[:#-]?\s*({_ID_VALUE})"
        ),
        base_confidence=0.8,
        value_group=1,
        continuation=_ID_CONTINUATION,
        priority=58,
    ),
    _rule(
        entity_type="LAB_ACCESSION",
        name="lab-accession-labelled",
        pattern=(
            r"(?:accession|specimen\s*(?:no|id)?|sample\s*(?:no|id|accession))"
            rf"\.?\s*[:#-]?\s*({_ID_VALUE})"
        ),
        base_confidence=0.8,
        value_group=1,
        priority=62,
    ),
    _rule(
        entity_type="ICD10",
        name="icd10-specific",
        pattern=r"\b[A-Z]\d{2}\.[0-9A-Z]{1,4}\b",
        base_confidence=0.75,
        validator="icd10",
        case_sensitive=True,
        context_terms=_CLINICAL_CONTEXT,
        negative_terms=_COMMERCIAL_NEGATIVE,
        context_window=150,
        context_boost=0.2,
        priority=30,
    ),
    _rule(
        entity_type="ICD10",
        name="icd10-category",
        pattern=r"\b[A-Z]\d{2}\b",
        base_confidence=0.5,
        validator="icd10",
        case_sensitive=True,
        context_terms=_CLINICAL_CONTEXT,
        negative_terms=_COMMERCIAL_NEGATIVE,
        requires_context=True,
        context_window=150,
        context_boost=0.35,
        priority=29,
    ),
    _rule(
        entity_type="MEDICAL_LICENSE",
        name="practitioner-registration",
        pattern=(
            r"(?:(?:medical|nursing|dental)\s+council\s*)?"
            r"reg(?:istration)?\.?\s*(?:no|number)\.?\s*[:#-]?\s*"
            r"([A-Z]{0,3}[-/]?\d{4,8})"
        ),
        base_confidence=0.6,
        value_group=1,
        context_terms=[
            "council",
            "dr",
            "doctor",
            "consultant",
            "practitioner",
            "reported by",
            "signed by",
            "nursing",
            "medical council",
            "verifying",
            "hire",
        ],
        requires_context=True,
        context_boost=0.3,
        priority=57,
    ),
    _rule(
        entity_type="INSURANCE_POLICY",
        name="policy-slash-format",
        pattern=r"\b[A-Z]{1,6}(?:/[A-Z0-9]{2,10}){2,5}\b",
        base_confidence=0.75,
        case_sensitive=True,
        context_terms=["policy", "insurance", "insurer", "tpa", "claim", "pre-auth", "preauth"],
        context_boost=0.2,
        priority=54,
    ),
    _rule(
        entity_type="INSURANCE_POLICY",
        name="policy-labelled",
        pattern=rf"(?i:policy)\s*(?i:no|number)?\.?\s*[:#-]?\s*({_POLICY_VALUE})",
        base_confidence=0.85,
        value_group=1,
        case_sensitive=True,
        priority=56,
    ),
    _rule(
        entity_type="INSURANCE_POLICY",
        name="claim-labelled",
        pattern=rf"(?i:claim)\s*(?i:no|number|id|ref)?\.?\s*[:#-]?\s*({_POLICY_VALUE})",
        base_confidence=0.8,
        value_group=1,
        case_sensitive=True,
        priority=56,
    ),
    _rule(
        entity_type="IN_PHONE",
        name="indian-mobile",
        pattern=r"(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b",
        base_confidence=0.65,
        validator="in_phone",
        context_terms=["mobile", "phone", "contact", "call", "reachable", "reach", "number"],
        negative_terms=["budget", "invoice", "amount", "rupees", "estimate", "capital", "revised"],
        priority=40,
    ),
    _rule(
        entity_type="EMAIL_ADDRESS",
        name="email",
        pattern=r"\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b",
        base_confidence=0.7,
        priority=40,
    ),
    _rule(
        entity_type="IN_UPI",
        name="upi-handle",
        pattern=(
            r"\b[a-zA-Z0-9._-]{3,}@"
            r"(?:ybl|okhdfcbank|oksbi|okaxis|okicici|paytm|upi|ibl|axl|apl|airtel)\b"
        ),
        base_confidence=0.85,
        priority=65,
    ),
    _rule(
        entity_type="DATE_OF_BIRTH",
        name="dob-labelled",
        pattern=(
            r"(?:D\.?O\.?B\.?|date\s+of\s+birth|born\s+on|birth\s*date)"
            r"[^\n]{0,25}?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})"
        ),
        base_confidence=0.85,
        value_group=1,
        priority=50,
    ),
    _rule(
        entity_type="IN_IFSC",
        name="ifsc",
        pattern=r"\b[A-Z]{4}0[A-Z0-9]{6}\b",
        base_confidence=0.85,
        validator="ifsc",
        case_sensitive=True,
        priority=50,
    ),
    _rule(
        entity_type="BANK_ACCOUNT",
        name="bank-account",
        pattern=r"\b\d{9,18}\b",
        base_confidence=0.45,
        validator="bank_account",
        context_terms=["account", "a/c", "beneficiary", "account holder", "credit the"],
        negative_terms=["invoice", "vendor", "purchase order", "transaction reference"],
        requires_context=True,
        context_boost=0.35,
        context_window=60,
        priority=35,
    ),
    _rule(
        entity_type="IN_PASSPORT",
        name="passport",
        pattern=r"\b[A-PR-WY][0-9]{7}\b",
        base_confidence=0.5,
        validator="passport",
        case_sensitive=True,
        context_terms=["passport", "visa", "travel", "immigration"],
        requires_context=True,
        context_boost=0.35,
        priority=50,
    ),
    _rule(
        entity_type="IN_DRIVING_LICENSE",
        name="driving-licence",
        pattern=r"\b[A-Z]{2}[\s-]?\d{2}[\s-]?\d{11}\b",
        base_confidence=0.8,
        validator="driving_license",
        case_sensitive=True,
        priority=50,
    ),
    _rule(
        entity_type="PERSON",
        name="person-titled",
        pattern=(
            r"\b(?i:Mr|Mrs|Ms|Miss|Dr|Doctor|Master|Baby|Smt|Shri|Sri|Prof)\.?\s+"
            rf"({_NAME_VALUE})"
        ),
        base_confidence=0.8,
        value_group=1,
        case_sensitive=True,
        priority=50,
    ),
    _rule(
        entity_type="PERSON",
        name="person-labelled",
        pattern=(
            r"\b(?i:patients?|beneficiary|account\s+holder|referring)\s*"
            rf"(?i:name)?\s*[:\-]?\s*({_NAME_VALUE})"
        ),
        base_confidence=0.78,
        value_group=1,
        case_sensitive=True,
        priority=48,
    ),
    _rule(
        entity_type="PERSON",
        name="person-after-preposition",
        pattern=rf"\b(?i:for|of)\s+({_NAME_VALUE_MULTI})",
        base_confidence=0.6,
        value_group=1,
        case_sensitive=True,
        priority=44,
    ),
    _rule(
        entity_type="IN_VOTER_ID",
        name="voter-epic",
        pattern=r"\b[A-Z]{3}[0-9]{7}\b",
        base_confidence=0.5,
        validator="voter_id",
        case_sensitive=True,
        context_terms=["voter", "epic", "election", "id proof"],
        requires_context=True,
        context_boost=0.35,
        priority=50,
    ),
]

BUILTIN_RULE_PACK: Final[RulePack] = RulePack(
    version=RULE_PACK_VERSION,
    rules=BUILTIN_RULES,
)
