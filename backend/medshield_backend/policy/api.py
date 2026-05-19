"""Admin policy endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from medshield_backend.audit.writer import write_event
from medshield_backend.db.models import PolicyRecord
from medshield_backend.deps import DbSession, Principal, require_role
from medshield_backend.policy.models import Policy, Rule

router = APIRouter()
AdminUser = Annotated[Principal, Depends(require_role("admin", "super_admin"))]


class PolicyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    enabled: bool = True
    rules: list[Rule] = Field(min_length=1)


class DryRunResponse(BaseModel):
    would_block: int = 0
    would_warn: int = 0
    would_allow: int = 0
    delta_vs_current: dict[str, int] = Field(default_factory=dict)


@router.get("")
async def list_policies(session: DbSession, actor: AdminUser) -> list[Policy]:
    rows = await session.scalars(
        select(PolicyRecord)
        .where(PolicyRecord.workspace_id == actor.workspace_id)
        .order_by(PolicyRecord.updated_at.desc())
    )
    return [_policy_from_record(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_policy(
    payload: PolicyCreate,
    session: DbSession,
    actor: AdminUser,
) -> Policy:
    row = PolicyRecord(
        workspace_id=actor.workspace_id,
        name=payload.name,
        enabled=payload.enabled,
        rules=[rule.model_dump(mode="json") for rule in payload.rules],
        updated_by=actor.user_id,
    )
    session.add(row)
    await session.flush()
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="policy.created",
        category="policy",
        resource_type="policy",
        resource_id=str(row.id),
        after_state={"name": row.name, "enabled": row.enabled},
    )
    await session.commit()
    return _policy_from_record(row)


@router.post("/dry-run")
async def dry_run_policy(_payload: PolicyCreate, _actor: AdminUser) -> DryRunResponse:
    return DryRunResponse(delta_vs_current={"newly_blocked": 0, "newly_allowed": 0})


def _policy_from_record(row: PolicyRecord) -> Policy:
    return Policy(
        id=str(row.id),
        workspace_id=str(row.workspace_id),
        name=row.name,
        enabled=row.enabled,
        rules=[Rule.model_validate(rule) for rule in row.rules],
    )
