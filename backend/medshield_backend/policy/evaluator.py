"""Policy evaluation."""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from medshield_backend.policy.models import (
    AttachmentClause,
    Clause,
    EntityClause,
    Policy,
    RecipientClause,
)
from medshield_backend.scan.schemas import Action, Severity

ACTION_RANK: dict[Action, int] = {
    "allow": 0,
    "warn": 1,
    "block": 2,
    "quarantine": 3,
    "escalate": 4,
}
SEVERITY_RANK: dict[Severity, int] = {
    "none": 0,
    "low": 1,
    "medium": 2,
    "high": 3,
    "critical": 4,
}


@dataclass(frozen=True, slots=True)
class PolicyEvaluation:
    action: Action
    severity: Severity
    matched_policy_ids: list[str]
    user_message: str


@dataclass(frozen=True, slots=True)
class PolicyContext:
    entity_counts: Mapping[str, int]
    recipient_classes: Sequence[str]
    recipient_domains: Sequence[str]
    attachment_mime_types: Sequence[str]
    attachment_text: str
    severity: Severity
    score: float


def evaluate(policies: list[Policy], context: PolicyContext) -> PolicyEvaluation:
    matched_rules: list[tuple[Policy, Action, Severity, str | None]] = []
    for policy in policies:
        if not policy.enabled:
            continue
        for rule in policy.rules:
            if _condition_matches(rule.when.op, rule.when.clauses, context):
                matched_rules.append((policy, rule.action, rule.severity, rule.user_message))

    if not matched_rules:
        return PolicyEvaluation(
            action="allow",
            severity=context.severity,
            matched_policy_ids=[],
            user_message="No policy matched.",
        )

    winner = max(matched_rules, key=lambda item: ACTION_RANK[item[1]])
    return PolicyEvaluation(
        action=winner[1],
        severity=max((item[2] for item in matched_rules), key=lambda value: SEVERITY_RANK[value]),
        matched_policy_ids=[policy.id for policy, _action, _severity, _message in matched_rules],
        user_message=winner[3] or "Policy matched.",
    )


def _condition_matches(op: str, clauses: list[Clause], context: PolicyContext) -> bool:
    results = [_clause_matches(clause, context) for clause in clauses]
    if op == "any_of":
        return any(results)
    if op == "all_of":
        return all(results)
    if op == "none_of":
        return not any(results)
    return False


def _clause_matches(clause: Clause, context: PolicyContext) -> bool:
    if isinstance(clause, EntityClause):
        return _entity_clause_matches(clause, context)
    if isinstance(clause, RecipientClause):
        return _recipient_clause_matches(clause, context)
    return _attachment_clause_matches(clause, context)


def _entity_clause_matches(clause: EntityClause, context: PolicyContext) -> bool:
    if clause.op == "contains" and isinstance(clause.value, str):
        return context.entity_counts.get(clause.value, 0) > 0
    if clause.op == "count_gte" and isinstance(clause.value, int):
        return sum(context.entity_counts.values()) >= clause.value
    if clause.op == "count_lt" and isinstance(clause.value, int):
        return sum(context.entity_counts.values()) < clause.value
    if clause.op == "severity_gte" and isinstance(clause.value, str):
        if clause.value not in SEVERITY_RANK:
            return False
        return SEVERITY_RANK[context.severity] >= SEVERITY_RANK[clause.value]
    return False


def _recipient_clause_matches(clause: RecipientClause, context: PolicyContext) -> bool:
    if clause.op == "classification_in":
        return any(classification in clause.value for classification in context.recipient_classes)
    if clause.op == "domain_not_in":
        allowed_domains = {domain.lower() for domain in clause.value}
        return any(domain.lower() not in allowed_domains for domain in context.recipient_domains)
    return False


def _attachment_clause_matches(clause: AttachmentClause, context: PolicyContext) -> bool:
    if clause.op == "mime_in" and isinstance(clause.value, list):
        return any(mime_type in clause.value for mime_type in context.attachment_mime_types)
    if clause.op == "ocr_text_contains" and isinstance(clause.value, str):
        return clause.value.lower() in context.attachment_text.lower()
    return False
