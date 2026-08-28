"""Policy rule shapes.

Policy used to be a hardcoded if-ladder in the scan endpoint, which meant every
hospital got identical enforcement and nothing was configurable without a
deploy. Rules are data now: an administrator can express "PHI to a personal
Gmail is quarantined, but our transcription partner is fine" without a release.
"""

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

#: How the sender's own address relates to the organisation. The product exists
#: because staff send patient data from personal accounts, so this is a
#: first-class input, not an afterthought.
SenderClass = Literal["internal", "approved_partner", "external", "public_email", "unknown"]

#: Ordered weakest to strongest. Used for "at least this severe" comparisons and
#: to decide which of two matching rules wins.
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
    """All present conditions must hold for the rule to match."""

    #: Any of these entity types present. Empty means "do not care".
    entity_types_any: list[str] = Field(default_factory=_empty_strings)
    #: All of these entity types present.
    entity_types_all: list[str] = Field(default_factory=_empty_strings)
    #: Minimum number of distinct entities.
    min_entity_count: int | None = Field(default=None, ge=0)
    #: Minimum number of distinct patients implied (distinct record numbers).
    min_subject_count: int | None = Field(default=None, ge=0)
    min_risk_score: float | None = Field(default=None, ge=0, le=100)
    max_risk_score: float | None = Field(default=None, ge=0, le=100)
    min_severity: Severity | None = None
    #: Rule matches when ANY recipient falls in one of these classes.
    recipient_class_any: list[RecipientClass] = Field(
        default_factory=_empty_recipient_classes
    )
    #: Rule matches only when EVERY recipient falls in one of these classes.
    recipient_class_all: list[RecipientClass] = Field(
        default_factory=_empty_recipient_classes
    )
    sender_class_any: list[SenderClass] = Field(default_factory=_empty_sender_classes)
    has_attachments: bool | None = None


class PolicyRule(BaseModel):
    id: str = Field(min_length=1, max_length=80)
    description: str = Field(default="", max_length=500)
    enabled: bool = True
    #: Lower numbers evaluate first. The first matching rule wins, so ordering
    #: is the whole semantics; ties break on the stronger action.
    order: int = 100
    conditions: RuleConditions = Field(default_factory=RuleConditions)
    action: Action
    #: Raise the reported severity to at least this, so a policy decision is
    #: never reported as milder than the rule that produced it.
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
