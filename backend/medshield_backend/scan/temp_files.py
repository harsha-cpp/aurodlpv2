"""Secure temp-file lifecycle for attachments."""

from __future__ import annotations

import asyncio
import hashlib
import importlib
import os
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import aiofiles
from fastapi import UploadFile

from medshield_backend.utils.uuid import uuid7

CHUNK_SIZE = 1024 * 1024


class AttachmentTooLargeError(ValueError):
    pass


class MimeDetectionError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class ReceivedAttachment:
    path: Path
    filename: str
    size_bytes: int
    mime_type: str
    sha256_hex: str


MagicFromFile = Callable[[str, bool], str]


async def receive_attachment(
    upload: UploadFile,
    dest_dir: Path,
    *,
    max_bytes: int,
) -> ReceivedAttachment:
    await asyncio.to_thread(dest_dir.mkdir, 0o700, True, True)
    await asyncio.to_thread(os.chmod, dest_dir, 0o700)

    upload_id = uuid7()
    part_path = dest_dir / f"{upload_id}.part"
    final_path = dest_dir / str(upload_id)
    digest = hashlib.sha256()
    size_bytes = 0

    try:
        async with aiofiles.open(part_path, "wb") as output:
            while chunk := await upload.read(CHUNK_SIZE):
                size_bytes += len(chunk)
                if size_bytes > max_bytes:
                    raise AttachmentTooLargeError("attachment exceeds size limit")
                digest.update(chunk)
                await output.write(chunk)

        mime_type = await detect_mime_type(part_path)
        await asyncio.to_thread(os.replace, part_path, final_path)
        return ReceivedAttachment(
            path=final_path,
            filename=upload.filename or "attachment",
            size_bytes=size_bytes,
            mime_type=mime_type,
            sha256_hex=digest.hexdigest(),
        )
    except Exception:
        await asyncio.to_thread(_delete_if_exists, part_path)
        await asyncio.to_thread(_delete_if_exists, final_path)
        raise


async def detect_mime_type(path: Path) -> str:
    return await asyncio.to_thread(_detect_mime_type_sync, path)


async def delete_temp_file(path: Path) -> None:
    await asyncio.to_thread(_delete_if_exists, path)


def _delete_if_exists(path: Path) -> None:
    try:
        path.unlink()
    except FileNotFoundError:
        return


def _detect_mime_type_sync(path: Path) -> str:
    try:
        magic_module = importlib.import_module("magic")
    except ImportError as exc:
        raise MimeDetectionError("libmagic is not available") from exc
    from_file = cast(MagicFromFile, vars(magic_module)["from_file"])
    return from_file(str(path), True)
