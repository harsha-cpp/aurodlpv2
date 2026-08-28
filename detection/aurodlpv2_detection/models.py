"""Data contracts for the detection engine.

See ``docs/plans/detection-engine.md`` §4. Raw PHI never leaves the engine;
only ``masked_value`` is returned.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Severity = Literal["none", "low", "medium", "high", "critical"]
EntitySource = Literal["body", "subject", "attachment"]


class Attachment(BaseModel):
    id: str
    filename: str
    mime_type: str
    size_bytes: int
    sha256: str
    local_path: str | None = None


def empty_recipients() -> list[str]:
    return []


def empty_attachments() -> list[Attachment]:
    return []


class EmailPayload(BaseModel):
    subject: str = ""
    body: str = ""
    recipients: list[str] = Field(default_factory=empty_recipients)
    attachments: list[Attachment] = Field(default_factory=empty_attachments)


class Entity(BaseModel):
    type: str
    masked_value: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: EntitySource
    attachment_id: str | None = None
    start: int | None = None
    end: int | None = None


class ScanResult(BaseModel):
    entities: list[Entity]
    severity: Severity
    risk_score: float
    duration_ms: int
    ocr_pages: int = 0
    extraction_errors: list[str] = Field(default_factory=list)
    completed_at: datetime
