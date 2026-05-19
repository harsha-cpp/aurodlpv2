"""structlog JSON logging."""

from __future__ import annotations

import logging
from collections.abc import MutableMapping
from typing import cast

import structlog

from aurodlpv2_backend.settings import get_settings

SENSITIVE_KEYS = frozenset(
    {
        "access_token",
        "authorization",
        "body",
        "id_token",
        "jwt",
        "raw",
        "raw_value",
        "refresh_token",
        "secret",
        "subject",
        "token",
    }
)


def scrub_log_event(
    _logger: object,
    _method_name: str,
    event_dict: MutableMapping[str, object],
) -> MutableMapping[str, object]:
    return _scrub_mapping(event_dict)


def _scrub_mapping(value: MutableMapping[str, object]) -> MutableMapping[str, object]:
    for key, item in list(value.items()):
        normalized_key = key.lower()
        if normalized_key in SENSITIVE_KEYS or normalized_key.endswith("_secret"):
            value[key] = "[redacted]"
        elif isinstance(item, MutableMapping):
            value[key] = _scrub_mapping(cast(MutableMapping[str, object], item))
        elif isinstance(item, list):
            list_items = cast(list[object], item)
            value[key] = [_scrub_list_item(list_item) for list_item in list_items]
    return value


def _scrub_list_item(value: object) -> object:
    if isinstance(value, MutableMapping):
        return _scrub_mapping(cast(MutableMapping[str, object], value))
    if isinstance(value, list):
        list_items = cast(list[object], value)
        return [_scrub_list_item(item) for item in list_items]
    return value


def configure_logging() -> None:
    settings = get_settings()
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(level=level, format="%(message)s")

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            scrub_log_event,
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer()
            if settings.log_format == "json"
            else structlog.dev.ConsoleRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        cache_logger_on_first_use=True,
    )
