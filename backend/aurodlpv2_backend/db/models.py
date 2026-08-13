"""Database models for Auro Healthcare DLP.

Schema:
- organizations: tenant root, owns a non-secret routing code
- org_members: humans inside an org (email + argon2 password), role-based
- refresh_tokens: hashed refresh-token rotation per member
- extension_clients: revocable browser-extension principals with hashed secrets
- approved_domains: per-org allow-list (sender/recipient/both)
- scan_events: PHI scan events fired by extension (resolved by org_code)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, BYTEA, JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aurodlpv2_backend.db.base import Base
from aurodlpv2_backend.utils.uuid import uuid7

MemberRole = Literal["owner", "admin", "analyst", "viewer"]
MemberStatus = Literal["active", "invited", "disabled"]
DomainDirection = Literal["sender", "recipient", "both"]
DomainClass = Literal["internal", "partner", "blocked"]
EventAction = Literal["allow", "warn", "block", "quarantine", "escalate"]
EventSeverity = Literal["none", "low", "medium", "high", "critical"]
AttachmentScanStatus = Literal["scanned", "queued", "failed"]
AttachmentScanJobStatus = Literal["pending", "processing", "completed", "failed"]
AttachmentScanJobPhase = Literal["scan", "cleanup"]
QuarantineStatus = Literal["pending", "approved", "rejected"]
ExtensionClientStatus = Literal["active", "revoked"]
# Back-compat alias so legacy imports (auth/jwt.py) still resolve.
UserRole = MemberRole


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    slug: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    org_code: Mapped[str] = mapped_column(Text, nullable=False, unique=True, index=True)
    plan: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'free'"))
    settings: Mapped[dict[str, object]] = mapped_column(
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    members: Mapped[list[OrgMember]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )
    domains: Mapped[list[ApprovedDomain]] = relationship(
        back_populates="organization", cascade="all, delete-orphan"
    )


class OrgMember(Base):
    __tablename__ = "org_members"
    __table_args__ = (
        UniqueConstraint("org_id", "email", name="uq_org_member_email"),
        CheckConstraint("role IN ('owner','admin','analyst','viewer')", name="ck_org_member_role"),
        CheckConstraint("status IN ('active','invited','disabled')", name="ck_org_member_status"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_hash: Mapped[bytes | None] = mapped_column(BYTEA, nullable=True)
    role: Mapped[MemberRole] = mapped_column(Text, nullable=False, server_default=text("'viewer'"))
    status: Mapped[MemberStatus] = mapped_column(
        Text, nullable=False, server_default=text("'active'")
    )
    invite_token: Mapped[str | None] = mapped_column(Text, nullable=True, unique=True)
    invite_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="members")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    member_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    family_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    rotated_from_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("refresh_tokens.id", ondelete="SET NULL"),
        nullable=True,
        unique=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ExtensionClient(Base):
    __tablename__ = "extension_clients"
    __table_args__ = (
        CheckConstraint(
            "status IN ('active','revoked')",
            name="ck_extension_clients_status",
        ),
        Index("ix_extension_clients_org_status", "org_id", "status"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    status: Mapped[ExtensionClientStatus] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'active'"),
    )
    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ApprovedDomain(Base):
    __tablename__ = "approved_domains"
    __table_args__ = (
        UniqueConstraint("org_id", "domain", "direction", name="uq_approved_domain"),
        CheckConstraint("direction IN ('sender','recipient','both')", name="ck_approved_direction"),
        CheckConstraint(
            "classification IN ('internal','partner','blocked')",
            name="ck_approved_classification",
        ),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    domain: Mapped[str] = mapped_column(Text, nullable=False)
    direction: Mapped[DomainDirection] = mapped_column(
        Text, nullable=False, server_default=text("'both'")
    )
    classification: Mapped[DomainClass] = mapped_column(
        Text, nullable=False, server_default=text("'partner'")
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="domains")


class ScanEvent(Base):
    __tablename__ = "scan_events"
    __table_args__ = (
        CheckConstraint(
            "action IN ('allow','warn','block','quarantine','escalate')",
            name="ck_scan_events_action",
        ),
        CheckConstraint(
            "severity IN ('none','low','medium','high','critical')",
            name="ck_scan_events_severity",
        ),
        CheckConstraint("risk_score >= 0 AND risk_score <= 100", name="ck_scan_events_risk_score"),
        UniqueConstraint("org_id", "client_event_id", name="uq_scan_events_org_client_event"),
        Index("ix_scan_events_org_time", "org_id", "event_time"),
        Index("ix_scan_events_org_action_time", "org_id", "action", "event_time"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    client_event_id: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_digest: Mapped[str | None] = mapped_column(Text, nullable=True)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_email: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[EventAction] = mapped_column(Text, nullable=False)
    severity: Mapped[EventSeverity] = mapped_column(Text, nullable=False)
    risk_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("0")
    )
    entities: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    recipients: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]")
    )
    event_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AttachmentScan(Base):
    __tablename__ = "attachment_scans"
    __table_args__ = (
        CheckConstraint(
            "status IN ('scanned','queued','failed')",
            name="ck_attachment_scans_status",
        ),
        CheckConstraint(
            "severity IN ('none','low','medium','high','critical')",
            name="ck_attachment_scans_severity",
        ),
        UniqueConstraint(
            "org_id",
            "client_scan_id",
            "attachment_id",
            name="uq_attachment_scans_org_client_attachment",
        ),
        Index("ix_attachment_scans_org_client", "org_id", "client_scan_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    client_scan_id: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_id: Mapped[str] = mapped_column(Text, nullable=False)
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    mime_type: Mapped[str] = mapped_column(Text, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[AttachmentScanStatus] = mapped_column(Text, nullable=False)
    severity: Mapped[EventSeverity] = mapped_column(
        Text, nullable=False, server_default=text("'none'")
    )
    risk_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("0")
    )
    entities: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    extraction_errors: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]")
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AttachmentScanJob(Base):
    __tablename__ = "attachment_scan_jobs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="ck_attachment_scan_jobs_status",
        ),
        CheckConstraint(
            "phase IN ('scan','cleanup')",
            name="ck_attachment_scan_jobs_phase",
        ),
        Index("ix_attachment_scan_jobs_claim", "status", "available_at", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    attachment_scan_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("attachment_scans.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    status: Mapped[AttachmentScanJobStatus] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'pending'"),
    )
    phase: Mapped[AttachmentScanJobPhase] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'scan'"),
    )
    attempts: Mapped[int] = mapped_column(
        nullable=False,
        server_default=text("0"),
    )
    available_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    locked_by: Mapped[str | None] = mapped_column(Text, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class QuarantineItem(Base):
    __tablename__ = "quarantine_items"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','approved','rejected')",
            name="ck_quarantine_items_status",
        ),
        Index("ix_quarantine_items_org_status_created", "org_id", "status", "created_at"),
        Index("ix_quarantine_items_org_scan", "org_id", "scan_id"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    scan_event_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("scan_events.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    scan_id: Mapped[str] = mapped_column(Text, nullable=False)
    client_scan_id: Mapped[str] = mapped_column(Text, nullable=False)
    content_digest: Mapped[str | None] = mapped_column(Text, nullable=True)
    sender: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("'unknown'"))
    subject: Mapped[str] = mapped_column(Text, nullable=False, server_default=text("''"))
    recipients: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]")
    )
    entities: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    matched_policy_ids: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]")
    )
    risk_score: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, server_default=text("0")
    )
    severity: Mapped[EventSeverity] = mapped_column(Text, nullable=False)
    status: Mapped[QuarantineStatus] = mapped_column(
        Text, nullable=False, server_default=text("'pending'")
    )
    analyst_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    analyst_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    released_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    attachment_refs: Mapped[list[dict[str, object]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )


class AuditEvent(Base):
    __tablename__ = "audit_events"
    __table_args__ = (
        Index("ix_audit_events_org_created", "org_id", "created_at"),
        Index("ix_audit_events_org_category_created", "org_id", "category", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    actor: Mapped[str] = mapped_column(Text, nullable=False)
    category: Mapped[str] = mapped_column(Text, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, object]] = mapped_column(
        "metadata",
        JSONB,
        nullable=False,
        default=dict,
        server_default=text("'{}'::jsonb"),
    )
    previous_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    event_hash: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
