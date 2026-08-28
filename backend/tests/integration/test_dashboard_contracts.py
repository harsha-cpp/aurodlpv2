"""Contracts the dashboard depends on.

Each of these was a gap the dashboard had to work around client-side: fanning
out three requests to see a whole queue, pulling 200 audit rows to filter them
in the browser, or claiming hash-chain continuity over whatever page happened
to be loaded.
"""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from aurodlpv2_backend.main import create_app
from tests.integration.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

BODY_WITH_PHI = "Patient Lakshmi Devi, UHID 0024518, Aadhaar 7534 7930 7460."


async def _signup(client: AsyncClient) -> tuple[str, str, str]:
    suffix = uuid.uuid4().hex[:10]
    email = f"owner-{suffix}@sunrisehospital.in"
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Contract Hospital {suffix}",
            "email": email,
            "password": "correct-horse-battery-staple-9",
        },
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return str(body["access_token"]), str(body["organization"]["org_code"]), email


async def _scan(client: AsyncClient, org_code: str, recipient: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": [recipient],
            "user_email": "doctor@sunrisehospital.in",
        },
    )
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


# ----------------------------------------------------------- quarantine ----


async def test_quarantine_accepts_status_all(api_client: AsyncClient) -> None:
    """Without this the dashboard fans out one request per status."""
    token, org_code, _email = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    await api_client.post(
        "/api/v1/domains",
        headers=headers,
        json={"domain": "sunrisehospital.in", "classification": "internal", "direction": "both"},
    )
    await _scan(api_client, org_code, "patient@gmail.com")

    everything = await api_client.get("/api/v1/quarantine?status=all", headers=headers)
    assert everything.status_code == 200, everything.text

    pending = await api_client.get("/api/v1/quarantine?status=pending", headers=headers)
    assert pending.status_code == 200
    assert len(everything.json()) >= len(pending.json())


async def test_quarantine_rejects_an_unknown_status(api_client: AsyncClient) -> None:
    token, _org_code, _email = await _signup(api_client)
    response = await api_client.get(
        "/api/v1/quarantine?status=nonsense",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 422


# --------------------------------------------------------------- members ----


async def test_member_roster_reports_verification_and_mfa_state(
    api_client: AsyncClient,
) -> None:
    """An admin chasing 2FA coverage needs this on the roster, not per member."""
    token, _org_code, _email = await _signup(api_client)
    response = await api_client.get(
        "/api/v1/members", headers={"Authorization": f"Bearer {token}"}
    )
    assert response.status_code == 200, response.text
    member = response.json()[0]
    assert "email_verified" in member
    assert "mfa_enabled" in member
    assert member["mfa_enabled"] is False


# ----------------------------------------------------------------- audit ----


async def test_audit_filters_server_side_and_pages(api_client: AsyncClient) -> None:
    token, org_code, _email = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    await api_client.post(
        "/api/v1/domains",
        headers=headers,
        json={"domain": "sunrisehospital.in", "classification": "internal", "direction": "both"},
    )
    for _ in range(4):
        await _scan(api_client, org_code, "patient@gmail.com")

    page = await api_client.get("/api/v1/audit?limit=2", headers=headers)
    assert page.status_code == 200, page.text
    body: dict[str, Any] = page.json()
    assert len(body["events"]) == 2
    assert body["next_cursor"], "more rows exist, so a cursor must be offered"

    second = await api_client.get(
        f"/api/v1/audit?limit=2&cursor={body['next_cursor']}", headers=headers
    )
    assert second.status_code == 200
    first_ids = {event["id"] for event in body["events"]}
    second_ids = {event["id"] for event in second.json()["events"]}
    assert not (first_ids & second_ids), "keyset paging must not repeat a row"

    scoped = await api_client.get("/api/v1/audit?category=scan&limit=50", headers=headers)
    assert scoped.status_code == 200
    assert {event["category"] for event in scoped.json()["events"]} == {"scan"}


async def test_audit_rejects_a_malformed_cursor(api_client: AsyncClient) -> None:
    token, _org_code, _email = await _signup(api_client)
    response = await api_client.get(
        "/api/v1/audit?cursor=not-a-cursor",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 400


async def test_audit_categories_are_listed(api_client: AsyncClient) -> None:
    token, org_code, _email = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    await _scan(api_client, org_code, "patient@gmail.com")

    response = await api_client.get("/api/v1/audit/categories", headers=headers)
    assert response.status_code == 200, response.text
    assert "scan" in response.json()


async def test_audit_chain_verifies_the_whole_log_not_one_page(
    api_client: AsyncClient,
) -> None:
    """The client can only ever check the rows it loaded; this checks all of them."""
    token, org_code, _email = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}
    for _ in range(3):
        await _scan(api_client, org_code, "patient@gmail.com")

    response = await api_client.get("/api/v1/audit/chain", headers=headers)
    assert response.status_code == 200, response.text
    status = response.json()
    assert status["ok"] is True
    assert status["checked"] >= 3
    assert status["broken_at"] is None


# ------------------------------------------------------------------ login ----


async def test_login_documents_both_response_branches() -> None:
    """A generated client must be able to see the MFA challenge branch."""
    schema = create_app().openapi()
    payload = schema["paths"]["/api/v1/auth/login"]["post"]["responses"]["200"]
    body = payload["content"]["application/json"]["schema"]
    refs = {option.get("$ref", "") for option in body.get("anyOf", [])}
    assert any("AuthResponse" in ref for ref in refs)
    assert any("MfaChallengeResponse" in ref for ref in refs)
