"""ICD-10-CM recognizer.

Regex candidates filtered by ``simple_icd_10_cm.is_valid_item`` to keep
precision high. See ``docs/plans/detection-engine.md`` §6.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

import simple_icd_10_cm as icd
from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

if TYPE_CHECKING:
    from presidio_analyzer.nlp_engine import NlpArtifacts


class Icd10Recognizer(PatternRecognizer):
    """Presidio recognizer for ICD-10-CM codes with dictionary validation."""

    def __init__(self) -> None:
        super().__init__(
            supported_entity="ICD10",
            name="Icd10Recognizer",
            patterns=[Pattern("ICD10 candidate", r"\b[A-TV-Z]\d{2}(?:\.\d{1,4})?\b", 0.4)],
            context=["diagnosis", "ICD", "condition"],
        )

    def analyze(
        self,
        text: str,
        entities: list[str],
        nlp_artifacts: NlpArtifacts | None = None,
        regex_flags: int | None = None,
    ) -> list[RecognizerResult]:
        results = super().analyze(text, entities, nlp_artifacts, regex_flags)
        for result in results:
            code = text[result.start : result.end].upper()
            result.score = 0.9 if icd.is_valid_item(code) else 0.4
        return results
