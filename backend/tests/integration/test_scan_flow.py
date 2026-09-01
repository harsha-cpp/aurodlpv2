from __future__ import annotations

import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from blade_backend.db.models import AuditEvent, Organization, QuarantineItem, ScanEvent
from tests.integration.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

AADHAAR = "7534 7930 7460"
BODY_WITH_PHI = f"Patient Lakshmi Devi, UHID 0024518, diagnosis E11.9. Aadhaar {AADHAAR}."


async def _signup(client: AsyncClient) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:10]
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Test Hospital {suffix}",
            "email": f"owner-{suffix}@sunrisehospital.in",
            "password": "correct-horse-battery-staple-9",
        },
    )
    assert response.status_code == 201, response.text
    payload = response.json()
    return payload["access_token"], payload["organization"]["org_code"]


async def _add_domain(
    client: AsyncClient,
    token: str,
    domain: str,
    classification: str,
    direction: str = "both",
) -> None:
    response = await client.post(
        "/api/v1/domains",
        headers={"Authorization": f"Bearer {token}"},
        json={"domain": domain, "classification": classification, "direction": direction},
    )
    assert response.status_code == 201, response.text


async def test_clean_message_is_allowed_and_recorded(api_client: AsyncClient) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Cafeteria",
            "body": "Can we meet at noon to discuss the budget?",
            "recipients": ["colleague@sunrisehospital.in"],
            "user_email": "doctor@sunrisehospital.in",
        },
    )
    assert response.status_code == 200, response.text
    verdict = response.json()
    assert verdict["action"] == "allow"
    assert verdict["risk_score"] == 0
    assert verdict["entities"] == []


async def test_phi_to_personal_gmail_is_quarantined_with_an_audit_trail(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")
    client_scan_id = uuid.uuid4().hex

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": client_scan_id,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": ["patient@gmail.com"],
            "user_email": "doctor@sunrisehospital.in",
        },
    )
    assert response.status_code == 200, response.text
    verdict = response.json()

    assert verdict["action"] in {"quarantine", "block"}
    assert verdict["risk_score"] > 50
    types = {entity["type"] for entity in verdict["entities"]}
    assert {"IN_AADHAAR", "MRN"} <= types
    assert AADHAAR.replace(" ", "") not in response.text
    assert "0024518" not in response.text

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    assert org_id is not None

    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1
    assert events[0].user_email == "doctor@sunrisehospital.in"

    audit = (await db_session.scalars(select(AuditEvent).where(AuditEvent.org_id == org_id))).all()
    assert {row.category for row in audit} >= {"scan"}


async def test_sender_on_an_unapproved_domain_is_blocked(api_client: AsyncClient) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Records",
            "body": BODY_WITH_PHI,
            "recipients": ["colleague@sunrisehospital.in"],
            "user_email": "doctor.personal@gmail.com",
        },
    )
    assert response.status_code == 200, response.text
    verdict = response.json()
    assert verdict["action"] == "block"
    assert "unapproved-sender-with-phi" in verdict["matched_policy_ids"]


async def test_blocked_recipient_domain_blocks(api_client: AsyncClient) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")
    await _add_domain(api_client, token, "competitorclinic.in", "blocked")

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Hello",
            "body": "Nothing sensitive here at all.",
            "recipients": ["someone@competitorclinic.in"],
            "user_email": "doctor@sunrisehospital.in",
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["action"] == "block"


async def test_repeated_client_scan_id_does_not_duplicate_the_event(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")
    client_scan_id = uuid.uuid4().hex
    payload = {
        "org_code": org_code,
        "client_scan_id": client_scan_id,
        "subject": "Retry",
        "body": BODY_WITH_PHI,
        "recipients": ["patient@gmail.com"],
        "user_email": "doctor@sunrisehospital.in",
    }

    first = await api_client.post("/api/v1/scan/email", json=payload)
    second = await api_client.post("/api/v1/scan/email", json=payload)
    assert first.status_code == 200
    assert second.status_code == 200

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    events = (await db_session.scalars(select(ScanEvent).where(ScanEvent.org_id == org_id))).all()
    assert len(events) == 1, "a retried send must not double-count in analytics"


async def test_quarantined_message_appears_in_the_review_queue(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    token, org_code = await _signup(api_client)
    await _add_domain(api_client, token, "sunrisehospital.in", "internal")

    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": ["patient@gmail.com"],
            "user_email": "doctor@sunrisehospital.in",
        },
    )
    verdict = response.json()
    if verdict["action"] != "quarantine":
        pytest.skip("policy blocked rather than quarantined; covered elsewhere")

    assert verdict["quarantine_id"]
    listing = await api_client.get(
        "/api/v1/quarantine",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert listing.status_code == 200, listing.text
    items = listing.json()
    assert any(item["id"] == verdict["quarantine_id"] for item in items)

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    stored = (
        await db_session.scalars(select(QuarantineItem).where(QuarantineItem.org_id == org_id))
    ).all()
    assert stored
    for item in stored:
        for entity in item.entities:
            assert AADHAAR.replace(" ", "") not in str(entity)


async def test_audit_events_reject_update_and_delete(
    api_client: AsyncClient,
    db_session: AsyncSession,
) -> None:
    _token, org_code = await _signup(api_client)
    await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": org_code,
            "client_scan_id": uuid.uuid4().hex,
            "subject": "Discharge summary",
            "body": BODY_WITH_PHI,
            "recipients": ["patient@gmail.com"],
            "user_email": "doctor@sunrisehospital.in",
        },
    )

    org_id = await db_session.scalar(
        select(Organization.id).where(Organization.org_code == org_code)
    )
    rows = (await db_session.scalars(select(AuditEvent).where(AuditEvent.org_id == org_id))).all()
    assert rows, "the scan should have written audit events"

    with pytest.raises(Exception, match=r"(?i)append|immutable|update|not allowed"):
        await db_session.execute(
            text("UPDATE audit_events SET actor = 'tampered' WHERE org_id = :org"),
            {"org": org_id},
        )
        await db_session.commit()
    await db_session.rollback()

    with pytest.raises(Exception, match=r"(?i)append|immutable|delete|not allowed"):
        await db_session.execute(
            text("DELETE FROM audit_events WHERE org_id = :org"), {"org": org_id}
        )
        await db_session.commit()
    await db_session.rollback()


async def test_unknown_org_code_is_rejected(api_client: AsyncClient) -> None:
    response = await api_client.post(
        "/api/v1/scan/email",
        json={
            "org_code": "BLD-DOESNOTEXIST",
            "client_scan_id": uuid.uuid4().hex,
            "subject": "",
            "body": "hello",
            "recipients": [],
        },
    )
    assert response.status_code == 404
