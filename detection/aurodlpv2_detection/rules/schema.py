from __future__ import annotations

from pydantic import BaseModel, Field


def _empty_strings() -> list[str]:
    return []


class Rule(BaseModel):
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
    priority: int = 0
    value_group: int = 0
    case_sensitive: bool = False
    continuation: str | None = None


class RulePack(BaseModel):
    version: str
    rules: list[Rule]

    def for_types(self, enabled: frozenset[str] | None) -> list[Rule]:
        if enabled is None:
            return list(self.rules)
        return [rule for rule in self.rules if rule.entity_type in enabled]
