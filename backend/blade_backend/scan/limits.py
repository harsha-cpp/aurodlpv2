from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass

from fastapi import HTTPException, status

from blade_backend.scan.credentials import ScanPrincipal
from blade_backend.settings import get_settings

MAX_TRACKED_KEYS = 20_000


@dataclass(slots=True)
class _Window:
    started_at: float
    count: int


class CredentialRateLimiter:
    def __init__(self) -> None:
        self._windows: OrderedDict[str, _Window] = OrderedDict()

    def check(self, key: str, *, limit: int, window_seconds: int) -> int:
        now = time.monotonic()
        window = self._windows.get(key)

        if window is None or now - window.started_at >= window_seconds:
            window = _Window(started_at=now, count=0)
            self._windows[key] = window
        self._windows.move_to_end(key)

        if window.count >= limit:
            retry_after = max(1, int(window_seconds - (now - window.started_at)))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                detail="scan rate limit exceeded",
                headers={"Retry-After": str(retry_after)},
            )

        window.count += 1
        while len(self._windows) > MAX_TRACKED_KEYS:
            self._windows.popitem(last=False)
        return limit - window.count

    def tracked_keys(self) -> int:
        return len(self._windows)

    def reset(self) -> None:
        self._windows.clear()


scan_rate_limiter = CredentialRateLimiter()


def enforce_scan_limit(principal: ScanPrincipal) -> None:
    settings = get_settings()
    if principal.kind == "device":
        key = f"device:{principal.member_id or principal.org_id}"
        limit = settings.scan_rate_limit_per_device_per_minute
    else:
        key = f"org:{principal.org_id}"
        limit = settings.scan_rate_limit_per_org_per_minute
    scan_rate_limiter.check(key, limit=limit, window_seconds=60)
