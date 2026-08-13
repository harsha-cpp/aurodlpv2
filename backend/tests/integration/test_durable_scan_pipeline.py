# pyright: reportUnknownMemberType=false

from __future__ import annotations

import os
from uuid import uuid4

import fitz
import pytest
from httpx import AsyncClient

from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.storage.objects import get_object_store
from aurodlpv2_backend.tasks.scan_worker import process_next_job

pytestmark = [
    pytest.mark.integration,
    pytest.mark.skipif(
        os.getenv("AURODLPV2_INTEGRATION") != "1",
        reason="requires the local PostgreSQL and MinIO integration stack",
    ),
]


def _patient_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Patient record. MRN: MRN-123456")
    data = document.tobytes()
    document.close()
    return data


async def test_attachment_survives_api_worker_handoff_and_is_deleted(
    client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(get_settings(), "scan_deep_scan_threshold_bytes", 1)
    unique = uuid4().hex
    signup = await client.post(
        "/api/v1/auth/signup",
        json={
            "org_name": f"Pipeline {unique}",
            "email": f"owner-{unique}@example.com",
            "password": "correct-horse-battery-staple",
            "name": "Pipeline Owner",
        },
    )
    assert signup.status_code == 201, signup.text
    auth = signup.json()
    bearer = {"Authorization": f"Bearer {auth['access_token']}"}

    enrollment = await client.post(
        "/api/v1/extension-clients",
        headers=bearer,
        json={"label": "Integration Chrome"},
    )
    assert enrollment.status_code == 201, enrollment.text
    extension_headers = {
        "Authorization": f"AuroExtension {enrollment.json()['token']}",
    }
    org_code = auth["organization"]["org_code"]
    client_scan_id = f"integration-{unique}"

    queued = await client.post(
        "/api/v1/scan/attachment",
        headers=extension_headers,
        data={
            "org_code": org_code,
            "client_scan_id": client_scan_id,
            "attachment_id": "patient-record",
        },
        files={"file": ("patient-record.pdf", _patient_pdf(), "application/pdf")},
    )
    assert queued.status_code == 200, queued.text
    queued_body = queued.json()
    assert queued_body["status"] == "queued"

    store = get_object_store()
    assert process_next_job(worker_id="integration-worker", store=store)
    assert process_next_job(worker_id="integration-worker", store=store)

    result = await client.get(
        f"/api/v1/scan/attachment/{queued_body['attachment_scan_id']}",
        headers=extension_headers,
        params={"org_code": org_code},
    )
    assert result.status_code == 200, result.text
    result_body = result.json()
    assert result_body["status"] == "scanned"
    assert result_body["error"] is None
    assert result_body["verdict"] is not None
