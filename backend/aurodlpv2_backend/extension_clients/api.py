"""Extension enrollment, inventory, and revocation endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from aurodlpv2_backend.audit.service import write_audit_event
from aurodlpv2_backend.db.models import ExtensionClient
from aurodlpv2_backend.deps import DbSession, OwnerOrAdmin
from aurodlpv2_backend.extension_clients.security import issue_extension_token
from aurodlpv2_backend.settings import get_settings

router = APIRouter()


class ExtensionClientCreate(BaseModel):
    label: str = Field(min_length=2, max_length=120)


class ExtensionClientView(BaseModel):
    id: str
    label: str
    status: str
    expires_at: str
    revoked_at: str | None
    created_at: str


class ExtensionEnrollment(ExtensionClientView):
    token: str


def _view(client: ExtensionClient) -> ExtensionClientView:
    return ExtensionClientView(
        id=str(client.id),
        label=client.label,
        status=client.status,
        expires_at=client.expires_at.isoformat(),
        revoked_at=client.revoked_at.isoformat() if client.revoked_at else None,
        created_at=client.created_at.isoformat(),
    )


@router.post("", response_model=ExtensionEnrollment, status_code=status.HTTP_201_CREATED)
async def create_extension_client(
    payload: ExtensionClientCreate,
    member: OwnerOrAdmin,
    session: DbSession,
) -> ExtensionEnrollment:
    issued = issue_extension_token()
    client = ExtensionClient(
        id=issued.client_id,
        org_id=member.org_id,
        label=payload.label.strip(),
        token_hash=issued.token_hash,
        status="active",
        created_by=member.member_id,
        expires_at=datetime.now(UTC) + timedelta(days=get_settings().extension_token_ttl_days),
    )
    session.add(client)
    await session.flush()
    await write_audit_event(
        session,
        org_id=member.org_id,
        actor=f"member:{member.email}",
        category="extension",
        action="client_enrolled",
        metadata={"extension_client_id": str(client.id), "label": client.label},
    )
    await session.commit()
    await session.refresh(client)
    return ExtensionEnrollment(**_view(client).model_dump(), token=issued.raw_token)


@router.get("", response_model=list[ExtensionClientView])
async def list_extension_clients(
    member: OwnerOrAdmin,
    session: DbSession,
    include_revoked: Annotated[bool, Query()] = False,
) -> list[ExtensionClientView]:
    statement = select(ExtensionClient).where(ExtensionClient.org_id == member.org_id)
    if not include_revoked:
        statement = statement.where(ExtensionClient.status == "active")
    rows = (
        await session.scalars(
            statement.order_by(ExtensionClient.created_at.desc(), ExtensionClient.id.desc())
        )
    ).all()
    return [_view(client) for client in rows]


@router.delete("/{client_id}", response_model=ExtensionClientView)
async def revoke_extension_client(
    client_id: UUID,
    member: OwnerOrAdmin,
    session: DbSession,
) -> ExtensionClientView:
    client = await session.scalar(
        select(ExtensionClient)
        .where(
            ExtensionClient.id == client_id,
            ExtensionClient.org_id == member.org_id,
        )
        .with_for_update()
    )
    if client is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="extension client not found")
    if client.status == "active":
        client.status = "revoked"
        client.revoked_at = datetime.now(UTC)
        await write_audit_event(
            session,
            org_id=member.org_id,
            actor=f"member:{member.email}",
            category="extension",
            action="client_revoked",
            metadata={"extension_client_id": str(client.id), "label": client.label},
        )
        await session.commit()
        await session.refresh(client)
    return _view(client)
