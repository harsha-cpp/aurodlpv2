"""Scan credential resolution: device token first, org code as a fallback.

The org code is a single static secret shared by every user in a hospital.
Rotating it breaks every install at once, any viewer-role account could read it,
and it names no one — so an audit row could never say which person sent the
message. Per-device tokens replace it.

Both are accepted during the migration, because an org cannot re-enrol every
laptop the day the backend deploys. A scan authenticated by org code is marked
as such, so the dashboard can show how much of an estate is still un-enrolled
and the deprecation can actually be finished.
"""

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
    """Who is asking for a scan, and how strongly we know it."""

    org_id: UUID
    kind: CredentialKind
    #: Present only for device-authenticated scans. The org-code path has no
    #: identity at all, which is exactly the weakness being retired.
    member_id: UUID | None = None
    email: str | None = None

    @property
    def is_identified(self) -> bool:
        return self.email is not None

    def actor(self, claimed_email: str | None = None) -> str:
        """Audit actor string.

        A device-verified address wins over whatever the client claimed; the
        client-supplied one is recorded as unverified so the audit trail never
        implies more certainty than it has.
        """
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
    """Resolve a scan credential from headers.

    Endpoints that still take ``org_code`` in the body or query string call
    :func:`principal_for_org_code` instead; this dependency is for the
    header-based path new clients should use.
    """
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
    """Resolve a credential where org_code may arrive in the body or query."""
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
