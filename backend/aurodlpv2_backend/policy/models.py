from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

Action = Literal["allow", "warn", "block", "quarantine", "escalate"]
Severity = Literal["none", "low", "medium", "high", "critical"]

RecipientClass = Literal[
    "internal",
    "approved_partner",
    "blocked",
    "external",
    "public_email",
    "unknown",
]

SenderClass = Literal["internal", "approved_partner", "external", "public_email", "unknown"]

ACTION_RANK: dict[str, int] = {
    "allow": 0,
    "warn": 1,
    "quarantine": 2,
    "escalate": 3,
    "block": 4,
}

SEVERITY_RANK: dict[str, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


def _empty_strings() -> list[str]:
    return []


def _empty_recipient_classes() -> list[RecipientClass]:
    return []


def _empty_sender_classes() -> list[SenderClass]:
    return []


class RuleConditions(BaseModel):
    entity_types_any: list[str] = Field(default_factory=_empty_strings)
    entity_types_all: list[str] = Field(default_factory=_empty_strings)
    min_entity_count: int | None = Field(default=None, ge=0)
    min_subject_count: int | None = Field(default=None, ge=0)
    min_risk_score: float | None = Field(default=None, ge=0, le=100)
    max_risk_score: float | None = Field(default=None, ge=0, le=100)
    min_severity: Severity | None = None
    recipient_class_any: list[RecipientClass] = Field(default_factory=_empty_recipient_classes)
    recipient_class_all: list[RecipientClass] = Field(default_factory=_empty_recipient_classes)
    sender_class_any: list[SenderClass] = Field(default_factory=_empty_sender_classes)
    has_attachments: bool | None = None


class PolicyRule(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    enabled: bool = True
    order: int = 100
    conditions: RuleConditions = Field(default_factory=RuleConditions)
    action: Action
    min_reported_severity: Severity | None = None
    user_message: str = Field(default="", max_length=500)


class PolicySet(BaseModel):
    version: str = "builtin"
    rules: list[PolicyRule]

    def ordered(self) -> list[PolicyRule]:
        return sorted(
            (rule for rule in self.rules if rule.enabled),
            key=lambda rule: (rule.order, rule.id),
        )
