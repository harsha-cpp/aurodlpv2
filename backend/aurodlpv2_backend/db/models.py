"""Database models for Auro DLP v2.

Schema:
- organizations: tenant root, owns an org_code (extension auth key)
- org_members: humans inside an org (email + argon2 password), role-based
- refresh_tokens: hashed refresh-token rotation per member
- approved_domains: per-org allow-list (sender/recipient/both)
- scan_events: PHI scan events fired by extension (resolved by org_code)
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from sqlalchemy import (
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
        Index("ix_scan_events_org_time", "org_id", "event_time"),
        Index("ix_scan_events_org_action_time", "org_id", "action", "event_time"),
    )

    id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid7)
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
