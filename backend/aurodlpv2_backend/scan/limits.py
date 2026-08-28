"""Per-credential rate limits for the scan and event endpoints.

These paths are exempt from the global middleware for a good reason: it keys on
IP, and an entire hospital shares one NAT egress address, so a shared bucket
throttled the whole staff at once. Exempting them without replacing the limit
would leave unauthenticated endpoints wide open, so the budget moves to the
credential — a device token or an org code — where it belongs.

A device is one person's install: its ceiling is generous enough that no doctor
will ever see it and low enough that a stolen token cannot be used to grind
through the API. The org-code bucket is deliberately per-org rather than
per-user, because an org code names nobody; that asymmetry is another reason to
finish enrolling devices.
"""

from __future__ import annotations

import time
from collections import OrderedDict
from dataclasses import dataclass

from fastapi import HTTPException, status

from aurodlpv2_backend.scan.credentials import ScanPrincipal
from aurodlpv2_backend.settings import get_settings

#: Keep the in-memory fallback bounded: an unbounded dict keyed by credential is
#: a memory-growth vector on an endpoint that takes untrusted input.
MAX_TRACKED_KEYS = 20_000


@dataclass(slots=True)
class _Window:
    started_at: float
    count: int


class CredentialRateLimiter:
    """Fixed-window limiter keyed by scan credential."""

    def __init__(self) -> None:
        self._windows: OrderedDict[str, _Window] = OrderedDict()

    def check(self, key: str, *, limit: int, window_seconds: int) -> int:
        """Return the remaining allowance, or raise 429."""
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
        """How many credentials are being tracked. Bounded by design."""
        return len(self._windows)

    def reset(self) -> None:
        self._windows.clear()


scan_rate_limiter = CredentialRateLimiter()


def enforce_scan_limit(principal: ScanPrincipal) -> None:
    """Apply the per-credential scan budget."""
    settings = get_settings()
    if principal.kind == "device":
        key = f"device:{principal.member_id or principal.org_id}"
        limit = settings.scan_rate_limit_per_device_per_minute
    else:
        # No identity behind an org code, so the whole organisation shares one
        # bucket. Sized for a hospital, not for one person.
        key = f"org:{principal.org_id}"
        limit = settings.scan_rate_limit_per_org_per_minute
    scan_rate_limiter.check(key, limit=limit, window_seconds=60)
