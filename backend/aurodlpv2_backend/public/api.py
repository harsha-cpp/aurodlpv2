"""Public unauthenticated endpoints — used by the browser extension."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from aurodlpv2_backend.db.models import ApprovedDomain, Organization
from aurodlpv2_backend.deps import DbSession

router = APIRouter()


class PublicOrg(BaseModel):
    name: str
    org_code: str


class PublicDomain(BaseModel):
    domain: str
    direction: str
    classification: str


class PublicConfig(BaseModel):
    organization: PublicOrg
    # Recipient allow-list only. Blocked domains are intentionally separated so
    # clients can never accidentally treat them as approved destinations.
    domains: list[PublicDomain]
    blocked_domains: list[PublicDomain]


@router.get("/orgs/{org_code}/config", response_model=PublicConfig)
async def get_public_config(org_code: str, session: DbSession) -> PublicConfig:
    normalized = org_code.strip().upper()
    org = await session.scalar(select(Organization).where(Organization.org_code == normalized))
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="unknown org code")

    domains = (
        await session.scalars(
            select(ApprovedDomain)
            .where(ApprovedDomain.org_id == org.id)
            .order_by(ApprovedDomain.domain.asc(), ApprovedDomain.direction.asc())
        )
    ).all()
    recipient_allow = [
        domain
        for domain in domains
        if domain.classification in {"internal", "partner"}
        and domain.direction in {"recipient", "both"}
    ]
    blocked = [domain for domain in domains if domain.classification == "blocked"]

    return PublicConfig(
        organization=PublicOrg(name=org.name, org_code=org.org_code),
        domains=[_public_domain(domain) for domain in recipient_allow],
        blocked_domains=[_public_domain(domain) for domain in blocked],
    )


def _public_domain(domain: ApprovedDomain) -> PublicDomain:
    return PublicDomain(
        domain=domain.domain,
        direction=domain.direction,
        classification=domain.classification,
    )
