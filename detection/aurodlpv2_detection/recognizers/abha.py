"""ABHA (Ayushman Bharat Health Account) recognizer.

Format: ``XX-XXXX-XXXX-XXXX`` (14 digits, first digit 1-9). No public checksum.

See ``docs/plans/detection-engine.md`` §6. Implements as a Presidio
``PatternRecognizer`` subclass with contextual confidence boost.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

if TYPE_CHECKING:
    from presidio_analyzer.nlp_engine import NlpArtifacts

_ABHA_CONTEXT = re.compile(r"\b(?:abha|health\s+id|ayushman|nha)\b", re.IGNORECASE)


class AbhaRecognizer(PatternRecognizer):
    """Presidio recognizer for Ayushman Bharat Health Account identifiers."""

    def __init__(self) -> None:
        super().__init__(
            supported_entity="ABHA",
            name="AbhaRecognizer",
            patterns=[
                Pattern("ABHA formatted", r"\b[1-9]\d-\d{4}-\d{4}-\d{4}\b", 0.85),
                Pattern("ABHA raw", r"\b[1-9]\d{13}\b", 0.5),
            ],
            context=["ABHA", "health ID", "Ayushman", "NHA"],
        )

    def analyze(
        self,
        text: str,
        entities: list[str],
        nlp_artifacts: NlpArtifacts | None = None,
        regex_flags: int | None = None,
    ) -> list[RecognizerResult]:
        results = super().analyze(text, entities, nlp_artifacts, regex_flags)
        filtered: list[RecognizerResult] = []
        for result in results:
            if result.score > 0.5 or _ABHA_CONTEXT.search(
                text[max(0, result.start - 40) : min(len(text), result.end + 20)]
            ):
                filtered.append(result)
        return filtered
