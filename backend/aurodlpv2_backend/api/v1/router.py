"""Aggregate ``/api/v1`` router.

Each sub-router lives next to its domain (auth, scan, policy, ...). This
file just composes them. See ``docs/plans/backend.md`` §4 for the full
v1 API surface.
"""

from __future__ import annotations

from fastapi import APIRouter

from aurodlpv2_backend.audit.api import router as audit_router
from aurodlpv2_backend.auth.api import router as auth_router
from aurodlpv2_backend.dashboard.api import router as dashboard_router
from aurodlpv2_backend.policy.api import router as policy_router
from aurodlpv2_backend.quarantine.api import router as quarantine_router
from aurodlpv2_backend.recipients.api import router as recipients_router
from aurodlpv2_backend.scan.api import router as scan_router
from aurodlpv2_backend.workspaces.api import router as workspaces_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(scan_router, prefix="/scan", tags=["scan"])
api_v1_router.include_router(policy_router, prefix="/admin/policies", tags=["admin:policies"])
api_v1_router.include_router(recipients_router, prefix="/admin/domains", tags=["admin:domains"])
api_v1_router.include_router(
    quarantine_router,
    prefix="/admin/quarantine",
    tags=["admin:quarantine"],
)
api_v1_router.include_router(audit_router, prefix="/admin/audit", tags=["admin:audit"])
api_v1_router.include_router(dashboard_router, prefix="/admin/dashboard", tags=["admin:dashboard"])
api_v1_router.include_router(
    workspaces_router,
    prefix="/admin/workspaces",
    tags=["admin:workspaces"],
)
