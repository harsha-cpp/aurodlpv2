"""HTTP security headers."""

from __future__ import annotations

import hashlib
import time
from collections import deque
from collections.abc import MutableMapping

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        response.headers["content-security-policy"] = "frame-ancestors 'none'"
        response.headers["x-content-type-options"] = "nosniff"
        response.headers["referrer-policy"] = "no-referrer"
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp, *, limit: int = 60, window_seconds: int = 60) -> None:
        super().__init__(app)
        self._limit = limit
        self._window_seconds = window_seconds
        self._buckets: MutableMapping[str, deque[float]] = {}

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        if request.url.path.startswith("/api/v1/"):
            now = time.monotonic()
            bucket = self._buckets.setdefault(self._key(request), deque())
            while bucket and now - bucket[0] > self._window_seconds:
                bucket.popleft()
            if len(bucket) >= self._limit:
                return JSONResponse(
                    {"detail": "rate limit exceeded"},
                    status_code=429,
                    headers={"retry-after": str(self._window_seconds)},
                )
            bucket.append(now)
        return await call_next(request)

    def _key(self, request: Request) -> str:
        authorization = request.headers.get("authorization")
        if authorization:
            digest = hashlib.sha256(authorization.encode("utf-8")).hexdigest()
            return "auth:" + digest
        client = request.client.host if request.client else "unknown"
        return f"ip:{client}"
