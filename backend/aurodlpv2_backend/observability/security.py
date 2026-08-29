from __future__ import annotations

import hashlib
import time
from collections import OrderedDict, deque
from collections.abc import Awaitable, Callable
from typing import cast

from redis.asyncio import Redis
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from aurodlpv2_backend.settings import get_settings

_UNKNOWN_CLIENT = "unknown"


def resolve_client_ip(request: Request, trusted_proxy_count: int) -> str:
    fallback = request.client.host if request.client else _UNKNOWN_CLIENT
    if trusted_proxy_count <= 0:
        return fallback
    forwarded = request.headers.get("x-forwarded-for")
    if not forwarded:
        return fallback
    parts = [part.strip() for part in forwarded.split(",") if part.strip()]
    if len(parts) < trusted_proxy_count:
        return fallback
    return parts[-trusted_proxy_count]


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["content-security-policy"] = "frame-ancestors 'none'"
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app: ASGIApp,
        *,
        limit: int | None = None,
        window_seconds: int = 60,
    ) -> None:
        super().__init__(app)
        self._limit_override = limit
        self._window_seconds = window_seconds
        self._buckets: OrderedDict[str, deque[float]] = OrderedDict()
        self._redis: Redis | None = None
        self._redis_checked = False

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        path = request.url.path
        if not path.startswith("/api/v1/") or self._is_exempt(path):
            return await call_next(request)
        if await self._over_limit(self._key(request)):
            return JSONResponse(
                {"detail": "rate limit exceeded"},
                status_code=429,
                headers={"retry-after": str(self._window_seconds)},
            )
        return await call_next(request)

    def _is_exempt(self, path: str) -> bool:
        return any(path.startswith(prefix) for prefix in get_settings().api_rate_limit_exempt_paths)

    @property
    def _limit(self) -> int:
        if self._limit_override is not None:
            return self._limit_override
        return get_settings().api_rate_limit_per_minute

    async def _over_limit(self, key: str) -> bool:
        redis = await self._get_redis()
        if redis is not None:
            try:
                count = await redis.incr(f"apirl:{key}")
                if count == 1:
                    await redis.expire(f"apirl:{key}", self._window_seconds)
            except Exception:
                self._redis = None
            else:
                return count > self._limit
        return self._over_limit_memory(key)

    async def _get_redis(self) -> Redis | None:
        if self._redis_checked:
            return self._redis
        self._redis_checked = True
        try:
            redis = Redis.from_url(  # pyright: ignore[reportUnknownMemberType]
                get_settings().redis_url,
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

    def _over_limit_memory(self, key: str) -> bool:
        now = time.monotonic()
        bucket = self._buckets.get(key)
        if bucket is None:
            self._evict_if_full()
            bucket = deque[float]()
            self._buckets[key] = bucket
        self._buckets.move_to_end(key)
        while bucket and now - bucket[0] > self._window_seconds:
            bucket.popleft()
        if len(bucket) >= self._limit:
            return True
        bucket.append(now)
        return False

    def _evict_if_full(self) -> None:
        max_keys = get_settings().api_rate_limit_max_keys
        while len(self._buckets) >= max_keys:
            self._buckets.popitem(last=False)

    def _key(self, request: Request) -> str:
        authorization = request.headers.get("authorization")
        if authorization:
            digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()
            return f"auth:{digest}"
        device_token = request.headers.get("x-auro-device-token")
        if device_token:
            digest = hashlib.sha256(device_token.encode("utf-8")).hexdigest()
            return f"device:{digest}"
        client = resolve_client_ip(request, get_settings().trusted_proxy_count)
        return f"ip:{client}"
