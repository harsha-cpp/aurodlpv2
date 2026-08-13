# pyright: reportPrivateUsage=false

from __future__ import annotations

from types import SimpleNamespace
from typing import cast
from uuid import uuid4

import pytest

from aurodlpv2_backend.storage.objects import ObjectStore
from aurodlpv2_backend.tasks import scan_worker
from aurodlpv2_backend.tasks.scan_worker import ClaimedJob, _job_is_owned


class _Store:
    def __init__(self, *, fail_delete: bool = False) -> None:
        self.fail_delete = fail_delete
        self.deleted: list[str] = []

    def ensure_bucket(self) -> None:
        return None

    def check(self) -> None:
        return None

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        return None

    def download_to(self, key: str, target: object) -> None:
        return None

    def delete(self, key: str) -> None:
        if self.fail_delete:
            raise RuntimeError("storage unavailable")
        self.deleted.append(key)


def _claimed(*, phase: str = "scan") -> ClaimedJob:
    return ClaimedJob(
        job_id=uuid4(),
        attachment_scan_id=uuid4(),
        attempt=1,
        phase=phase,
        worker_id="worker-a",
        storage_key="attachments/org/scan/digest",
        attachment_id="attachment-1",
        filename="record.pdf",
        mime_type="application/pdf",
        size_bytes=42,
        sha256="a" * 64,
    )


@pytest.mark.unit
def test_worker_dispatches_scan_phase(monkeypatch: pytest.MonkeyPatch) -> None:
    claimed = _claimed()
    scans: list[ClaimedJob] = []

    def claim(_worker_id: str) -> ClaimedJob:
        return claimed

    def run_scan(job: ClaimedJob, _store: ObjectStore) -> None:
        scans.append(job)

    monkeypatch.setattr(scan_worker, "_claim_job", claim)
    monkeypatch.setattr(scan_worker, "_run_scan", run_scan)

    assert scan_worker.process_next_job(
        worker_id="worker-a",
        store=cast(ObjectStore, _Store()),
    )
    assert scans == [claimed]


@pytest.mark.unit
def test_worker_cleanup_is_retried_when_object_delete_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    claimed = _claimed(phase="cleanup")
    retries: list[ClaimedJob] = []

    def claim(_worker_id: str) -> ClaimedJob:
        return claimed

    monkeypatch.setattr(scan_worker, "_claim_job", claim)
    monkeypatch.setattr(scan_worker, "_retry_cleanup", retries.append)

    assert scan_worker.process_next_job(
        worker_id="worker-a",
        store=cast(ObjectStore, _Store(fail_delete=True)),
    )
    assert retries == [claimed]


@pytest.mark.unit
def test_worker_cleanup_finalizes_only_after_delete(monkeypatch: pytest.MonkeyPatch) -> None:
    claimed = _claimed(phase="cleanup")
    finalized: list[ClaimedJob] = []
    store = _Store()

    def claim(_worker_id: str) -> ClaimedJob:
        return claimed

    monkeypatch.setattr(scan_worker, "_claim_job", claim)
    monkeypatch.setattr(scan_worker, "_finalize_cleanup", finalized.append)

    assert scan_worker.process_next_job(
        worker_id="worker-a",
        store=cast(ObjectStore, store),
    )
    assert store.deleted == [claimed.storage_key]
    assert finalized == [claimed]


@pytest.mark.unit
def test_worker_fencing_rejects_stale_owner_or_attempt() -> None:
    claimed = _claimed()
    active = SimpleNamespace(status="processing", locked_by="worker-a", attempts=1)
    wrong_owner = SimpleNamespace(status="processing", locked_by="worker-b", attempts=1)
    wrong_attempt = SimpleNamespace(status="processing", locked_by="worker-a", attempts=2)

    assert _job_is_owned(active, claimed)  # type: ignore[arg-type]
    assert not _job_is_owned(wrong_owner, claimed)  # type: ignore[arg-type]
    assert not _job_is_owned(wrong_attempt, claimed)  # type: ignore[arg-type]
