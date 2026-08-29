from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aurodlpv2_backend.db.models import AuditEvent, Organization, ScanEvent
from tests.integration.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]


async def _signup(client: AsyncClient) -> tuple[str, str, str]:
    suffix = uuid.uuid4().hex[:10]
    email = f"owner-{suffix}@sunrisehospital.in"
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Web Guard Hospital {suffix}",
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


def _web_event(org_code: str | None = None, **overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "client_event_id": uuid.uuid4().hex,
        "action": "block",
        "severity": "critical",
        "risk_score": 92,
        "channel": "web",
        "site_host": "chatgpt.com",
        "entities": [
            {"type": "IN_AADHAAR", "confidence": 0.99, "masked_value": "XXXX XXXX 7460"},
        ],
    }
    if org_code is not None:
        payload["org_code"] = org_code
    payload.update(overrides)
    return payload


async def _org_id(session: AsyncSession, org_code: str) -> uuid.UUID:
    org_id = await session.scalar(select(Organization.id).where(Organization.org_code == org_code))
    assert org_id is not None
    return org_id


async def test_web_event_records_the_site_and_the_masked_value(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _token, org_code, _email = await _signup(api_client)

    response = await api_client.post("/api/v1/events", json=_web_event(org_code))
    assert response.status_code == 202, response.text
    assert response.json() == {"status": "accepted"}

    org_id = await _org_id(db_session, org_code)
    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1
    assert events[0].channel == "web"
    assert events[0].site_host == "chatgpt.com"
    assert events[0].entities[0]["masked_value"] == "XXXX XXXX 7460"


async def test_email_event_without_a_channel_is_still_accepted(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _token, org_code, _email = await _signup(api_client)

    response = await api_client.post(
        "/api/v1/events",
        json={
            "org_code": org_code,
            "client_event_id": uuid.uuid4().hex,
            "action": "warn",
            "severity": "medium",
            "risk_score": 55,
            "recipients": ["patient@gmail.com"],
            "entities": [{"type": "MRN", "confidence": 0.8}],
        },
    )
    assert response.status_code == 202, response.text

    org_id = await _org_id(db_session, org_code)
    event = await db_session.scalar(select(ScanEvent).where(ScanEvent.org_id == org_id))
    assert event is not None
    assert event.channel == "email"
    assert event.site_host is None


async def test_ingest_writes_one_audit_row_carrying_the_site(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _token, org_code, _email = await _signup(api_client)
    body = _web_event(org_code)

    accepted = await api_client.post("/api/v1/events", json=body)
    assert accepted.status_code == 202, accepted.text
    replayed = await api_client.post("/api/v1/events", json=body)
    assert replayed.status_code == 202, replayed.text
    assert replayed.json() == {"status": "duplicate"}

    org_id = await _org_id(db_session, org_code)
    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1

    audits = (
        await db_session.scalars(
            select(AuditEvent).where(AuditEvent.org_id == org_id, AuditEvent.category == "scan")
        )
    ).all()
    assert len(audits) == 1
    metadata = audits[0].metadata_json
    assert audits[0].action == "block"
    assert metadata["channel"] == "web"
    assert metadata["site_host"] == "chatgpt.com"
    assert metadata["entity_types"] == ["IN_AADHAAR"]
    assert "XXXX XXXX 7460" not in str(metadata)


async def test_device_token_attributes_the_web_event_to_its_member(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token, org_code, owner_email = await _signup(api_client)
    device_token = await _enroll_device(api_client, token)

    response = await api_client.post(
        "/api/v1/events",
        headers={"X-Auro-Device-Token": device_token},
        json=_web_event(),
    )
    assert response.status_code == 202, response.text

    org_id = await _org_id(db_session, org_code)
    event = await db_session.scalar(select(ScanEvent).where(ScanEvent.org_id == org_id))
    assert event is not None
    assert event.user_email == owner_email
    audit = await db_session.scalar(
        select(AuditEvent).where(AuditEvent.org_id == org_id, AuditEvent.category == "scan")
    )
    assert audit is not None
    assert audit.actor == f"device:{owner_email}"


async def test_event_without_any_credential_is_rejected(api_client: AsyncClient) -> None:
    response = await api_client.post("/api/v1/events", json=_web_event())
    assert response.status_code == 401


async def test_analytics_splits_by_channel_and_ranks_sites(api_client: AsyncClient) -> None:
    token, org_code, _email = await _signup(api_client)

    for site in ("chatgpt.com", "chatgpt.com", "claude.ai"):
        response = await api_client.post(
            "/api/v1/events", json=_web_event(org_code, site_host=site)
        )
        assert response.status_code == 202, response.text
    email_event = await api_client.post(
        "/api/v1/events",
        json={
            "org_code": org_code,
            "client_event_id": uuid.uuid4().hex,
            "action": "block",
            "severity": "high",
            "risk_score": 80,
            "recipients": ["patient@gmail.com"],
            "entities": [{"type": "MRN", "confidence": 0.9, "masked_value": "UHID 00XXXXX"}],
        },
    )
    assert email_event.status_code == 202, email_event.text

    analytics = await api_client.get(
        "/api/v1/events/analytics", headers={"Authorization": f"Bearer {token}"}
    )
    assert analytics.status_code == 200, analytics.text
    body = analytics.json()
    assert body["by_channel"] == {"email": 1, "web": 3}
    assert body["top_sites"] == [
        {"site_host": "chatgpt.com", "count": 2},
        {"site_host": "claude.ai", "count": 1},
    ]
    channels = {event["channel"] for event in body["recent_events"]}
    assert channels == {"web", "email"}
    sites = {event["site_host"] for event in body["recent_events"]}
    assert sites == {"chatgpt.com", "claude.ai", None}


async def test_site_host_that_is_a_url_is_rejected(api_client: AsyncClient) -> None:
    _token, org_code, _email = await _signup(api_client)

    response = await api_client.post(
        "/api/v1/events",
        json=_web_event(org_code, site_host="https://chatgpt.com/c/patient-summary"),
    )
    assert response.status_code == 422, response.text


async def test_web_event_without_a_site_host_is_rejected(api_client: AsyncClient) -> None:
    _token, org_code, _email = await _signup(api_client)

    body = _web_event(org_code)
    del body["site_host"]
    response = await api_client.post("/api/v1/events", json=body)
    assert response.status_code == 422, response.text
