"""Admin domain-allowlist endpoints."""

from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select

from aurodlpv2_backend.audit.writer import write_event
from aurodlpv2_backend.db.models import DomainClassification
from aurodlpv2_backend.deps import DbSession, Principal, require_role

router = APIRouter()
AdminUser = Annotated[Principal, Depends(require_role("admin", "super_admin"))]
DomainKind = Literal["internal", "approved_partner"]


class DomainRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=255)
    classification: DomainKind

    @field_validator("domain")
    @classmethod
    def normalize_domain(cls, value: str) -> str:
        return value.strip().lower()


class DomainResponse(BaseModel):
    domain: str
    classification: DomainKind


@router.get("")
async def list_domains(session: DbSession, actor: AdminUser) -> list[DomainResponse]:
    rows = await session.scalars(
        select(DomainClassification)
        .where(DomainClassification.workspace_id == actor.workspace_id)
        .order_by(DomainClassification.domain)
    )
    return [
        DomainResponse(domain=row.domain, classification=row.classification)
        for row in rows
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_domain(
    payload: DomainRequest,
    session: DbSession,
    actor: AdminUser,
) -> DomainResponse:
    row = DomainClassification(
        workspace_id=actor.workspace_id,
        domain=payload.domain,
        classification=payload.classification,
    )
    await session.merge(row)
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="domain.upserted",
        category="policy",
        resource_type="domain",
        resource_id=payload.domain,
        after_state={"domain": payload.domain, "classification": payload.classification},
    )
    await session.commit()
    return DomainResponse(domain=payload.domain, classification=payload.classification)


@router.delete("/{domain}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(domain: str, session: DbSession, actor: AdminUser) -> None:
    normalized = domain.strip().lower()
    await session.execute(
        delete(DomainClassification).where(
            DomainClassification.workspace_id == actor.workspace_id,
            DomainClassification.domain == normalized,
        )
    )
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="domain.deleted",
        category="policy",
        resource_type="domain",
        resource_id=normalized,
        before_state={"domain": normalized},
    )
    await session.commit()
