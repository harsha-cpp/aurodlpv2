# pyright: reportUnknownMemberType=false

from __future__ import annotations

from celery import Celery

from blade_backend.settings import get_settings

settings = get_settings()

celery_app = Celery(
    "blade",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["blade_backend.tasks.scan_tasks"],
)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
