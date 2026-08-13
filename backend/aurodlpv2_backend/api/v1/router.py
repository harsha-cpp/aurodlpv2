"""Aggregate /api/v1 router."""

from __future__ import annotations

from fastapi import APIRouter

from aurodlpv2_backend.audit.api import router as audit_router
from aurodlpv2_backend.auth.api import router as auth_router
from aurodlpv2_backend.domains.api import router as domains_router
from aurodlpv2_backend.events.api import router as events_router
from aurodlpv2_backend.extension_clients.api import router as extension_clients_router
from aurodlpv2_backend.members.api import router as members_router
from aurodlpv2_backend.orgs.api import router as orgs_router
from aurodlpv2_backend.public.api import router as public_router
from aurodlpv2_backend.quarantine.api import router as quarantine_router
from aurodlpv2_backend.scan.api import router as scan_router

api_v1_router = APIRouter()
api_v1_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_v1_router.include_router(orgs_router, prefix="/orgs", tags=["orgs"])
api_v1_router.include_router(members_router, prefix="/members", tags=["members"])
api_v1_router.include_router(domains_router, prefix="/domains", tags=["domains"])
api_v1_router.include_router(events_router, prefix="/events", tags=["events"])
api_v1_router.include_router(
    extension_clients_router,
    prefix="/extension-clients",
    tags=["extension-clients"],
)
api_v1_router.include_router(public_router, prefix="/public", tags=["public"])
api_v1_router.include_router(scan_router, prefix="/scan", tags=["scan"])
api_v1_router.include_router(quarantine_router, prefix="/quarantine", tags=["quarantine"])
api_v1_router.include_router(audit_router, prefix="/audit", tags=["audit"])
