"""Recipient classification."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.db.models import DomainClassification, Workspace

RecipientClass = Literal[
    "internal",
    "approved_partner",
    "external",
    "public_email",
    "unknown",
]

PUBLIC_EMAIL_DOMAINS: frozenset[str] = frozenset(
    {
        "gmail.com",
        "googlemail.com",
        "yahoo.com",
        "yahoo.co.in",
        "outlook.com",
        "hotmail.com",
        "live.com",
        "icloud.com",
        "rediffmail.com",
        "protonmail.com",
        "proton.me",
        "aol.com",
        "zoho.com",
    }
)
MIN_TLD_LENGTH = 2


async def classify(
    *,
    session: AsyncSession,
    workspace_id: UUID,
    email: str,
) -> RecipientClass:
    domain = email_domain(email)
    workspace = await session.scalar(select(Workspace).where(Workspace.id == workspace_id))
    if workspace is not None and domain in {item.lower() for item in workspace.google_domains}:
        return "internal"

    row = await session.scalar(
        select(DomainClassification).where(
            DomainClassification.workspace_id == workspace_id,
            DomainClassification.domain == domain,
        )
    )
    if row is not None:
        return row.classification

    if domain in PUBLIC_EMAIL_DOMAINS:
        return "public_email"
    if _looks_like_business_domain(domain):
        return "external"
    return "unknown"


def email_domain(email: str) -> str:
    return email.rsplit("@", maxsplit=1)[-1].strip().lower()


def _looks_like_business_domain(domain: str) -> bool:
    if "." not in domain:
        return False
    tld = domain.rsplit(".", maxsplit=1)[-1]
    return len(tld) >= MIN_TLD_LENGTH and tld.isalpha()
