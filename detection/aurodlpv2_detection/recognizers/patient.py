"""Context-bound patient demographic recognizers."""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

from presidio_analyzer import EntityRecognizer, RecognizerResult

if TYPE_CHECKING:
    from presidio_analyzer.nlp_engine import NlpArtifacts


@dataclass(frozen=True, slots=True)
class ContextPattern:
    expression: str
    score: float


class ContextValueRecognizer(EntityRecognizer):
    """Return only the named value group after an explicit patient label."""

    def __init__(
        self,
        entity_type: str,
        patterns: Sequence[ContextPattern],
    ) -> None:
        self._entity_type = entity_type
        self._patterns = tuple(
            (re.compile(pattern.expression, re.IGNORECASE), pattern.score) for pattern in patterns
        )
        super().__init__(
            supported_entities=[entity_type],
            name=f"{entity_type.title().replace('_', '')}Recognizer",
        )

    def load(self) -> None:
        return None

    def analyze(
        self,
        text: str,
        entities: list[str],
        nlp_artifacts: NlpArtifacts | None = None,
    ) -> list[RecognizerResult]:
        del nlp_artifacts
        if self._entity_type not in entities:
            return []
        results: list[RecognizerResult] = []
        for pattern, score in self._patterns:
            for match in pattern.finditer(text):
                start, end = match.span("value")
                results.append(
                    RecognizerResult(
                        entity_type=self._entity_type,
                        start=start,
                        end=end,
                        score=score,
                    )
                )
        return results


def patient_recognizers() -> list[ContextValueRecognizer]:
    return [
        ContextValueRecognizer(
            "PATIENT_NAME",
            [
                ContextPattern(
                    r"\b(?:patient(?:\s+name)?|beneficiary\s+name)\s*[:=-]\s*"
                    r"(?P<value>[A-Z][A-Za-z.'-]{1,49}"
                    r"(?:\s+[A-Z][A-Za-z.'-]{1,49}){1,3})\b",
                    0.78,
                )
            ],
        ),
        ContextValueRecognizer(
            "PATIENT_DOB",
            [
                ContextPattern(
                    r"\b(?:patient\s+)?(?:dob|date\s+of\s+birth)\s*[:=-]\s*"
                    r"(?P<value>(?:(?:0?[1-9]|[12]\d|3[01])[-/.]"
                    r"(?:0?[1-9]|1[0-2])[-/.](?:19|20)\d{2}|"
                    r"(?:19|20)\d{2}[-/.](?:0?[1-9]|1[0-2])[-/.]"
                    r"(?:0?[1-9]|[12]\d|3[01])))\b",
                    0.9,
                )
            ],
        ),
        ContextValueRecognizer(
            "PATIENT_EMAIL",
            [
                ContextPattern(
                    r"\b(?:patient\s+email|patient\s+e-mail)\s*[:=-]\s*"
                    r"(?P<value>[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@"
                    r"[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?"
                    r"(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+)\b",
                    0.92,
                )
            ],
        ),
        ContextValueRecognizer(
            "PATIENT_PHONE",
            [
                ContextPattern(
                    r"\b(?:patient\s+)?(?:mobile|phone|contact)\s*[:=-]\s*"
                    r"(?P<value>(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5})\b",
                    0.85,
                )
            ],
        ),
    ]
