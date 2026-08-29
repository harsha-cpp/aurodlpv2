from __future__ import annotations

from typing import Final

from aurodlpv2_backend.policy.models import PolicyRule, PolicySet, RuleConditions

BUILTIN_POLICY_VERSION: Final[str] = "builtin-2026.08"

BUILTIN_RULES: Final[list[PolicyRule]] = [
    PolicyRule(
        id="blocked-recipient-domain",
        description="A recipient is on the organisation's blocked list.",
        order=10,
        conditions=RuleConditions(recipient_class_any=["blocked"]),
        action="block",
        min_reported_severity="high",
        user_message="One or more recipients are on the blocked domain list.",
    ),
    PolicyRule(
        id="unapproved-sender-with-phi",
        description=(
            "Patient data being sent from an account that is not an approved "
            "sender for this organisation. This is the leak the product exists "
            "to stop, and the old hardcoded policy never checked it."
        ),
        order=20,
        conditions=RuleConditions(
            sender_class_any=["external", "public_email", "unknown"],
            min_entity_count=1,
        ),
        action="block",
        min_reported_severity="high",
        user_message=(
            "This message carries patient data but is being sent from an account "
            "that is not approved for your organisation."
        ),
    ),
    PolicyRule(
        id="bulk-export-external",
        description="Many distinct patients leaving to an unapproved destination.",
        order=30,
        conditions=RuleConditions(
            min_subject_count=5,
            recipient_class_any=["external", "public_email", "unknown"],
        ),
        action="block",
        min_reported_severity="critical",
        user_message=(
            "This message appears to contain records for several patients and is "
            "addressed outside the approved list. Sending is blocked."
        ),
    ),
    PolicyRule(
        id="no-sensitive-data",
        description="Nothing detected. Allow without comment.",
        order=40,
        conditions=RuleConditions(max_risk_score=0),
        action="allow",
        user_message="",
    ),
    PolicyRule(
        id="approved-recipients-phi",
        description="PHI, but every recipient is internal or an approved partner.",
        order=50,
        conditions=RuleConditions(recipient_class_all=["internal", "approved_partner"]),
        action="allow",
        user_message="Sensitive data detected, but all recipients are approved.",
    ),
    PolicyRule(
        id="high-risk-phi-to-public-email",
        description="Directly identifying data to a personal mailbox.",
        order=60,
        conditions=RuleConditions(
            recipient_class_any=["public_email"],
            min_risk_score=55,
        ),
        action="quarantine",
        min_reported_severity="high",
        user_message=(
            "Sensitive patient data addressed to a personal email account. "
            "The message is held for review."
        ),
    ),
    PolicyRule(
        id="high-risk-phi-external",
        description="High-risk data to an unapproved external recipient.",
        order=70,
        conditions=RuleConditions(
            recipient_class_any=["external", "unknown"],
            min_risk_score=70,
        ),
        action="quarantine",
        min_reported_severity="high",
        user_message=(
            "Sensitive patient data addressed outside the approved list. "
            "The message is held for review."
        ),
    ),
    PolicyRule(
        id="medium-risk-phi-external",
        description="Moderate exposure outside the approved list: warn and let the user decide.",
        order=80,
        conditions=RuleConditions(
            recipient_class_any=["external", "public_email", "unknown"],
            min_risk_score=30,
        ),
        action="warn",
        min_reported_severity="medium",
        user_message=(
            "Possible patient data addressed outside the approved list. Review before sending."
        ),
    ),
    PolicyRule(
        id="low-confidence-phi",
        description="Something was detected but weakly. Warn quietly rather than block.",
        order=999,
        conditions=RuleConditions(min_entity_count=1),
        action="warn",
        min_reported_severity="low",
        user_message="Possible sensitive data was detected. Review before sending.",
    ),
]

BUILTIN_POLICY_SET: Final[PolicySet] = PolicySet(
    version=BUILTIN_POLICY_VERSION,
    rules=BUILTIN_RULES,
)
