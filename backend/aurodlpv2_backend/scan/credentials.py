from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Literal
from uuid import UUID

from fastapi import Header, HTTPException, status
from sqlalchemy import select

from aurodlpv2_backend.db.models import Organization
from aurodlpv2_backend.deps import DbSession, DevicePrincipal, current_device

CredentialKind = Literal["device", "org_code"]


@dataclass(frozen=True, slots=True)
class ScanPrincipal:
    org_id: UUID
    kind: CredentialKind
    member_id: UUID | None = None
    email: str | None = None

    @property
    def is_identified(self) -> bool:
        return self.email is not None

    def actor(self, claimed_email: str | None = None) -> str:
        if self.email:
            return f"device:{self.email}"
        if claimed_email:
            return f"extension-unverified:{claimed_email}"
        return "extension-unverified:unknown"


async def resolve_org_code(session: DbSession, org_code: str) -> Organization:
    org = await session.scalar(
        select(Organization).where(Organization.org_code == org_code.strip().upper())
    )
    if org is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="unknown org code")
    return org


async def scan_principal(
    session: DbSession,
    x_auro_device_token: Annotated[str | None, Header()] = None,
    x_auro_org_code: Annotated[str | None, Header()] = None,
) -> ScanPrincipal:
    if x_auro_device_token:
        device: DevicePrincipal = await current_device(session, x_auro_device_token)
        return ScanPrincipal(
            org_id=device.org_id,
            kind="device",
            member_id=device.member_id,
            email=device.email,
        )
    if x_auro_org_code:
        org = await resolve_org_code(session, x_auro_org_code)
        return ScanPrincipal(org_id=org.id, kind="org_code")
    raise HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail="missing device token or org code",
    )


async def principal_for_request(
    session: DbSession,
    org_code: str | None,
    device_token: str | None,
) -> ScanPrincipal:
    if device_token:
        device = await current_device(session, device_token)
        return ScanPrincipal(
            org_id=device.org_id,
            kind="device",
            member_id=device.member_id,
            email=device.email,
        )
    if org_code:
        org = await resolve_org_code(session, org_code)
        return ScanPrincipal(org_id=org.id, kind="org_code")
    raise HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        detail="missing device token or org code",
    )
