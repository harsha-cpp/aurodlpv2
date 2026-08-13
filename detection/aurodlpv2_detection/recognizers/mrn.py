"""MRN / UHID recognizer with per-tenant patterns.

Default pattern: ``[A-Z]{2,4}-\\d{4}-\\d{4,6}`` (e.g. ``HSP-2026-0012``).
Additional patterns come from ``DetectionConfig.recognizers.custom_mrn_patterns``.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import TYPE_CHECKING

from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult

if TYPE_CHECKING:
    from presidio_analyzer.nlp_engine import NlpArtifacts

_MRN_CONTEXT = re.compile(
    r"\b(?:mrn|uhid|patient\s+id|registration(?:\s+(?:id|number|code))?)\b",
    re.IGNORECASE,
)


class MrnRecognizer(PatternRecognizer):
    """Presidio recognizer for hospital MRN/UHID identifiers."""

    def __init__(self, custom_patterns: Sequence[str] | None = None) -> None:
        patterns = [
            Pattern("MRN default", r"\b[A-Z]{2,4}-\d{4}-\d{4,6}\b", 0.7),
        ]
        patterns.extend(
            Pattern(f"MRN custom {index}", pattern, 0.85)
            for index, pattern in enumerate(custom_patterns or [], start=1)
            if 0 < len(pattern) <= 200
        )
        super().__init__(
            supported_entity="MRN",
            name="MrnRecognizer",
            patterns=patterns,
            context=["MRN", "UHID", "patient ID", "registration"],
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
            nearby = text[max(0, result.start - 48) : min(len(text), result.end + 24)]
            if result.score >= 0.8 or _MRN_CONTEXT.search(nearby):
                filtered.append(result)
        return filtered
