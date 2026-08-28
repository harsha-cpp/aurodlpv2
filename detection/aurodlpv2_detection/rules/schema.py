"""Declarative detection rules.

One rule pack drives the Python engine and, serialized, the extension's offline
fallback. Two hand-maintained detectors that disagree is how the same message
came to produce different verdicts depending on whether the backend answered.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


def _empty_strings() -> list[str]:
    return []


class Rule(BaseModel):
    """One detection rule.

    Confidence starts at ``base_confidence`` and is adjusted by context: terms
    from ``context_terms`` inside ``context_window`` characters raise it,
    ``negative_terms`` lower it. ``requires_context`` makes the rule inert
    without a positive term, which is what keeps a bare fourteen-digit invoice
    number from reading as a health ID.
    """

    entity_type: str
    name: str
    pattern: str
    base_confidence: float = Field(ge=0.0, le=1.0)
    validator: str | None = None
    context_terms: list[str] = Field(default_factory=_empty_strings)
    negative_terms: list[str] = Field(default_factory=_empty_strings)
    requires_context: bool = False
    context_window: int = 72
    context_boost: float = 0.2
    negative_penalty: float = 0.45
    #: Higher wins when two matches overlap. Composite identifiers outrank the
    #: fragments they contain.
    priority: int = 0
    #: Regex group holding the value, when the pattern needs a label prefix to
    #: match but should not report it.
    value_group: int = 0
    case_sensitive: bool = False
    #: Applied repeatedly at the end of a match to pick up comma-separated
    #: continuations: "UHID 0038001, 0038007 and 0038014" is three patients, and
    #: a bulk list is exactly the case the risk model must not under-read.
    #: Group 1 holds the value.
    continuation: str | None = None


class RulePack(BaseModel):
    version: str
    rules: list[Rule]

    def for_types(self, enabled: frozenset[str] | None) -> list[Rule]:
        if enabled is None:
            return list(self.rules)
        return [rule for rule in self.rules if rule.entity_type in enabled]
