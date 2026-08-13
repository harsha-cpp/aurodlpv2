# pyright: reportUnknownMemberType=false

from __future__ import annotations

import os
from typing import TypedDict, cast
from uuid import uuid4

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aurodlpv2_backend.settings import get_settings

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("AURODLPV2_INTEGRATION") != "1",
        reason="requires the local PostgreSQL integration stack",
    ),
]

_PASSWORD = "correct-horse-battery-staple"
_CSRF = {"X-Auro-CSRF": "1"}


class _OrganizationResponse(TypedDict):
    org_code: str


class _SignupResponse(TypedDict):
    access_token: str
    organization: _OrganizationResponse


class _EnrollmentResponse(TypedDict):
    id: str
    token: str


async def _signup(client: AsyncClient, label: str) -> _SignupResponse:
    unique = uuid4().hex
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"{label} {unique}",
            "email": f"owner-{unique}@example.com",
            "password": _PASSWORD,
            "name": f"{label} Owner",
        },
    )
    assert response.status_code == 201, response.text
    return cast(_SignupResponse, response.json())


async def test_refresh_rotation_rejects_csrf_and_revokes_family_on_replay(
    app: FastAPI,
    client: AsyncClient,
) -> None:
    await _signup(client, "Refresh Security")
    cookie_name = get_settings().refresh_cookie_name
    first_cookie = client.cookies.get(cookie_name)
    assert first_cookie is not None

    missing_csrf = await client.post("/api/v1/auth/refresh")
    assert missing_csrf.status_code == 403

    rotated = await client.post("/api/v1/auth/refresh", headers=_CSRF)
    assert rotated.status_code == 200, rotated.text
    second_cookie = client.cookies.get(cookie_name)
    assert second_cookie is not None
    assert second_cookie != first_cookie

    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={cookie_name: first_cookie},
    ) as replay_client:
        replay = await replay_client.post("/api/v1/auth/refresh", headers=_CSRF)
    assert replay.status_code == 401
    assert replay.json()["detail"] == "refresh token reuse detected"

    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        cookies={cookie_name: second_cookie},
    ) as family_client:
        family_revoked = await family_client.post("/api/v1/auth/refresh", headers=_CSRF)
    assert family_revoked.status_code == 401
    assert family_revoked.json()["detail"] == "refresh token reuse detected"


async def test_extension_credentials_are_revocable_and_tenant_bound(
    app: FastAPI,
) -> None:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as org_a_client:
        org_a = await _signup(org_a_client, "Tenant A")
        org_a_bearer = {
            "Authorization": f"Bearer {org_a['access_token']}",
        }
        enrollment = await org_a_client.post(
            "/api/v1/extension-clients",
            headers=org_a_bearer,
            json={"label": "Tenant A Chrome"},
        )
        assert enrollment.status_code == 201, enrollment.text
        enrollment_body = cast(_EnrollmentResponse, enrollment.json())
        extension_headers = {
            "Authorization": f"AuroExtension {enrollment_body['token']}",
        }

        async with AsyncClient(transport=transport, base_url="http://test") as org_b_client:
            org_b = await _signup(org_b_client, "Tenant B")

        wrong_tenant = await org_a_client.post(
            "/api/v1/scan/email",
            headers=extension_headers,
            json={
                "org_code": org_b["organization"]["org_code"],
                "client_scan_id": f"tenant-boundary-{uuid4().hex}",
                "subject": "No patient data",
                "body": "A routine operational message.",
                "recipients": ["recipient@example.com"],
            },
        )
        assert wrong_tenant.status_code == 404
        assert wrong_tenant.json()["detail"] == "unknown org code"

        revoked = await org_a_client.delete(
            f"/api/v1/extension-clients/{enrollment_body['id']}",
            headers=org_a_bearer,
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["status"] == "revoked"

        rejected = await org_a_client.post(
            "/api/v1/scan/email",
            headers=extension_headers,
            json={
                "org_code": org_a["organization"]["org_code"],
                "client_scan_id": f"revoked-client-{uuid4().hex}",
                "subject": "No patient data",
                "body": "A routine operational message.",
                "recipients": ["recipient@example.com"],
            },
        )
        assert rejected.status_code == 401
        assert rejected.json()["detail"] == "invalid extension credential"
