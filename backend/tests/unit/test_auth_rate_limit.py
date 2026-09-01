# pyright: reportPrivateUsage=false

from __future__ import annotations

import pytest
from starlette.requests import Request

from blade_backend.auth.rate_limit import LoginRateLimiter


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/api/v1/auth/login",
            "query_string": b"",
            "headers": [],
            "client": ("203.0.113.10", 4444),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


@pytest.mark.unit
async def test_login_rate_limiter_blocks_after_minute_limit() -> None:
    limiter = LoginRateLimiter()
    limiter._redis_checked = True

    results = [await limiter.check(_request(), "person@example.com") for _ in range(6)]

    assert [result.allowed for result in results[:5]] == [True, True, True, True, True]
    assert results[5].allowed is False
    assert results[5].retry_after_seconds > 0


@pytest.mark.unit
async def test_login_rate_limiter_keys_by_ip_and_email() -> None:
    limiter = LoginRateLimiter()
    limiter._redis_checked = True

    for _ in range(5):
        assert (await limiter.check(_request(), "person@example.com")).allowed

    assert (await limiter.check(_request(), "other@example.com")).allowed
