"""Pydantic models for the custom Python policy DSL.

See ``docs/plans/backend.md`` §7. Persisted as JSONB in ``policies.body``.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from medshield_backend.scan.schemas import Action, Severity

ConditionOp = Literal["any_of", "all_of", "none_of"]
EntityOp = Literal["contains", "count_gte", "count_lt", "severity_gte"]
RecipientOp = Literal["classification_in", "domain_not_in"]


class EntityClause(BaseModel):
    kind: Literal["entity"] = "entity"
    op: EntityOp
    value: str | int | Severity


class RecipientClause(BaseModel):
    kind: Literal["recipient"] = "recipient"
    op: RecipientOp
    value: list[str]


class AttachmentClause(BaseModel):
    kind: Literal["attachment"] = "attachment"
    op: Literal["mime_in", "ocr_text_contains"]
    value: list[str] | str


Clause = EntityClause | RecipientClause | AttachmentClause


class Condition(BaseModel):
    op: ConditionOp
    clauses: list[Clause]


class Rule(BaseModel):
    id: str
    name: str
    when: Condition
    action: Action
    severity: Severity
    user_message: str | None = None


class Policy(BaseModel):
    id: str
    workspace_id: str
    name: str
    version: int = Field(default=1, ge=1)
    enabled: bool = True
    rules: list[Rule]
