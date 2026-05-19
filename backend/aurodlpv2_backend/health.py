"""Readiness probes for runtime dependencies."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from urllib.parse import urlparse

from aurodlpv2_backend.db.session import check_database
from aurodlpv2_backend.settings import Settings


@dataclass(frozen=True, slots=True)
class ComponentStatus:
    name: str
    ok: bool
    detail: str

    def as_dict(self) -> dict[str, str | bool]:
        return {"name": self.name, "ok": self.ok, "detail": self.detail}


@dataclass(frozen=True, slots=True)
class ReadinessStatus:
    ready: bool
    components: tuple[ComponentStatus, ...]

    def as_dict(self) -> dict[str, str | list[dict[str, str | bool]]]:
        return {
            "status": "ready" if self.ready else "not_ready",
            "components": [component.as_dict() for component in self.components],
        }


ReadinessProbe = Callable[[], Awaitable[ReadinessStatus]]


def build_readiness_probe(settings: Settings) -> ReadinessProbe:
    async def probe() -> ReadinessStatus:
        database, redis = await asyncio.gather(
            database_status(),
            redis_status(settings.redis_url),
        )
        components = (database, redis)
        return ReadinessStatus(
            ready=all(component.ok for component in components),
            components=components,
        )

    return probe


async def database_status() -> ComponentStatus:
    try:
        ok = await asyncio.wait_for(check_database(), timeout=1.0)
    except TimeoutError:
        return ComponentStatus(name="database", ok=False, detail="timeout")
    except Exception as exc:
        return ComponentStatus(name="database", ok=False, detail=type(exc).__name__)
    return ComponentStatus(name="database", ok=ok, detail="ok" if ok else "unexpected_response")


async def redis_status(redis_url: str) -> ComponentStatus:
    parsed = urlparse(redis_url)
    host = parsed.hostname or "localhost"
    port = parsed.port or 6379
    try:
        _reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=1.0)
    except TimeoutError:
        return ComponentStatus(name="redis", ok=False, detail="timeout")
    except OSError as exc:
        return ComponentStatus(name="redis", ok=False, detail=type(exc).__name__)

    writer.close()
    await writer.wait_closed()
    return ComponentStatus(name="redis", ok=True, detail="reachable")
