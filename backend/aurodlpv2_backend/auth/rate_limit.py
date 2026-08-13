"""Login-specific rate limiter with Redis and local-dev fallback."""

from __future__ import annotations

import hashlib
import time
from collections import defaultdict, deque
from collections.abc import Awaitable, Callable, MutableMapping
from dataclasses import dataclass
from typing import cast

from redis.asyncio import Redis
from starlette.requests import Request

from aurodlpv2_backend.settings import get_settings


@dataclass(frozen=True, slots=True)
class LoginLimitResult:
    allowed: bool
    retry_after_seconds: int = 0


class LoginRateLimiter:
    def __init__(self) -> None:
        self._buckets: MutableMapping[str, deque[float]] = defaultdict(deque)
        self._redis: Redis | None = None
        self._redis_checked = False

    async def check(self, request: Request, email: str) -> LoginLimitResult:
        settings = get_settings()
        key = self._key(request, email)
        redis = await self._get_redis()
        if redis is not None:
            try:
                minute_count = await redis.incr(f"login:{key}:m")
                if minute_count == 1:
                    await redis.expire(f"login:{key}:m", 60)
                hour_count = await redis.incr(f"login:{key}:h")
                if hour_count == 1:
                    await redis.expire(f"login:{key}:h", 3600)
                if minute_count > settings.login_rate_limit_per_minute:
                    ttl = await redis.ttl(f"login:{key}:m")
                    return LoginLimitResult(False, max(int(ttl), 1))
                if hour_count > settings.login_rate_limit_per_hour:
                    ttl = await redis.ttl(f"login:{key}:h")
                    return LoginLimitResult(False, max(int(ttl), 1))
                return LoginLimitResult(True)
            except Exception:
                self._redis = None

        return self._check_memory(key)

    async def _get_redis(self) -> Redis | None:
        if self._redis_checked:
            return self._redis
        self._redis_checked = True
        settings = get_settings()
        try:
            redis = Redis.from_url(  # pyright: ignore[reportUnknownMemberType]
                settings.redis_url,
                socket_connect_timeout=0.05,
                socket_timeout=0.05,
                decode_responses=True,
            )
            ping = cast(
                Callable[[], Awaitable[object]],
                redis.ping,  # pyright: ignore[reportUnknownMemberType]
            )
            await ping()
            self._redis = redis
        except Exception:
            self._redis = None
        return self._redis

    def _check_memory(self, key: str) -> LoginLimitResult:
        settings = get_settings()
        now = time.monotonic()
        minute_key = f"{key}:m"
        hour_key = f"{key}:h"
        minute_bucket = self._buckets[minute_key]
        hour_bucket = self._buckets[hour_key]
        _prune(minute_bucket, now, 60)
        _prune(hour_bucket, now, 3600)
        if len(minute_bucket) >= settings.login_rate_limit_per_minute:
            return LoginLimitResult(False, _retry_after(minute_bucket, now, 60))
        if len(hour_bucket) >= settings.login_rate_limit_per_hour:
            return LoginLimitResult(False, _retry_after(hour_bucket, now, 3600))
        minute_bucket.append(now)
        hour_bucket.append(now)
        return LoginLimitResult(True)

    def _key(self, request: Request, email: str) -> str:
        client = request.client.host if request.client else "unknown"
        return hashlib.sha256(f"{client}:{email.lower()}".encode()).hexdigest()


def _prune(bucket: deque[float], now: float, window_seconds: int) -> None:
    while bucket and now - bucket[0] > window_seconds:
        bucket.popleft()


def _retry_after(bucket: deque[float], now: float, window_seconds: int) -> int:
    if not bucket:
        return window_seconds
    return max(1, int(window_seconds - (now - bucket[0])))


login_rate_limiter = LoginRateLimiter()
