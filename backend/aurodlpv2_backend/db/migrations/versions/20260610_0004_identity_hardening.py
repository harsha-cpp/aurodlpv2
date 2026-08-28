"""Per-device enrolment, refresh-token rotation, password reset, MFA.

Revision ID: 20260610_0004
Revises: 20260605_0003
Create Date: 2026-06-10
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260610_0004"
down_revision = "20260605_0003"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column(
        "org_members",
        sa.Column("email_verified_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Members who already signed in predate verification; treating them as
    # unverified would lock working accounts out on deploy.
    op.execute("UPDATE org_members SET email_verified_at = created_at WHERE status = 'active'")

    op.add_column(
        "refresh_tokens",
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # Existing sessions each become their own family root.
    op.execute("UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.add_column(
        "refresh_tokens", sa.Column("rotated_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column(
        "refresh_tokens", sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column("refresh_tokens", sa.Column("user_agent", sa.Text(), nullable=True))
    op.add_column("refresh_tokens", sa.Column("ip_address", sa.Text(), nullable=True))
    op.create_index("ix_refresh_tokens_family", "refresh_tokens", ["family_id"])

    op.create_table(
        "device_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("member_email", sa.Text(), nullable=True),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("token_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_device_tokens_org_id", "device_tokens", ["org_id"])
    op.create_index("ix_device_tokens_org_created", "device_tokens", ["org_id", "created_at"])

    op.create_table(
        "password_reset_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_password_reset_tokens_member_id", "password_reset_tokens", ["member_id"])

    op.create_table(
        "email_verification_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index(
        "ix_email_verification_tokens_member_id",
        "email_verification_tokens",
        ["member_id"],
    )

    op.create_table(
        "member_mfa",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "member_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("secret_encrypted", postgresql.BYTEA(), nullable=False),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "backup_codes",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint("member_id", name="uq_member_mfa_member"),
    )


def downgrade() -> None:
    op.drop_table("member_mfa")
    op.drop_index("ix_email_verification_tokens_member_id", table_name="email_verification_tokens")
    op.drop_table("email_verification_tokens")
    op.drop_index("ix_password_reset_tokens_member_id", table_name="password_reset_tokens")
    op.drop_table("password_reset_tokens")
    op.drop_index("ix_device_tokens_org_created", table_name="device_tokens")
    op.drop_index("ix_device_tokens_org_id", table_name="device_tokens")
    op.drop_table("device_tokens")
    op.drop_index("ix_refresh_tokens_family", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "ip_address")
    op.drop_column("refresh_tokens", "user_agent")
    op.drop_column("refresh_tokens", "last_used_at")
    op.drop_column("refresh_tokens", "rotated_at")
    op.drop_column("refresh_tokens", "family_id")
    op.drop_column("org_members", "email_verified_at")
