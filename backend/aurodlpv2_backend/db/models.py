"""Database models for Auro Healthcare DLP.

Schema:
- organizations: tenant root, owns an org_code (extension auth key)
- org_members: humans inside an org (email + argon2 password), role-based
- refresh_tokens: hashed refresh-token rotation per member
- device_tokens: per-install extension credentials (replacing the shared org_code)
- password_reset_tokens / email_verification_tokens: single-use hashed links
- member_mfa: TOTP enrolment, secret encrypted at rest
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
QuarantineStatus = Literal["pending", "approved", "rejected"]
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
    email_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    organization: Mapped[Organization] = relationship(back_populates="members")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"
    __table_args__ = (Index("ix_refresh_tokens_family", "family_id"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    member_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    #: Every descendant of one login shares this id, so a replayed token can
    #: take down the whole lineage rather than just the stolen link.
    family_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    #: Set when this token was exchanged for a successor. Still usable for the
    #: rotation grace window; after that a presentation means the token leaked.
    rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(Text, nullable=True)
    ip_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class DeviceToken(Base):
    """Per-install credential for the browser extension.

    The shared org_code authenticates every install at once, so rotating it
    after one laptop is lost breaks every other install in the hospital.
    """

    __tablename__ = "device_tokens"
    __table_args__ = (Index("ix_device_tokens_org_created", "org_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    member_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="SET NULL"),
        nullable=True,
    )
    #: Denormalised so a revoked member's device still reports who it scanned
    #: as; scan events are evidence and must survive the FK going NULL.
    member_email: Mapped[str | None] = mapped_column(Text, nullable=True)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    last_seen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    member_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    #: Single use: a reset link sitting in a mailbox must not work twice.
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class EmailVerificationToken(Base):
    __tablename__ = "email_verification_tokens"

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True)
    member_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class MemberMfa(Base):
    __tablename__ = "member_mfa"
    __table_args__ = (UniqueConstraint("member_id", name="uq_member_mfa_member"),)

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
    member_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("org_members.id", ondelete="CASCADE"),
        nullable=False,
    )
    #: AES-GCM ciphertext, never the raw base32 seed — a DB dump would
    #: otherwise let the reader mint valid codes for every enrolled member.
    secret_encrypted: Mapped[bytes] = mapped_column(BYTEA, nullable=False)
    #: NULL until the member proves they can generate a code, so a half-finished
    #: enrolment cannot lock anyone out.
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    backup_codes: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, default=list, server_default=text("'{}'::text[]")
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
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
    org_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("organizations.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Null when the sender could not be attributed. The extension used to
    # send the literal 'unknown', which became a user in the analytics.
    user_email: Mapped[str | None] = mapped_column(Text, nullable=True)
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
