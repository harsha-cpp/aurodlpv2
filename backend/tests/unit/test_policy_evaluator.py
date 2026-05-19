from __future__ import annotations

import pytest

from medshield_backend.policy.evaluator import PolicyContext, evaluate
from medshield_backend.policy.models import Condition, EntityClause, Policy, RecipientClause, Rule


@pytest.mark.unit
def test_policy_evaluator_most_restrictive_action_wins() -> None:
    policy = Policy(
        id="pol-a",
        workspace_id="workspace-a",
        name="PHI outbound",
        enabled=True,
        rules=[
            Rule(
                id="warn-abha",
                name="Warn ABHA",
                when=Condition(
                    op="all_of",
                    clauses=[EntityClause(op="contains", value="ABHA")],
                ),
                action="warn",
                severity="medium",
            ),
            Rule(
                id="block-public",
                name="Block public",
                when=Condition(
                    op="all_of",
                    clauses=[
                        EntityClause(op="contains", value="ABHA"),
                        RecipientClause(op="classification_in", value=["public_email"]),
                    ],
                ),
                action="block",
                severity="high",
                user_message="ABHA cannot go to public mail.",
            ),
        ],
    )

    result = evaluate(
        [policy],
        PolicyContext(
            entity_counts={"ABHA": 1},
            recipient_classes=["public_email"],
            recipient_domains=["gmail.com"],
            attachment_mime_types=[],
            attachment_text="",
            severity="medium",
            score=10.0,
        ),
    )

    assert result.action == "block"
    assert result.severity == "high"
    assert result.matched_policy_ids == ["pol-a", "pol-a"]
    assert result.user_message == "ABHA cannot go to public mail."
