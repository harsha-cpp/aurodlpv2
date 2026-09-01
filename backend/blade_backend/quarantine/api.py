from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from blade_backend.audit.service import write_audit_event
from blade_backend.db.models import Organization, QuarantineItem
from blade_backend.deps import CurrentMember, DbSession, QuarantineReviewer

router = APIRouter()

QuarantineStatus = Literal["pending", "approved", "rejected"]
QuarantineStatusFilter = Literal["pending", "approved", "rejected", "all"]


class QuarantineItemOut(BaseModel):
    id: str
    scan_id: str
    client_scan_id: str
    sender: str
    subject: str
    recipients: list[str]
    entities: list[dict[str, object]]
    matched_policy_ids: list[str]
    risk_score: float
    severity: str
    status: QuarantineStatus
    analyst_id: str | None
    analyst_note: str | None
    decided_at: str | None
    attachment_refs: list[dict[str, object]]
    created_at: str
    updated_at: str


class QuarantineDecisionIn(BaseModel):
    note: str | None = Field(default=None, max_length=1000)


class ExtensionQuarantineStatus(BaseModel):
    quarantine_id: str
    status: QuarantineStatus
    scan_id: str
    decided_at: str | None


def _serialize(item: QuarantineItem) -> QuarantineItemOut:
    return QuarantineItemOut(
        id=str(item.id),
        scan_id=item.scan_id,
        client_scan_id=item.client_scan_id,
        sender=item.sender,
        subject=item.subject,
        recipients=list(item.recipients or []),
        entities=list(item.entities or []),
        matched_policy_ids=list(item.matched_policy_ids or []),
        risk_score=float(item.risk_score),
        severity=item.severity,
        status=item.status,
        analyst_id=str(item.analyst_id) if item.analyst_id else None,
        analyst_note=item.analyst_note,
        decided_at=item.decided_at.isoformat() if item.decided_at else None,
        attachment_refs=list(item.attachment_refs or []),
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


async def _org_id_from_code(session: DbSession, org_code: str) -> UUID:
    org_id = await session.scalar(
        select(Organization.id).where(Organization.org_code == org_code.strip().upper())
    )
    if org_id is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="unknown org code")
    return org_id


async def _get_item(session: DbSession, item_id: UUID, org_id: UUID) -> QuarantineItem:
    item = await session.get(QuarantineItem, item_id)
    if item is None or item.org_id != org_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="quarantine item not found")
    return item


@router.get("", response_model=list[QuarantineItemOut])
async def list_quarantine_items(
    member: CurrentMember,
    session: DbSession,
    status_filter: Annotated[QuarantineStatusFilter, Query(alias="status")] = "pending",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
) -> list[QuarantineItemOut]:
    statement = select(QuarantineItem).where(QuarantineItem.org_id == member.org_id)
    if status_filter != "all":
        statement = statement.where(QuarantineItem.status == status_filter)
    rows = (
        await session.scalars(
            statement.order_by(
                QuarantineItem.created_at.desc(),
                QuarantineItem.id.desc(),
            ).limit(limit)
        )
    ).all()
    return [_serialize(item) for item in rows]


@router.get("/{item_id}", response_model=QuarantineItemOut)
async def get_quarantine_item(
    item_id: UUID,
    member: CurrentMember,
    session: DbSession,
) -> QuarantineItemOut:
    return _serialize(await _get_item(session, item_id, member.org_id))


@router.post("/{item_id}/approve", response_model=QuarantineItemOut)
async def approve_quarantine_item(
    item_id: UUID,
    payload: QuarantineDecisionIn,
    member: CurrentMember,
    session: DbSession,
    _reviewer: QuarantineReviewer,
) -> QuarantineItemOut:
    item = await _get_item(session, item_id, member.org_id)
    if item.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="quarantine already decided")
    item.status = "approved"
    item.analyst_id = member.member_id
    item.analyst_note = payload.note
    item.decided_at = datetime.now(UTC)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="quarantine",
        action="approved",
        metadata={"quarantine_id": str(item.id), "scan_id": item.scan_id},
    )
    await session.commit()
    await session.refresh(item)
    return _serialize(item)


@router.post("/{item_id}/reject", response_model=QuarantineItemOut)
async def reject_quarantine_item(
    item_id: UUID,
    payload: QuarantineDecisionIn,
    member: CurrentMember,
    session: DbSession,
    _reviewer: QuarantineReviewer,
) -> QuarantineItemOut:
    item = await _get_item(session, item_id, member.org_id)
    if item.status != "pending":
        raise HTTPException(status.HTTP_409_CONFLICT, detail="quarantine already decided")
    item.status = "rejected"
    item.analyst_id = member.member_id
    item.analyst_note = payload.note
    item.decided_at = datetime.now(UTC)
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="quarantine",
        action="rejected",
        metadata={"quarantine_id": str(item.id), "scan_id": item.scan_id},
    )
    await session.commit()
    await session.refresh(item)
    return _serialize(item)


@router.get("/{item_id}/status", response_model=ExtensionQuarantineStatus)
async def extension_quarantine_status(
    item_id: UUID,
    session: DbSession,
    org_code: Annotated[str, Query(min_length=3, max_length=128)],
) -> ExtensionQuarantineStatus:
    org_id = await _org_id_from_code(session, org_code)
    item = await _get_item(session, item_id, org_id)
    return ExtensionQuarantineStatus(
        quarantine_id=str(item.id),
        status=item.status,
        scan_id=item.scan_id,
        decided_at=item.decided_at.isoformat() if item.decided_at else None,
    )
