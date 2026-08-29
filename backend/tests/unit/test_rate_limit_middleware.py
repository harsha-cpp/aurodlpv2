# pyright: reportPrivateUsage=false

from __future__ import annotations

import pytest
from starlette.requests import Request

from aurodlpv2_backend.observability import security as security_module
from aurodlpv2_backend.observability.security import RateLimitMiddleware, resolve_client_ip
from aurodlpv2_backend.settings import Settings


def _request(
    path: str = "/api/v1/orgs/current",
    *,
    headers: list[tuple[bytes, bytes]] | None = None,
    client: str = "203.0.113.10",
) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": path,
            "query_string": b"",
            "headers": headers or [],
            "client": (client, 4444),
            "server": ("testserver", 80),
            "scheme": "http",
        }
    )


async def _noop(_scope: object, _receive: object, _send: object) -> None:
    return None


def _middleware(**overrides: object) -> RateLimitMiddleware:
    middleware = RateLimitMiddleware(_noop, **overrides)  # type: ignore[arg-type]
    middleware._redis_checked = True
    return middleware


@pytest.mark.unit
def test_client_ip_falls_back_to_socket_when_no_proxies_are_trusted() -> None:
    request = _request(headers=[(b"x-forwarded-for", b"198.51.100.7, 10.0.0.1")])

    assert resolve_client_ip(request, 0) == "203.0.113.10"


@pytest.mark.unit
def test_client_ip_reads_the_nth_entry_from_the_right() -> None:
    request = _request(headers=[(b"x-forwarded-for", b"198.51.100.7, 10.0.0.1, 10.0.0.2")])

    assert resolve_client_ip(request, 1) == "10.0.0.2"
    assert resolve_client_ip(request, 2) == "10.0.0.1"


@pytest.mark.unit
def test_spoofed_short_forwarded_header_cannot_pick_the_client_ip() -> None:
    request = _request(headers=[(b"x-forwarded-for", b"1.2.3.4")])

    assert resolve_client_ip(request, 2) == "203.0.113.10"


@pytest.mark.unit
def test_missing_forwarded_header_falls_back() -> None:
    assert resolve_client_ip(_request(), 2) == "203.0.113.10"


@pytest.mark.unit
async def test_limit_is_enforced_per_key() -> None:
    middleware = _middleware(limit=3)

    allowed = [not await middleware._over_limit("ip:1.2.3.4") for _ in range(4)]

    assert allowed == [True, True, True, False]
    assert await middleware._over_limit("ip:5.6.7.8") is False


@pytest.mark.unit
def test_scan_and_events_are_exempt_by_default() -> None:
    middleware = _middleware()

    assert middleware._is_exempt("/api/v1/scan/text") is True
    assert middleware._is_exempt("/api/v1/events") is True
    assert middleware._is_exempt("/api/v1/orgs/current") is False


@pytest.mark.unit
async def test_memory_buckets_are_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    bounded = Settings(api_rate_limit_max_keys=100)
    monkeypatch.setattr(security_module, "get_settings", lambda: bounded)
    middleware = _middleware(limit=5)

    for index in range(500):
        await middleware._over_limit(f"ip:10.0.0.{index}")

    assert len(middleware._buckets) <= 100


@pytest.mark.unit
def test_authenticated_and_device_callers_key_separately() -> None:
    middleware = _middleware()

    bearer = middleware._key(_request(headers=[(b"authorization", b"Bearer abc")]))
    device = middleware._key(_request(headers=[(b"x-auro-device-token", b"aurodev_x.y")]))
    anonymous = middleware._key(_request())

    assert bearer.startswith("auth:")
    assert device.startswith("device:")
    assert anonymous == "ip:203.0.113.10"
