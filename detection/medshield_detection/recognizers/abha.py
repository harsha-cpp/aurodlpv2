"""ABHA (Ayushman Bharat Health Account) recognizer.

Format: ``XX-XXXX-XXXX-XXXX`` (14 digits, first digit 1-9). No public checksum.

See ``docs/plans/detection-engine.md`` §6. Implements as a Presidio
``PatternRecognizer`` subclass with contextual confidence boost.
"""

from __future__ import annotations

from presidio_analyzer import Pattern, PatternRecognizer


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
