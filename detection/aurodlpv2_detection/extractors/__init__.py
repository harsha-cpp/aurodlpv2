"""File text extraction.

The dispatcher chooses a backend by sniffed MIME type, falling back to the
declared type and then the filename extension — a renamed file is not a reason
to skip scanning it.

    application/pdf                 -> pdf.py    (PyMuPDF, OCR fallback)
    .docx                           -> docx.py   (body, tables, headers, boxes)
    .xlsx / .xls                    -> xlsx.py   (openpyxl / xlrd)
    .pptx                           -> pptx.py   (slides + speaker notes)
    text/*, .csv, .log, .json       -> text.py
    .rtf                            -> text.py   (striprtf)
    message/rfc822, .eml            -> email     (recursive, stdlib)
    application/zip, .zip           -> archive   (depth and size capped)
    image/*                         -> image.py  (-> OCR)
"""

from __future__ import annotations

import zipfile
from dataclasses import dataclass
from email import message_from_bytes
from email.policy import default as default_email_policy
from importlib import import_module
from io import BytesIO
from pathlib import Path
from typing import Protocol, cast

import structlog
from PIL import Image

from aurodlpv2_detection.extractors import docx, image, pdf, pptx, text, xlsx
from aurodlpv2_detection.models import Attachment

logger = structlog.get_logger(__name__)

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
XLS_MIME = "application/vnd.ms-excel"

MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
#: Guards against zip bombs: total bytes read out of one archive.
MAX_ARCHIVE_UNPACKED_BYTES = 64 * 1024 * 1024
MAX_ARCHIVE_MEMBERS = 50
MAX_EMBEDDED_DEPTH = 2

_EXTENSION_KINDS: dict[str, str] = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".xlsm": "xlsx",
    ".xls": "xlsx",
    ".pptx": "pptx",
    ".csv": "text",
    ".tsv": "text",
    ".txt": "text",
    ".log": "text",
    ".json": "text",
    ".md": "text",
    ".rtf": "rtf",
    ".eml": "email",
    ".zip": "archive",
    ".png": "image",
    ".jpg": "image",
    ".jpeg": "image",
    ".tif": "image",
    ".tiff": "image",
    ".bmp": "image",
    ".webp": "image",
    ".gif": "image",
}


class _MagicModule(Protocol):
    def from_buffer(self, buffer: bytes, *, mime: bool) -> str: ...


@dataclass(frozen=True)
class ExtractionResult:
    text: str
    ocr_images: list[Image.Image]
    errors: list[str]


def extract_attachment(attachment: Attachment) -> ExtractionResult:
    if attachment.local_path is None:
        return ExtractionResult("", [], [f"{attachment.id}: missing local path"])

    path = Path(attachment.local_path)
    try:
        if path.stat().st_size > MAX_ATTACHMENT_BYTES:
            return ExtractionResult("", [], [f"{attachment.id}: attachment too large"])
        data = path.read_bytes()
    except OSError:
        logger.warning("attachment read failed", attachment_id=attachment.id)
        return ExtractionResult("", [], [f"{attachment.id}: read failed"])

    return extract_bytes(data, attachment.filename, attachment.mime_type, attachment.id)


def extract_bytes(
    data: bytes,
    filename: str,
    declared_mime: str,
    attachment_id: str,
    *,
    depth: int = 0,
) -> ExtractionResult:
    kind = _classify(data, filename, declared_mime)
    if kind is None:
        logger.warning(
            "unsupported attachment type",
            attachment_id=attachment_id,
            filename=filename,
            mime_type=declared_mime,
        )
        return ExtractionResult("", [], [f"{attachment_id}: unsupported file type"])

    try:
        return _extract_kind(kind, data, filename, attachment_id, depth)
    except Exception:
        logger.warning("attachment extraction failed", attachment_id=attachment_id, kind=kind)
        return ExtractionResult("", [], [f"{attachment_id}: extraction failed"])


def _extract_kind(
    kind: str,
    data: bytes,
    filename: str,
    attachment_id: str,
    depth: int,
) -> ExtractionResult:
    if kind == "pdf":
        pages = pdf.extract_pages(data)
        return ExtractionResult(
            text="\n".join(page.text for page in pages if page.text),
            ocr_images=[page.ocr_image for page in pages if page.ocr_image is not None],
            errors=[],
        )
    if kind == "docx":
        content = docx.extract(data)
        return ExtractionResult(content.text, content.images, [])
    if kind == "xlsx":
        return ExtractionResult(xlsx.extract_text(data), [], [])
    if kind == "pptx":
        return ExtractionResult(pptx.extract_text(data), [], [])
    if kind == "text":
        return ExtractionResult(text.extract_text(data, filename=filename), [], [])
    if kind == "rtf":
        return ExtractionResult(text.extract_rtf(data), [], [])
    if kind == "image":
        opened = image.open_image(data)
        return ExtractionResult("", [opened] if opened is not None else [], [])
    if kind == "email":
        return _extract_email(data, attachment_id, depth)
    if kind == "archive":
        return _extract_archive(data, attachment_id, depth)
    return ExtractionResult("", [], [f"{attachment_id}: unsupported file type"])


#: Magic-byte signatures. libmagic is not always present (and is not present
#: on a stock macOS dev box), and a renamed attachment must not skip the scan,
#: so content signatures are checked first and independently.
_SIGNATURES: tuple[tuple[bytes, str], ...] = (
    (b"%PDF", "pdf"),
    (b"\x89PNG\r\n\x1a\n", "image"),
    (b"\xff\xd8\xff", "image"),
    (b"GIF87a", "image"),
    (b"GIF89a", "image"),
    (b"BM", "image"),
    (b"II*\x00", "image"),
    (b"MM\x00*", "image"),
    (b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1", "xlsx"),  # OLE2: legacy .xls/.doc
    (b"{\\rtf", "rtf"),
)

_ZIP_MEMBER_KINDS: tuple[tuple[str, str], ...] = (
    ("word/", "docx"),
    ("xl/", "xlsx"),
    ("ppt/", "pptx"),
)


def _sniff_signature(data: bytes) -> str | None:
    for prefix, kind in _SIGNATURES:
        if data.startswith(prefix):
            return kind
    if data.startswith(b"PK\x03\x04"):
        return _zip_kind(data)
    return None


def _zip_kind(data: bytes) -> str:
    """Office formats are zips; look inside to tell them apart."""
    try:
        with zipfile.ZipFile(BytesIO(data)) as archive:
            names = archive.namelist()
        for prefix, kind in _ZIP_MEMBER_KINDS:
            if any(name.startswith(prefix) for name in names):
                return kind
    except Exception:
        return "archive"
    return "archive"


def _looks_like_text(data: bytes) -> bool:
    sample = data[:4096]
    if not sample:
        return False
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError:
        return False
    printable = sum(1 for byte in sample if byte >= 32 or byte in (9, 10, 13))
    return printable / len(sample) > 0.95


def _classify(data: bytes, filename: str, declared_mime: str) -> str | None:
    signature = _sniff_signature(data)
    if signature is not None:
        if signature == "archive":
            by_extension = _EXTENSION_KINDS.get(Path(filename).suffix.lower())
            return by_extension if by_extension is not None else "archive"
        return signature

    sniffed = _detect_mime(data, declared_mime)
    for mime in (sniffed, declared_mime.lower()):
        kind = _kind_from_mime(mime)
        if kind is not None:
            # A generic zip signature is how every Office file sniffs, so let
            # the extension disambiguate before settling for "archive".
            if kind == "archive":
                by_extension = _EXTENSION_KINDS.get(Path(filename).suffix.lower())
                if by_extension is not None:
                    return by_extension
            return kind
    by_extension = _EXTENSION_KINDS.get(Path(filename).suffix.lower())
    if by_extension is not None:
        return by_extension
    # A renamed text file is still a text file.
    return "text" if _looks_like_text(data) else None


def _kind_from_mime(mime: str) -> str | None:
    normalized = mime.split(";")[0].strip().lower()
    if not normalized:
        return None
    if normalized == "application/pdf":
        return "pdf"
    if normalized == DOCX_MIME:
        return "docx"
    if normalized in {XLSX_MIME, XLS_MIME}:
        return "xlsx"
    if normalized == PPTX_MIME:
        return "pptx"
    if normalized in {"application/rtf", "text/rtf"}:
        return "rtf"
    if normalized in {"message/rfc822", "application/vnd.ms-outlook"}:
        return "email"
    if normalized in {"application/zip", "application/x-zip-compressed"}:
        return "archive"
    if normalized.startswith("image/"):
        return "image"
    if normalized.startswith("text/") or normalized in {
        "application/json",
        "application/csv",
    }:
        return "text"
    return None


def _detect_mime(data: bytes, fallback: str) -> str:
    try:
        magic = cast(_MagicModule, import_module("magic"))
        return magic.from_buffer(data[:4096], mime=True) or fallback
    except Exception:
        return fallback


def _extract_email(data: bytes, attachment_id: str, depth: int) -> ExtractionResult:
    """A forwarded .eml carries its own body and attachments."""
    if depth >= MAX_EMBEDDED_DEPTH:
        return ExtractionResult("", [], [f"{attachment_id}: embedded depth limit"])

    message = message_from_bytes(data, policy=default_email_policy)
    chunks: list[str] = []
    images: list[Image.Image] = []
    errors: list[str] = []

    for header in ("subject", "from", "to", "cc"):
        value = message.get(header)
        if value:
            chunks.append(f"{header}: {value}")

    for part in message.walk():
        if part.is_multipart():
            continue
        payload = part.get_payload(decode=True)
        if not isinstance(payload, bytes):
            continue
        content_type = part.get_content_type()
        filename = part.get_filename() or ""
        if content_type in {"text/plain", "text/html"} and not filename:
            chunks.append(text.decode(payload))
            continue
        nested = extract_bytes(
            payload,
            filename,
            content_type,
            f"{attachment_id}:{filename or content_type}",
            depth=depth + 1,
        )
        if nested.text:
            chunks.append(nested.text)
        images.extend(nested.ocr_images)
        errors.extend(nested.errors)

    return ExtractionResult("\n".join(chunks), images, errors)


def _extract_archive(data: bytes, attachment_id: str, depth: int) -> ExtractionResult:
    """Zip members, with member count, size and depth caps against zip bombs."""
    if depth >= MAX_EMBEDDED_DEPTH:
        return ExtractionResult("", [], [f"{attachment_id}: embedded depth limit"])

    chunks: list[str] = []
    images: list[Image.Image] = []
    errors: list[str] = []
    unpacked = 0

    with zipfile.ZipFile(BytesIO(data)) as archive:
        for info in archive.infolist()[:MAX_ARCHIVE_MEMBERS]:
            if info.is_dir():
                continue
            if unpacked + info.file_size > MAX_ARCHIVE_UNPACKED_BYTES:
                errors.append(f"{attachment_id}: archive unpack limit reached")
                break
            try:
                member = archive.read(info)
            except Exception:
                errors.append(f"{attachment_id}: could not read {info.filename}")
                continue
            unpacked += len(member)
            nested = extract_bytes(
                member,
                info.filename,
                "application/octet-stream",
                f"{attachment_id}:{info.filename}",
                depth=depth + 1,
            )
            if nested.text:
                chunks.append(nested.text)
            images.extend(nested.ocr_images)
            errors.extend(nested.errors)

    return ExtractionResult("\n".join(chunks), images, errors)
