"""Policy evaluation.

Takes what detection found plus how the sender and recipients are classified,
and returns the action. Every decision names the rule that produced it, so the
audit log and the user-facing message can both point at something specific
rather than at "the policy".
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Literal

from aurodlpv2_backend.policy.defaults import BUILTIN_POLICY_SET
from aurodlpv2_backend.policy.models import (
    ACTION_RANK,
    SEVERITY_RANK,
    Action,
    PolicyRule,
    PolicySet,
    RecipientClass,
    SenderClass,
    Severity,
)

#: Identifiers that stand for a distinct patient. Counting these is how "one
#: record" is told apart from "a database export", which the old risk-only
#: ladder could not do.
SUBJECT_IDENTIFIERS = frozenset(
    {"MRN", "PATIENT_VISIT_ID", "ABHA_NUMBER", "ABHA_ADDRESS", "IN_AADHAAR", "LAB_ACCESSION"}
)

APPROVED_RECIPIENT_CLASSES = frozenset({"internal", "approved_partner"})


def _empty_strings() -> list[str]:
    return []


@dataclass(frozen=True, slots=True)
class ScanFacts:
    """Everything policy is allowed to look at."""

    entity_types: frozenset[str]
    #: Distinct (type, masked value) pairs — repetition of one value is not
    #: additional exposure.
    distinct_entity_count: int
    distinct_subject_count: int
    risk_score: float
    severity: Severity
    recipient_classes: tuple[RecipientClass, ...]
    sender_class: SenderClass
    has_attachments: bool


@dataclass(frozen=True, slots=True)
class PolicyDecision:
    action: Action
    severity: Severity
    risk_score: float
    matched_policy_ids: list[str] = field(default_factory=_empty_strings)
    user_message: str = ""


def build_facts(
    *,
    entities: list[tuple[str, str]],
    risk_score: float,
    severity: Severity,
    recipient_classes: list[RecipientClass],
    sender_class: SenderClass,
    has_attachments: bool,
) -> ScanFacts:
    """``entities`` is a list of (type, masked_value)."""
    distinct = {(entity_type, value) for entity_type, value in entities}
    subjects = {
        (entity_type, value)
        for entity_type, value in distinct
        if entity_type in SUBJECT_IDENTIFIERS
    }
    return ScanFacts(
        entity_types=frozenset(entity_type for entity_type, _ in distinct),
        distinct_entity_count=len(distinct),
        distinct_subject_count=len(subjects),
        risk_score=risk_score,
        severity=severity,
        recipient_classes=tuple(recipient_classes),
        sender_class=sender_class,
        has_attachments=has_attachments,
    )


def _matches(rule: PolicyRule, facts: ScanFacts) -> bool:  # noqa: PLR0911
    # One early return per condition. This reads as the rule definition
    # itself; collapsing it into a comprehension would hide which condition
    # rejected a message, which is the first thing anyone debugging asks.
    conditions = rule.conditions

    if conditions.entity_types_any and not (
        facts.entity_types & set(conditions.entity_types_any)
    ):
        return False
    if conditions.entity_types_all and not (
        set(conditions.entity_types_all) <= facts.entity_types
    ):
        return False
    if (
        conditions.min_entity_count is not None
        and facts.distinct_entity_count < conditions.min_entity_count
    ):
        return False
    if (
        conditions.min_subject_count is not None
        and facts.distinct_subject_count < conditions.min_subject_count
    ):
        return False
    if conditions.min_risk_score is not None and facts.risk_score < conditions.min_risk_score:
        return False
    if conditions.max_risk_score is not None and facts.risk_score > conditions.max_risk_score:
        return False
    if conditions.min_severity is not None and (
        SEVERITY_RANK[facts.severity] < SEVERITY_RANK[conditions.min_severity]
    ):
        return False
    if conditions.recipient_class_any and not (
        set(facts.recipient_classes) & set(conditions.recipient_class_any)
    ):
        return False
    if conditions.recipient_class_all:
        # An empty recipient list must not satisfy an "all recipients are
        # approved" rule by vacuous truth.
        if not facts.recipient_classes:
            return False
        if not set(facts.recipient_classes) <= set(conditions.recipient_class_all):
            return False
    if conditions.sender_class_any and facts.sender_class not in set(conditions.sender_class_any):
        return False
    return not (
        conditions.has_attachments is not None
        and facts.has_attachments != conditions.has_attachments
    )


def _raise_severity(current: Severity, floor: Severity | None) -> Severity:
    if floor is None:
        return current
    return current if SEVERITY_RANK[current] >= SEVERITY_RANK[floor] else floor


def evaluate(facts: ScanFacts, policy_set: PolicySet | None = None) -> PolicyDecision:
    """First matching rule wins."""
    resolved = policy_set or BUILTIN_POLICY_SET
    for rule in resolved.ordered():
        if not _matches(rule, facts):
            continue
        return PolicyDecision(
            action=rule.action,
            severity=_raise_severity(facts.severity, rule.min_reported_severity),
            risk_score=facts.risk_score,
            matched_policy_ids=[rule.id],
            user_message=rule.user_message,
        )

    # No rule matched. Allowing is the only safe default here because the
    # builtin set ends in a catch-all: reaching this means an operator replaced
    # the set and left a gap, so say so rather than silently permitting.
    return PolicyDecision(
        action="warn" if facts.distinct_entity_count else "allow",
        severity=facts.severity,
        risk_score=facts.risk_score,
        matched_policy_ids=["no-matching-rule"],
        user_message=(
            "No policy rule matched this message. Review before sending."
            if facts.distinct_entity_count
            else ""
        ),
    )


ActionName = Literal["allow", "warn", "block", "quarantine", "escalate"]


def strongest(actions: list[ActionName]) -> ActionName:
    """Most restrictive action wins when several apply."""
    return max(actions, key=lambda action: ACTION_RANK[action]) if actions else "allow"
