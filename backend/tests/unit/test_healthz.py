from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from medshield_backend.health import ComponentStatus, ReadinessStatus
from medshield_backend.main import create_app


@pytest.mark.unit
async def test_healthz(client: AsyncClient) -> None:
    r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.unit
async def test_readyz_returns_component_status() -> None:
    async def ready() -> ReadinessStatus:
        return ReadinessStatus(
            ready=True,
            components=(
                ComponentStatus(name="database", ok=True, detail="ok"),
                ComponentStatus(name="redis", ok=True, detail="reachable"),
            ),
    )

    app = create_app(readiness_probe=ready)
    async with AsyncClient(transport=client_transport(app), base_url="http://test") as ac:
        r = await ac.get("/readyz")

    assert r.status_code == 200
    assert r.json() == {
        "status": "ready",
        "components": [
            {"name": "database", "ok": True, "detail": "ok"},
            {"name": "redis", "ok": True, "detail": "reachable"},
        ],
    }


def client_transport(app: FastAPI) -> ASGITransport:
    return ASGITransport(app=app)
