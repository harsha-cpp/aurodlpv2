"""Phase 0 baseline: orgs, members, refresh tokens, approved domains, scan events.

Revision ID: 20260521_0001
Revises:
Create Date: 2026-05-21
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260521_0001"
down_revision: str | None = None
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("slug", sa.Text(), nullable=False),
        sa.Column("org_code", sa.Text(), nullable=False),
        sa.Column("plan", sa.Text(), nullable=False, server_default=sa.text("'free'")),
        sa.Column(
            "settings",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
        sa.UniqueConstraint("org_code", name="uq_organizations_org_code"),
    )
    op.create_index("ix_organizations_org_code", "organizations", ["org_code"])

    op.create_table(
        "org_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("email", sa.Text(), nullable=False),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("password_hash", postgresql.BYTEA(), nullable=True),
        sa.Column("role", sa.Text(), nullable=False, server_default=sa.text("'viewer'")),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column("invite_token", sa.Text(), nullable=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("org_id", "email", name="uq_org_member_email"),
        sa.UniqueConstraint("invite_token", name="uq_org_member_invite_token"),
        sa.CheckConstraint(
            "role IN ('owner','admin','analyst','viewer')", name="ck_org_member_role"
        ),
        sa.CheckConstraint(
            "status IN ('active','invited','disabled')", name="ck_org_member_status"
        ),
    )
    op.create_index("ix_org_members_org_id", "org_members", ["org_id"])

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_refresh_tokens_member_id", "refresh_tokens", ["member_id"])

    op.create_table(
        "approved_domains",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("domain", sa.Text(), nullable=False),
        sa.Column("direction", sa.Text(), nullable=False, server_default=sa.text("'both'")),
        sa.Column(
            "classification",
            sa.Text(),
            nullable=False,
            server_default=sa.text("'partner'"),
        ),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("org_id", "domain", "direction", name="uq_approved_domain"),
        sa.CheckConstraint(
            "direction IN ('sender','recipient','both')", name="ck_approved_direction"
        ),
        sa.CheckConstraint(
            "classification IN ('internal','partner','blocked')",
            name="ck_approved_classification",
        ),
    )
    op.create_index("ix_approved_domains_org_id", "approved_domains", ["org_id"])

    op.create_table(
        "scan_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_email", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column(
            "risk_score",
            sa.Numeric(5, 2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "entities",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "recipients",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column(
            "event_time",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "action IN ('allow','warn','block','quarantine','escalate')",
            name="ck_scan_events_action",
        ),
        sa.CheckConstraint(
            "severity IN ('none','low','medium','high','critical')",
            name="ck_scan_events_severity",
        ),
        sa.CheckConstraint("risk_score >= 0 AND risk_score <= 100", name="ck_scan_events_risk_score"),
    )
    op.create_index("ix_scan_events_org_id", "scan_events", ["org_id"])
    op.create_index("ix_scan_events_org_time", "scan_events", ["org_id", "event_time"])
    op.create_index(
        "ix_scan_events_org_action_time",
        "scan_events",
        ["org_id", "action", "event_time"],
    )


def downgrade() -> None:
    op.drop_index("ix_scan_events_org_action_time", table_name="scan_events")
    op.drop_index("ix_scan_events_org_time", table_name="scan_events")
    op.drop_index("ix_scan_events_org_id", table_name="scan_events")
    op.drop_table("scan_events")
    op.drop_index("ix_approved_domains_org_id", table_name="approved_domains")
    op.drop_table("approved_domains")
    op.drop_index("ix_refresh_tokens_member_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_org_members_org_id", table_name="org_members")
    op.drop_table("org_members")
    op.drop_index("ix_organizations_org_code", table_name="organizations")
    op.drop_table("organizations")
