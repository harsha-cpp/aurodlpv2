"""Workspace admin endpoints."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select

from aurodlpv2_backend.audit.writer import write_event
from aurodlpv2_backend.db.models import Workspace
from aurodlpv2_backend.deps import DbSession, Principal, require_role

router = APIRouter()


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    google_domains: list[str] = Field(min_length=1)
    settings: dict[str, object] = Field(default_factory=dict)

    @field_validator("google_domains")
    @classmethod
    def normalize_domains(cls, value: list[str]) -> list[str]:
        return sorted({domain.strip().lower() for domain in value if domain.strip()})


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    google_domains: list[str]


SuperAdmin = Annotated[Principal, Depends(require_role("super_admin"))]


@router.get("")
async def list_workspaces(
    session: DbSession,
    _actor: SuperAdmin,
) -> list[WorkspaceResponse]:
    rows = await session.scalars(select(Workspace).order_by(Workspace.created_at.desc()))
    return [_workspace_response(workspace) for workspace in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    session: DbSession,
    actor: SuperAdmin,
) -> WorkspaceResponse:
    workspace = Workspace(
        name=payload.name,
        google_domains=payload.google_domains,
        settings=payload.settings,
    )
    session.add(workspace)
    await session.flush()
    await write_event(
        session=session,
        workspace_id=actor.workspace_id,
        actor_type="user",
        actor_id=str(actor.user_id),
        actor_email=actor.email,
        action="workspace.created",
        category="auth",
        resource_type="workspace",
        resource_id=str(workspace.id),
        after_state={
            "workspace_id": str(workspace.id),
            "name": workspace.name,
            "google_domains": workspace.google_domains,
        },
    )
    await session.commit()
    return _workspace_response(workspace)


def _workspace_response(workspace: Workspace) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        google_domains=workspace.google_domains,
    )
