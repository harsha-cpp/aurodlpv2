from __future__ import annotations

import uuid
from typing import Any

import pytest
from httpx import AsyncClient

from tests.integration.conftest import requires_database

pytestmark = [pytest.mark.integration, requires_database]

AADHAAR = "7534 7930 7460"
BODY_WITH_PHI = f"Patient Lakshmi Devi, UHID 0024518, diagnosis E11.9. Aadhaar {AADHAAR}."

ALLOW_EVERYTHING: dict[str, Any] = {
    "version": "permissive-test",
    "rules": [
        {
            "id": "allow-everything",
            "description": "test",
            "enabled": True,
            "order": 1,
            "conditions": {},
            "action": "allow",
            "user_message": "",
        }
    ],
}


async def _signup(client: AsyncClient) -> tuple[str, str]:
    suffix = uuid.uuid4().hex[:10]
    response = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Policy Hospital {suffix}",
            "email": f"owner-{suffix}@sunrisehospital.in",
            "password": "correct-horse-battery-staple-9",
        },
    )
    assert response.status_code == 201, response.text
    body: dict[str, Any] = response.json()
    return str(body["access_token"]), str(body["organization"]["org_code"])


async def _scan(client: AsyncClient, org_code: str, recipient: str) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "org_code": org_code,
        "client_scan_id": uuid.uuid4().hex,
        "subject": "Discharge summary",
        "body": BODY_WITH_PHI,
        "recipients": [recipient],
        "user_email": "doctor@sunrisehospital.in",
    }
    response = await client.post("/api/v1/scan/email", json=payload)
    assert response.status_code == 200, response.text
    result: dict[str, Any] = response.json()
    return result


async def test_new_org_uses_the_builtin_rules(api_client: AsyncClient) -> None:
    token, _org_code = await _signup(api_client)
    response = await api_client.get("/api/v1/policy", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    assert body["is_custom"] is False
    assert any(rule["id"] == "unapproved-sender-with-phi" for rule in body["rules"])


async def test_editing_policy_changes_what_a_scan_decides(api_client: AsyncClient) -> None:
    token, org_code = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}

    before = await _scan(api_client, org_code, "patient@gmail.com")
    assert before["action"] in {"quarantine", "warn", "block"}

    replaced = await api_client.put("/api/v1/policy", headers=headers, json=ALLOW_EVERYTHING)
    assert replaced.status_code == 200, replaced.text
    assert replaced.json()["is_custom"] is True

    after = await _scan(api_client, org_code, "patient@gmail.com")
    assert after["action"] == "allow"
    assert after["matched_policy_ids"] == ["allow-everything"]


async def test_reset_restores_the_builtin_rules(api_client: AsyncClient) -> None:
    token, org_code = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}

    await api_client.put("/api/v1/policy", headers=headers, json=ALLOW_EVERYTHING)
    assert (await _scan(api_client, org_code, "patient@gmail.com"))["action"] == "allow"

    reset = await api_client.post("/api/v1/policy/reset", headers=headers)
    assert reset.status_code == 200, reset.text
    assert reset.json()["is_custom"] is False

    restored = await _scan(api_client, org_code, "patient@gmail.com")
    assert restored["action"] != "allow"


async def test_duplicate_rule_ids_are_rejected(api_client: AsyncClient) -> None:
    token, _org_code = await _signup(api_client)
    payload: dict[str, Any] = {
        "version": "dupes",
        "rules": [
            {"id": "same", "enabled": True, "order": 1, "conditions": {}, "action": "allow"},
            {"id": "same", "enabled": True, "order": 2, "conditions": {}, "action": "block"},
        ],
    }
    response = await api_client.put(
        "/api/v1/policy", headers={"Authorization": f"Bearer {token}"}, json=payload
    )
    assert response.status_code == 400


async def test_a_policy_with_no_enabled_rule_is_rejected(api_client: AsyncClient) -> None:
    token, _org_code = await _signup(api_client)
    payload: dict[str, Any] = {
        "version": "off",
        "rules": [{"id": "off", "enabled": False, "order": 1, "conditions": {}, "action": "allow"}],
    }
    response = await api_client.put(
        "/api/v1/policy", headers={"Authorization": f"Bearer {token}"}, json=payload
    )
    assert response.status_code == 400


async def test_simulation_previews_a_candidate_without_saving_it(
    api_client: AsyncClient,
) -> None:
    token, org_code = await _signup(api_client)
    headers = {"Authorization": f"Bearer {token}"}

    payload: dict[str, Any] = {
        "entities": [{"type": "IN_AADHAAR", "masked_value": "****7460"}],
        "risk_score": 71.3,
        "severity": "high",
        "recipient_classes": ["public_email"],
        "sender_class": "internal",
        "candidate": {
            "version": "candidate",
            "rules": [
                {
                    "id": "candidate-block",
                    "enabled": True,
                    "order": 1,
                    "conditions": {},
                    "action": "block",
                }
            ],
        },
    }
    response = await api_client.post("/api/v1/policy/simulate", headers=headers, json=payload)
    assert response.status_code == 200, response.text
    assert response.json()["action"] == "block"

    saved = await api_client.get("/api/v1/policy", headers=headers)
    assert saved.json()["is_custom"] is False
    live = await _scan(api_client, org_code, "patient@gmail.com")
    assert live["matched_policy_ids"] != ["candidate-block"]


async def test_invite_no_longer_leaks_the_token_in_the_response(
    api_client: AsyncClient,
) -> None:
    token, _org_code = await _signup(api_client)
    suffix = uuid.uuid4().hex[:8]
    invited = await api_client.post(
        "/api/v1/members/invite",
        headers={"Authorization": f"Bearer {token}"},
        json={"email": f"viewer-{suffix}@sunrisehospital.in", "role": "viewer"},
    )
    assert invited.status_code == 201, invited.text
    assert "invite_token" not in invited.json()
