from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.auth.tokens import DEVICE_TOKEN_PREFIX, issue_token
from aurodlpv2_backend.db.models import DeviceToken
from aurodlpv2_backend.deps import CurrentMember, DbSession, OwnerOrAdmin, Principal
from aurodlpv2_backend.settings import get_settings

router = APIRouter()

MAX_ACTIVE_DEVICES_PER_ORG = 2000


class DeviceOut(BaseModel):
    id: str
    label: str
    member_email: str | None
    last_seen_at: str | None
    revoked_at: str | None
    expires_at: str
    created_at: str


class EnrollRequest(BaseModel):
    label: str = Field(min_length=1, max_length=120)


class EnrollResponse(BaseModel):
    device: DeviceOut
    device_token: str


def _serialize(device: DeviceToken) -> DeviceOut:
    return DeviceOut(
        id=str(device.id),
        label=device.label,
        member_email=device.member_email,
        last_seen_at=device.last_seen_at.isoformat() if device.last_seen_at else None,
        revoked_at=device.revoked_at.isoformat() if device.revoked_at else None,
        expires_at=device.expires_at.isoformat(),
        created_at=device.created_at.isoformat(),
    )


@router.post("/enroll", response_model=EnrollResponse, status_code=status.HTTP_201_CREATED)
async def enroll_device(
    payload: EnrollRequest,
    member: CurrentMember,
    session: DbSession,
) -> EnrollResponse:
    """Issue a device token for the caller's own install."""
    settings = get_settings()
    active = await _active_device_count(session, member)
    if active >= MAX_ACTIVE_DEVICES_PER_ORG:
        raise HTTPException(
            status.HTTP_409_CONFLICT, detail="active device limit reached, revoke unused devices"
        )

    issued = await asyncio.to_thread(
        issue_token,
        DEVICE_TOKEN_PREFIX,
        ttl=timedelta(days=settings.device_token_ttl_days),
    )
    device = DeviceToken(
        id=issued.id,
        org_id=member.org_id,
        member_id=member.member_id,
        member_email=member.email,
        label=payload.label.strip(),
        token_hash=issued.token_hash,
        expires_at=issued.expires_at,
    )
    session.add(device)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="device",
        action="device_enrolled",
        metadata={"device_id": str(device.id), "label": device.label},
    )
    await session.commit()
    await session.refresh(device)
    return EnrollResponse(device=_serialize(device), device_token=issued.raw_token)


@router.get("", response_model=list[DeviceOut])
async def list_devices(member: CurrentMember, session: DbSession) -> list[DeviceOut]:
    rows = (
        await session.scalars(
            select(DeviceToken)
            .where(DeviceToken.org_id == member.org_id)
            .order_by(DeviceToken.created_at.desc())
        )
    ).all()
    return [_serialize(row) for row in rows]


@router.post("/{device_id}/revoke", response_model=DeviceOut)
async def revoke_device(
    device_id: UUID,
    member: CurrentMember,
    session: DbSession,
    _admin: OwnerOrAdmin,
) -> DeviceOut:
    device = await session.get(DeviceToken, device_id)
    if device is None or device.org_id != member.org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="device not found")
    if device.revoked_at is None:
        device.revoked_at = datetime.now(UTC)
        await write_audit_event(
            session,
            org_id=member.org_id,
            actor=f"member:{member.email}",
            category="device",
            action="device_revoked",
            metadata={"device_id": str(device.id), "label": device.label},
        )
        await session.commit()
        await session.refresh(device)
    return _serialize(device)


async def _active_device_count(session: DbSession, member: Principal) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(DeviceToken)
        .where(
            DeviceToken.org_id == member.org_id,
            DeviceToken.revoked_at.is_(None),
            DeviceToken.expires_at > datetime.now(UTC),
        )
    )
    return int(count or 0)
