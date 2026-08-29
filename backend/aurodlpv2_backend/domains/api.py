from __future__ import annotations

import re
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from aurodlpv2_backend.db.models import ApprovedDomain, DomainClass, DomainDirection
from aurodlpv2_backend.deps import CurrentMember, DbSession, DomainEditor, OwnerOrAdmin

router = APIRouter()

_DOMAIN_RE = re.compile(
    r"^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$"
)
_EMAIL_RE = re.compile(
    r"^[a-z0-9._%+-]+@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$"
)


def _normalize_domain(raw: str) -> str:
    value = raw.strip().lower()
    if "@" in value and not value.startswith("@"):
        if not _EMAIL_RE.match(value):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"invalid email: {raw}")
        return value
    value = value.lstrip("@")
    if not _DOMAIN_RE.match(value):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=f"invalid domain: {raw}")
    return value


class DomainIn(BaseModel):
    domain: str = Field(min_length=3, max_length=253)
    direction: DomainDirection = "both"
    classification: DomainClass = "partner"
    notes: str | None = Field(default=None, max_length=500)

    @field_validator("domain")
    @classmethod
    def lower_strip(cls, value: str) -> str:
        return value.strip().lower().lstrip("@")


class DomainOut(BaseModel):
    id: str
    domain: str
    direction: str
    classification: str
    notes: str | None
    created_at: str


class DomainUpdate(BaseModel):
    direction: DomainDirection | None = None
    classification: DomainClass | None = None
    notes: str | None = Field(default=None, max_length=500)


def _serialize(domain: ApprovedDomain) -> DomainOut:
    return DomainOut(
        id=str(domain.id),
        domain=domain.domain,
        direction=domain.direction,
        classification=domain.classification,
        notes=domain.notes,
        created_at=domain.created_at.isoformat(),
    )


@router.get("", response_model=list[DomainOut])
async def list_domains(member: CurrentMember, session: DbSession) -> list[DomainOut]:
    rows = (
        await session.scalars(
            select(ApprovedDomain)
            .where(ApprovedDomain.org_id == member.org_id)
            .order_by(ApprovedDomain.domain.asc(), ApprovedDomain.direction.asc())
        )
    ).all()
    return [_serialize(domain) for domain in rows]


@router.post("", response_model=DomainOut, status_code=status.HTTP_201_CREATED)
async def create_domain(
    payload: DomainIn,
    member: CurrentMember,
    session: DbSession,
    _editor: DomainEditor,
) -> DomainOut:
    normalized = _normalize_domain(payload.domain)
    existing = await session.scalar(
        select(ApprovedDomain.id).where(
            ApprovedDomain.org_id == member.org_id,
            ApprovedDomain.domain == normalized,
            ApprovedDomain.direction == payload.direction,
        )
    )
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="domain already exists")

    record = ApprovedDomain(
        org_id=member.org_id,
        domain=normalized,
        direction=payload.direction,
        classification=payload.classification,
        notes=payload.notes,
        created_by=member.member_id,
    )
    session.add(record)
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="domain already exists") from exc
    await session.refresh(record)
    return _serialize(record)


@router.patch("/{domain_id}", response_model=DomainOut)
async def update_domain(
    domain_id: UUID,
    payload: DomainUpdate,
    member: CurrentMember,
    session: DbSession,
    _editor: DomainEditor,
) -> DomainOut:
    record = await session.get(ApprovedDomain, domain_id)
    if record is None or record.org_id != member.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="domain not found")

    if payload.direction is not None:
        record.direction = payload.direction
    if payload.classification is not None:
        record.classification = payload.classification
    if "notes" in payload.model_fields_set:
        record.notes = payload.notes

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="domain already exists") from exc
    await session.refresh(record)
    return _serialize(record)


@router.delete("/{domain_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_domain(
    domain_id: UUID,
    member: CurrentMember,
    session: DbSession,
    _admin: OwnerOrAdmin,
) -> None:
    record = await session.get(ApprovedDomain, domain_id)
    if record is None or record.org_id != member.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="domain not found")
    await session.delete(record)
    await session.commit()
