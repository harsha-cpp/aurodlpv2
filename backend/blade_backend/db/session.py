from __future__ import annotations

from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any, cast

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from blade_backend.settings import get_settings


@lru_cache(maxsize=1)
def get_engine() -> AsyncEngine:
    settings = get_settings()

    connect_args: dict[str, Any] = {}
    execution_options: dict[str, Any] = {}
    if settings.database_disable_prepared_statements and "asyncpg" in settings.database_url:
        connect_args["statement_cache_size"] = 0
        connect_args["prepared_statement_cache_size"] = 0
        execution_options["compiled_cache"] = None

    return create_async_engine(
        settings.database_url,
        pool_size=settings.database_pool_size,
        max_overflow=settings.database_max_overflow,
        pool_pre_ping=True,
        connect_args=connect_args,
        execution_options=execution_options,
    )


@lru_cache(maxsize=1)
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False, class_=AsyncSession)


async def get_session() -> AsyncIterator[AsyncSession]:
    async with get_session_factory()() as session:
        yield session


async def check_database() -> bool:
    async with get_engine().connect() as connection:
        value = cast(int | None, await connection.scalar(text("SELECT 1")))
    return value == 1


async def close_engine() -> None:
    if get_engine.cache_info().currsize == 0:
        return
    await get_engine().dispose()
    get_session_factory.cache_clear()
    get_engine.cache_clear()
