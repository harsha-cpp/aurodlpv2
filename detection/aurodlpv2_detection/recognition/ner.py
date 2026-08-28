"""spaCy NER, used as a supplement to the rule pack.

The small English model is trained on news text and routinely tags Indian
personal names as ``ORG`` — ``Mrs Lakshmi Devi`` comes back as an organisation.
So NER runs at low confidence behind the title- and label-anchored rules, and
an ``ORG`` span is only promoted to a name when a personal title sits directly
in front of it.

The model is a declared dependency. If it is genuinely missing we raise rather
than fall back to a blank tokenizer, because a silent fallback is how name
detection came to be switched off in production without anyone noticing.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol, cast

import spacy
import structlog
from spacy.language import Language

logger = structlog.get_logger(__name__)

NER_CONFIDENCE = 0.55
NER_PRIORITY = 20

_TITLE_BEFORE = re.compile(
    r"(?:mr|mrs|ms|miss|dr|doctor|master|baby|smt|shri|sri|prof)\.?\s+$",
    re.IGNORECASE,
)


class _SpacyLoader(Protocol):
    def __call__(self, name: str) -> Language: ...


class NlpModelUnavailableError(RuntimeError):
    """The configured spaCy model is not installed."""


@dataclass(frozen=True, slots=True)
class NerSpan:
    text: str
    label: str
    start: int
    end: int


@lru_cache(maxsize=4)
def load_model(model_name: str) -> Language:
    loader = cast(_SpacyLoader, spacy.load)
    try:
        return loader(model_name)
    except OSError as exc:
        raise NlpModelUnavailableError(
            f"spaCy model {model_name!r} is not installed. It is a declared "
            "dependency; run `uv sync` in the detection package."
        ) from exc


#: Domain vocabulary the model repeatedly mistakes for names.
_NOT_NAMES: frozenset[str] = frozenset(
    {
        "aadhaar", "aadhar", "abha", "abdm", "ayushman", "uhid", "mrn", "gstin",
        "tpa", "nabh", "icd", "opd", "ipd", "uidai", "pan", "ifsc", "upi",
        "hba1c", "ecg", "ct", "mri", "bls", "cme", "his", "it", "hr", "gst",
        "patient", "hospital", "ward", "doctor", "nurse", "consultant",
        "diagnosis", "discharge", "admission", "policy", "claim", "insurance",
        "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
        "sunday", "january", "february", "march", "april", "may", "june",
        "july", "august", "september", "october", "november", "december",
    }
)

_STOPWORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "with",
        "at", "by", "from", "is", "are", "was", "were", "be", "been", "has",
        "have", "had", "his", "her", "their", "our", "this", "that", "does",
        "not", "no", "all", "any", "as", "it", "its",
    }
)


def looks_like_name(text: str) -> bool:
    """Reject the phrases NER hands back that are plainly not names.

    The small model returns things like 'the patient', 'in bed' and 'Ayushman'.
    A name is one to four capitalised alphabetic tokens, no stopwords, and not
    an acronym or a piece of domain vocabulary.
    """
    tokens = text.split()
    if not 1 <= len(tokens) <= 4:
        return False
    for raw in tokens:
        token = raw.strip(".,;:()")
        if not token or not token.replace(".", "").isalpha():
            return False
        if not token[0].isupper():
            return False
        if token.isupper() and len(token) > 1:
            return False
        if token.lower() in _STOPWORDS or token.lower() in _NOT_NAMES:
            return False
    return True


def person_spans(text: str, model_name: str) -> list[NerSpan]:
    """Personal-name candidates from NER."""
    if not text.strip():
        return []
    document = load_model(model_name)(text)
    spans: list[NerSpan] = []
    for entity in document.ents:
        titled = _TITLE_BEFORE.search(text[: entity.start_char]) is not None
        # ORG is only a name when a personal title sits in front of it.
        if entity.label_ != "PERSON" and not (entity.label_ == "ORG" and titled):
            continue
        if not looks_like_name(entity.text):
            continue
        # A lone capitalised word is usually just a sentence opener the model
        # over-read ("Refresher training on..."). Require a surname, or a title.
        if len(entity.text.split()) < 2 and not titled:
            continue
        spans.append(NerSpan(entity.text, "PERSON", entity.start_char, entity.end_char))
    return spans
