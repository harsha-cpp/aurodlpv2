"""Add revocable browser-extension principals.

Revision ID: 20260808_0005
Revises: 20260807_0004
Create Date: 2026-08-08
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260808_0005"
down_revision = "20260807_0004"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.create_table(
        "extension_clients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("token_hash", postgresql.BYTEA(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'active'")),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint(
            "status IN ('active','revoked')",
            name="ck_extension_clients_status",
        ),
    )
    op.create_index("ix_extension_clients_org_id", "extension_clients", ["org_id"])
    op.create_index("ix_extension_clients_created_by", "extension_clients", ["created_by"])
    op.create_index(
        "ix_extension_clients_org_status",
        "extension_clients",
        ["org_id", "status"],
    )


def downgrade() -> None:
    op.drop_index("ix_extension_clients_org_status", table_name="extension_clients")
    op.drop_index("ix_extension_clients_created_by", table_name="extension_clients")
    op.drop_index("ix_extension_clients_org_id", table_name="extension_clients")
    op.drop_table("extension_clients")
