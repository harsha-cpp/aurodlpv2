"""Organization management — current org, regenerate code, update settings."""

from __future__ import annotations

import hashlib
import secrets

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import Organization
from aurodlpv2_backend.deps import CurrentMember, DbSession, OwnerOnly, OwnerOrAdmin

router = APIRouter()

_ORG_CODE_BYTES = 18


def _generate_org_code() -> str:
    suffix = secrets.token_urlsafe(_ORG_CODE_BYTES).replace("-", "").replace("_", "")
    return "AUR-" + suffix.upper()


class OrgOut(BaseModel):
    id: str
    name: str
    slug: str
    org_code: str
    plan: str


class OrgUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)


def _serialize(org: Organization) -> OrgOut:
    return OrgOut(
        id=str(org.id),
        name=org.name,
        slug=org.slug,
        org_code=org.org_code,
        plan=org.plan,
    )


@router.get("/current", response_model=OrgOut)
async def current_org(member: CurrentMember, session: DbSession) -> OrgOut:
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="organization missing")
    return _serialize(org)


@router.patch("/current", response_model=OrgOut)
async def update_current_org(
    payload: OrgUpdate,
    member: CurrentMember,
    session: DbSession,
    _admin: OwnerOrAdmin,
) -> OrgOut:
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="organization missing")
    if payload.name is not None:
        org.name = payload.name.strip()
    await session.commit()
    await session.refresh(org)
    return _serialize(org)


@router.post("/current/regenerate-code", response_model=OrgOut)
async def regenerate_org_code(
    member: CurrentMember,
    session: DbSession,
    _owner: OwnerOnly,
) -> OrgOut:
    org = await session.get(Organization, member.org_id)
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="organization missing")

    for _attempt in range(10):
        previous_code = org.org_code
        candidate = _generate_org_code()
        existing = await session.scalar(
            select(Organization.id).where(Organization.org_code == candidate)
        )
        if existing is not None:
            continue
        org.org_code = candidate
        await write_audit_event(
            session,
            org_id=member.org_id,
            actor=f"member:{member.email}",
            category="org",
            action="org_code_regenerated",
            metadata={
                "previous_org_code_sha256": hashlib.sha256(
                    previous_code.encode("utf-8")
                ).hexdigest()
            },
        )
        try:
            await session.commit()
        except IntegrityError:
            await session.rollback()
            continue
        await session.refresh(org)
        return _serialize(org)

    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="code allocation failed")
