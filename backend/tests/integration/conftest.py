from __future__ import annotations

import os
import socket
from collections.abc import AsyncIterator, Iterator
from urllib.parse import urlparse

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://blade:blade@localhost:5433/blade_test"


def _database_url() -> str:
    return os.environ.get("BLADE_TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)


def _reachable(url: str) -> bool:
    parsed = urlparse(url.replace("postgresql+asyncpg", "postgresql"))
    if not parsed.hostname:
        return False
    try:
        with socket.create_connection((parsed.hostname, parsed.port or 5432), timeout=1.0):
            return True
    except OSError:
        return False


requires_database = pytest.mark.skipif(
    not _reachable(_database_url()),
    reason=(
        f"no Postgres at {_database_url()}. Start one with `make dev-up`, create the "
        "test database and run `alembic upgrade head`."
    ),
)


@pytest.fixture(scope="session")
def database_url() -> str:
    return _database_url()


@pytest.fixture(autouse=True, name="_point_settings_at_test_database")
def point_settings_at_test_database(
    monkeypatch: pytest.MonkeyPatch,
    database_url: str,
) -> Iterator[None]:
    sync_url = database_url.replace("+asyncpg", "+psycopg")
    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("DATABASE_SYNC_URL", sync_url)
    monkeypatch.setenv("STORAGE_BACKEND", "local")
    monkeypatch.setenv("APP_ENV", "test")

    from blade_backend.db import session as session_module  # noqa: PLC0415
    from blade_backend.settings import get_settings  # noqa: PLC0415

    get_settings.cache_clear()
    session_module.get_engine.cache_clear()
    session_module.get_session_factory.cache_clear()
    yield
    get_settings.cache_clear()
    session_module.get_engine.cache_clear()
    session_module.get_session_factory.cache_clear()


@pytest.fixture
async def db_session(database_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(database_url, poolclass=None)
    factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest.fixture
async def api_client() -> AsyncIterator[AsyncClient]:
    from blade_backend.main import create_app  # noqa: PLC0415

    app = create_app()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        yield client
