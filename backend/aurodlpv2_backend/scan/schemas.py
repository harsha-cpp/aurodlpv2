"""Scan request / response models.

Verdict shape mirrors what the Chrome extension consumes - see
``docs/plans/backend.md`` §4 and ``docs/plans/frontend.md`` §6.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

Action = Literal["allow", "warn", "block", "quarantine", "escalate"]
Severity = Literal["none", "low", "medium", "high", "critical"]


class EntityHit(BaseModel):
    type: str
    masked_value: str  # never the raw PHI
    confidence: float = Field(ge=0.0, le=1.0)
    source: Literal["body", "subject", "attachment"]
    attachment_id: str | None = None


class RecipientHit(BaseModel):
    email: EmailStr
    classification: Literal[
        "internal",
        "approved_partner",
        "external",
        "public_email",
        "unknown",
    ]


class ScanEmailRequest(BaseModel):
    message_id: str | None = None
    subject: str = ""
    body: str = ""
    recipients: list[EmailStr] = Field(min_length=1)


class ScanFinalizeRequest(BaseModel):
    message_id: str | None = None
    attachment_scan_ids: list[str] = Field(default_factory=list)
    override_quarantine: bool = False


class AttachmentScanResponse(BaseModel):
    scan_id: str
    status: Literal["scanned", "queued"]
    filename: str
    size_bytes: int
    mime_type: str


class Verdict(BaseModel):
    scan_id: str
    action: Action
    severity: Severity
    risk_score: float
    matched_policy_ids: list[str]
    entities: list[EntityHit]
    recipients: list[RecipientHit]
    user_message: str
    created_at: datetime

    @field_validator("risk_score")
    @classmethod
    def round_score(cls, value: float) -> float:
        return round(value, 2)


class ScanStatusResponse(BaseModel):
    scan_id: str
    status: Literal["pending", "scanning", "completed", "failed"]
    verdict: Verdict | None = None
