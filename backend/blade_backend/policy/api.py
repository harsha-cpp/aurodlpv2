from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from blade_backend.audit.service import write_audit_event
from blade_backend.deps import CurrentMember, DbSession, OwnerOrAdmin
from blade_backend.policy.defaults import BUILTIN_POLICY_SET
from blade_backend.policy.engine import build_facts, evaluate
from blade_backend.policy.models import (
    PolicyRule,
    PolicySet,
    RecipientClass,
    SenderClass,
    Severity,
)
from blade_backend.policy.store import load_policy_set, reset_policy_set, save_policy_set

router = APIRouter()


class PolicySetOut(BaseModel):
    version: str
    rules: list[PolicyRule]
    is_custom: bool


class PolicySetIn(BaseModel):
    version: str = Field(default="custom", max_length=80)
    rules: list[PolicyRule] = Field(min_length=1, max_length=200)


def _empty_entities() -> list[SimulationEntity]:
    return []


def _empty_recipients() -> list[RecipientClass]:
    return []


class SimulationEntity(BaseModel):
    type: str = Field(min_length=1, max_length=80)
    masked_value: str = Field(default="****", max_length=200)


class SimulationRequest(BaseModel):
    entities: list[SimulationEntity] = Field(default_factory=_empty_entities, max_length=200)
    risk_score: float = Field(default=0, ge=0, le=100)
    severity: Severity = "none"
    recipient_classes: list[RecipientClass] = Field(
        default_factory=_empty_recipients, max_length=50
    )
    sender_class: SenderClass = "internal"
    has_attachments: bool = False
    candidate: PolicySetIn | None = None


class SimulationResponse(BaseModel):
    action: Literal["allow", "warn", "block", "quarantine", "escalate"]
    severity: Severity
    risk_score: float
    matched_policy_ids: list[str]
    user_message: str


@router.get("", response_model=PolicySetOut)
async def get_policy(member: CurrentMember, session: DbSession) -> PolicySetOut:
    policy_set = await load_policy_set(session, member.org_id)
    return PolicySetOut(
        version=policy_set.version,
        rules=policy_set.rules,
        is_custom=policy_set.version != BUILTIN_POLICY_SET.version,
    )


@router.get("/defaults", response_model=PolicySetOut)
async def get_default_policy(_member: CurrentMember) -> PolicySetOut:
    """The builtin set, so the editor can offer a diff and a way back."""
    return PolicySetOut(
        version=BUILTIN_POLICY_SET.version,
        rules=BUILTIN_POLICY_SET.rules,
        is_custom=False,
    )


@router.put("", response_model=PolicySetOut)
async def replace_policy(
    payload: PolicySetIn,
    member: CurrentMember,
    session: DbSession,
    _admin: OwnerOrAdmin,
) -> PolicySetOut:
    identifiers = [rule.id for rule in payload.rules]
    if len(identifiers) != len(set(identifiers)):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="policy rule ids must be unique",
        )
    if not any(rule.enabled for rule in payload.rules):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="at least one rule must be enabled",
        )

    policy_set = PolicySet(version=payload.version, rules=payload.rules)
    await save_policy_set(session, member.org_id, policy_set)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="policy",
        action="replaced",
        metadata={
            "version": policy_set.version,
            "rule_count": len(policy_set.rules),
            "rule_ids": identifiers,
        },
    )
    await session.commit()
    return PolicySetOut(version=policy_set.version, rules=policy_set.rules, is_custom=True)


@router.post("/reset", response_model=PolicySetOut)
async def reset_policy(
    member: CurrentMember,
    session: DbSession,
    _admin: OwnerOrAdmin,
) -> PolicySetOut:
    policy_set = await reset_policy_set(session, member.org_id)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="policy",
        action="reset_to_builtin",
        metadata={},
    )
    await session.commit()
    return PolicySetOut(version=policy_set.version, rules=policy_set.rules, is_custom=False)


@router.post("/simulate", response_model=SimulationResponse)
async def simulate_policy(
    payload: SimulationRequest,
    member: CurrentMember,
    session: DbSession,
) -> SimulationResponse:
    """What would this rule set do to this message?

    Enforcement changes are hard to reason about from a rule list alone, and
    getting one wrong either blocks a ward's mail or lets patient data out.
    """
    policy_set = (
        PolicySet(version=payload.candidate.version, rules=payload.candidate.rules)
        if payload.candidate
        else await load_policy_set(session, member.org_id)
    )
    facts = build_facts(
        entities=[(entity.type, entity.masked_value) for entity in payload.entities],
        risk_score=payload.risk_score,
        severity=payload.severity,
        recipient_classes=payload.recipient_classes,
        sender_class=payload.sender_class,
        has_attachments=payload.has_attachments,
    )
    decision = evaluate(facts, policy_set)
    return SimulationResponse(
        action=decision.action,
        severity=decision.severity,
        risk_score=decision.risk_score,
        matched_policy_ids=decision.matched_policy_ids,
        user_message=decision.user_message,
    )
