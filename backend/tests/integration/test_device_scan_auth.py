from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.db.models import Organization, ScanEvent
from tests.integration.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

AADHAAR = "7534 7930 7460"
BODY_WITH_PHI = f"Patient Lakshmi Devi, UHID 0024518, diagnosis E11.9. Aadhaar {AADHAAR}."


async def _signup(client: AsyncClient) -> tuple[str, str, str]:
    suffix = uuid.uuid4().hex[:10]
    email = f"owner-{suffix}@sunrisehospital.in"
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Device Hospital {suffix}",
            "email": email,
            "password": "correct-horse-battery-staple-9",
        },
    )
    assert response.status_code == 201, response.text
    body = response.json()
    return body["access_token"], body["organization"]["org_code"], email


async def _enroll_device(client: AsyncClient, token: str) -> str:
    response = await client.post(
        "/api/v1/devices/enroll",
        headers={"Authorization": f"Bearer {token}"},
        json={"label": "Dr Rao's laptop"},
    )
    assert response.status_code in {200, 201}, response.text
    payload = response.json()
    raw = payload.get("token") or payload.get("device_token") or payload.get("raw_token")
    assert raw, f"enrolment did not return a raw token: {payload}"
    return raw


async def test_scan_authenticated_by_device_token_without_an_org_code(
    api_client: AsyncClient,
) -> None:
    token, _org_code, _email = await _signup(api_client)
    device_token = await _enroll_device(api_client, token)

    response = await api_client.post(
        "/api/v1/scan/email",
        headers={"X-Auro-Device-Token": device_token},
        json={
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Clean",
            "body": "Lunch in the cafeteria at noon?",
            "recipients": ["colleague@sunrisehospital.in"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["action"] == "allow"


async def test_device_token_supplies_the_sender_the_client_could_not_scrape(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token, org_code, owner_email = await _signup(api_client)
    device_token = await _enroll_device(api_client, token)

    response = await api_client.post(
        "/api/v1/scan/email",
        headers={"X-Auro-Device-Token": device_token},
        json={
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": ["patient@gmail.com"],
        },
    )
    assert response.status_code == 200, response.text

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1
    assert events[0].user_email == owner_email


async def test_unattributed_scan_records_no_sender_rather_than_a_fake_one(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _token, org_code, _email = await _signup(api_client)

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": ["patient@gmail.com"],
        },
    )
    assert response.status_code == 200, response.text

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1
    assert events[0].user_email is None, "an unattributable send must not invent a user"


async def test_revoked_device_token_is_rejected(api_client: AsyncClient) -> None:
    token, _org_code, _email = await _signup(api_client)
    device_token = await _enroll_device(api_client, token)

    listing = await api_client.get("/api/v1/devices", headers={"Authorization": f"Bearer {token}"})
    assert listing.status_code == 200, listing.text
    device_id = listing.json()[0]["id"]

    revoked = await api_client.post(
        f"/api/v1/devices/{device_id}/revoke",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert revoked.status_code in {200, 204}, revoked.text

    response = await api_client.post(
        "/api/v1/scan/email",
        headers={"X-Auro-Device-Token": device_token},
        json={
            "client_scan_id": uuid.uuid4().hex,
            "subject": "",
            "body": "hello",
            "recipients": [],
        },
    )
    assert response.status_code == 401


async def test_scan_without_any_credential_is_rejected(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "client_scan_id": uuid.uuid4().hex,
            "subject": "",
            "body": "hello",
            "recipients": [],
        },
    )
    assert response.status_code == 401


async def test_garbage_device_token_is_rejected(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/scan/email",
        headers={"X-Auro-Device-Token": "aurodev_not-a-real-token.nope"},
        json={
            "client_scan_id": uuid.uuid4().hex,
            "subject": "",
            "body": "hello",
            "recipients": [],
        },
    )
    assert response.status_code == 401
