"""Celery application factory.

Topology (see ``docs/plans/backend.md`` §3): ``celery-worker`` (prefork,
concurrency=4) + ``celery-beat``. All long-running detection work is queued
via this app from the FastAPI scan service.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Protocol, TypeVar, cast

from celery import Celery

from aurodlpv2_backend.settings import get_settings

TaskCallable = TypeVar("TaskCallable", bound=Callable[..., object])


class CeleryConfig(Protocol):
    def update(self, *args: object, **kwargs: object) -> None:
        ...


class ConfigurableCelery(Protocol):
    @property
    def conf(self) -> CeleryConfig:
        ...


class TaskCelery(Protocol):
    def task(self, *args: object, **kwargs: object) -> object:
        ...

    def send_task(self, name: str, args: list[object] | None = None) -> object:
        ...


def create_celery() -> Celery:
    settings = get_settings()
    app = Celery(
        "aurodlpv2",
        broker=settings.celery_broker_url,
        backend=settings.celery_result_backend,
        include=[
            "aurodlpv2_backend.celery_tasks.deep_scan",
            "aurodlpv2_backend.celery_tasks.quarantine_expiry",
            "aurodlpv2_backend.celery_tasks.audit_verifier",
        ],
    )
    config = cast(ConfigurableCelery, app).conf
    config.update(
        task_acks_late=True,
        task_reject_on_worker_lost=True,
        worker_prefetch_multiplier=1,
        task_time_limit=300,
        task_soft_time_limit=240,
        broker_connection_retry_on_startup=True,
        beat_schedule={
            "quarantine-expiry": {
                "task": "aurodlpv2.quarantine.expire_pending",
                "schedule": 3600.0,
            },
            "audit-chain-verify": {
                "task": "aurodlpv2.audit.verify_chain",
                "schedule": 86400.0,
            },
        },
    )
    return app


celery_app = create_celery()


def celery_task(
    *,
    name: str,
    bind: bool = False,
    max_retries: int | None = None,
) -> Callable[[TaskCallable], TaskCallable]:
    options: dict[str, object] = {"name": name, "bind": bind}
    if max_retries is not None:
        options["max_retries"] = max_retries

    task_app = cast(TaskCelery, celery_app)
    decorator = task_app.task(**options)
    return cast(Callable[[TaskCallable], TaskCallable], decorator)


def send_celery_task(name: str, args: list[object]) -> None:
    task_app = cast(TaskCelery, celery_app)
    task_app.send_task(name, args=args)
