"""S3-compatible storage with short retention for transient scan inputs."""

# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false

from __future__ import annotations

from contextlib import suppress
from functools import lru_cache
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

import boto3
from botocore.client import BaseClient

from aurodlpv2_backend.settings import Settings, get_settings


class ObjectStorageError(RuntimeError):
    """Raised when private attachment storage is unavailable."""


class ObjectStore(Protocol):
    def ensure_bucket(self) -> None: ...

    def check(self) -> None: ...

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None: ...

    def download_to(self, key: str, target: Path) -> None: ...

    def delete(self, key: str) -> None: ...


class S3ObjectStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._bucket = settings.object_storage_bucket
        self._client = cast(
            BaseClient,
            boto3.client(
                "s3",
                endpoint_url=settings.object_storage_endpoint_url,
                aws_access_key_id=settings.object_storage_access_key_value,
                aws_secret_access_key=settings.object_storage_secret_key_value,
                region_name=settings.object_storage_region,
            ),
        )

    def ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except Exception:
            try:
                self._client.create_bucket(Bucket=self._bucket)
            except Exception as exc:
                raise ObjectStorageError("unable to create private attachment bucket") from exc

        with suppress(Exception):
            self._client.put_public_access_block(
                Bucket=self._bucket,
                PublicAccessBlockConfiguration={
                    "BlockPublicAcls": True,
                    "IgnorePublicAcls": True,
                    "BlockPublicPolicy": True,
                    "RestrictPublicBuckets": True,
                },
            )

        try:
            self._client.put_bucket_lifecycle_configuration(
                Bucket=self._bucket,
                LifecycleConfiguration={
                    "Rules": [
                        {
                            "ID": "expire-transient-scan-inputs",
                            "Status": "Enabled",
                            "Filter": {"Prefix": "attachments/"},
                            "Expiration": {
                                "Days": self._settings.object_storage_retention_days,
                            },
                        }
                    ]
                },
            )
        except Exception as exc:
            raise ObjectStorageError("unable to enforce attachment retention") from exc

    def check(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket)
        except Exception as exc:
            raise ObjectStorageError("private attachment bucket unavailable") from exc

    def put_bytes(self, key: str, data: bytes, content_type: str) -> None:
        options: dict[str, object] = {
            "Bucket": self._bucket,
            "Key": key,
            "Body": BytesIO(data),
            "ContentLength": len(data),
            "ContentType": content_type,
            "Metadata": {"data-class": "phi-transient"},
        }
        if self._settings.object_storage_sse == "AES256":
            options["ServerSideEncryption"] = "AES256"
        try:
            self._client.put_object(**options)
        except Exception as exc:
            raise ObjectStorageError("unable to stage attachment") from exc

    def download_to(self, key: str, target: Path) -> None:
        try:
            self._client.download_file(self._bucket, key, str(target))
        except Exception as exc:
            raise ObjectStorageError("unable to retrieve staged attachment") from exc

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except Exception as exc:
            raise ObjectStorageError("unable to delete staged attachment") from exc


@lru_cache(maxsize=1)
def get_object_store() -> ObjectStore:
    return S3ObjectStore(get_settings())
