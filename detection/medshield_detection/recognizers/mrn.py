"""MRN / UHID recognizer with per-tenant patterns.

Default pattern: ``[A-Z]{2,4}-\\d{4}-\\d{4,6}`` (e.g. ``HSP-2026-0012``).
Additional patterns come from ``DetectionConfig.recognizers.custom_mrn_patterns``.
"""

from __future__ import annotations

from collections.abc import Sequence

from presidio_analyzer import Pattern, PatternRecognizer


class MrnRecognizer(PatternRecognizer):
    """Presidio recognizer for hospital MRN/UHID identifiers."""

    def __init__(self, custom_patterns: Sequence[str] | None = None) -> None:
        patterns = [
            Pattern("MRN default", r"\b[A-Z]{2,4}-\d{4}-\d{4,6}\b", 0.7),
        ]
        patterns.extend(
            Pattern(f"MRN custom {index}", pattern, 0.7)
            for index, pattern in enumerate(custom_patterns or [], start=1)
            if 0 < len(pattern) <= 200
        )
        super().__init__(
            supported_entity="MRN",
            name="MrnRecognizer",
            patterns=patterns,
            context=["MRN", "UHID", "patient ID", "registration"],
        )
