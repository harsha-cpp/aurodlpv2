from __future__ import annotations

import os
import shutil
from abc import ABC, abstractmethod
from importlib import import_module
from pathlib import Path
from typing import Any, cast
from uuid import uuid4

import structlog

from blade_backend.settings import Settings, get_settings

logger = structlog.get_logger(__name__)


class BlobNotFoundError(KeyError):
    pass


class BlobStore(ABC):
    @abstractmethod
    def put(self, data: bytes, *, suffix: str = "") -> str:
        pass

    @abstractmethod
    def get(self, key: str) -> bytes:
        pass

    @abstractmethod
    def delete(self, key: str) -> None:
        pass


class LocalBlobStore(BlobStore):
    def __init__(self, root: Path) -> None:
        self._root = root
        self._root.mkdir(parents=True, exist_ok=True)
        os.chmod(self._root, 0o700)

    def put(self, data: bytes, *, suffix: str = "") -> str:
        key = f"{uuid4().hex}{suffix[:20]}"
        path = self._path(key)
        path.write_bytes(data)
        os.chmod(path, 0o600)
        return key

    def get(self, key: str) -> bytes:
        try:
            return self._path(key).read_bytes()
        except OSError as exc:
            raise BlobNotFoundError(key) from exc

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def _path(self, key: str) -> Path:
        candidate = (self._root / Path(key).name).resolve()
        if not candidate.is_relative_to(self._root.resolve()):
            raise BlobNotFoundError(key)
        return candidate


class S3BlobStore(BlobStore):
    def __init__(self, settings: Settings) -> None:
        boto3 = cast(Any, import_module("boto3"))

        self._bucket = settings.s3_bucket
        self._prefix = settings.s3_prefix.strip("/")
        client_kwargs: dict[str, Any] = {"region_name": settings.s3_region}
        if settings.s3_endpoint_url:
            client_kwargs["endpoint_url"] = settings.s3_endpoint_url
        if settings.s3_access_key_id and settings.s3_secret_access_key:
            client_kwargs["aws_access_key_id"] = settings.s3_access_key_id
            client_kwargs["aws_secret_access_key"] = (
                settings.s3_secret_access_key.get_secret_value()
            )
        self._client = boto3.client("s3", **client_kwargs)
        self._sse = settings.s3_server_side_encryption

    def put(self, data: bytes, *, suffix: str = "") -> str:
        key = f"{self._prefix}/{uuid4().hex}{suffix[:20]}" if self._prefix else uuid4().hex
        extra: dict[str, Any] = {}
        if self._sse:
            extra["ServerSideEncryption"] = self._sse
        self._client.put_object(Bucket=self._bucket, Key=key, Body=data, **extra)
        return key

    def get(self, key: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
            return cast(bytes, response["Body"].read())  # noqa: RUF100
        except Exception as exc:
            raise BlobNotFoundError(key) from exc

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception:
            logger.warning("blob delete failed", key=key)


def build_store(settings: Settings | None = None) -> BlobStore:
    resolved = settings or get_settings()
    if resolved.storage_backend == "s3":
        return S3BlobStore(resolved)
    return LocalBlobStore(resolved.quarantine_storage_dir)


_store: BlobStore | None = None


def get_store() -> BlobStore:
    global _store  # noqa: PLW0603 - process-wide singleton by design
    if _store is None:
        _store = build_store()
    return _store


def reset_store() -> None:
    global _store  # noqa: PLW0603
    _store = None


def purge_local_dir(path: Path) -> None:
    shutil.rmtree(path, ignore_errors=True)
