"""Shared pytest fixtures."""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from aurodlpv2_backend.db.session import close_engine
from aurodlpv2_backend.main import create_app
from aurodlpv2_backend.storage.objects import get_object_store


@pytest.fixture(scope="session", autouse=True)
async def provision_integration_storage() -> AsyncIterator[None]:
    if os.getenv("AURODLPV2_INTEGRATION") == "1":
        await asyncio.to_thread(get_object_store().ensure_bucket)
    yield


@pytest.fixture(scope="session", autouse=True)
async def dispose_database_engine() -> AsyncIterator[None]:
    yield
    await close_engine()


@pytest.fixture(scope="session")
def app() -> FastAPI:
    return create_app()


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
