"""Add durable attachment objects and PostgreSQL scan jobs.

Revision ID: 20260808_0007
Revises: 20260808_0006
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260808_0007"
down_revision: str | None = "20260808_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "attachment_scans",
        sa.Column("storage_key", sa.Text(), nullable=True),
    )
    op.create_table(
        "attachment_scan_jobs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("attachment_scan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.Text(), server_default=sa.text("'pending'"), nullable=False),
        sa.Column("phase", sa.Text(), server_default=sa.text("'scan'"), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "available_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("locked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("locked_by", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('pending','processing','completed','failed')",
            name="ck_attachment_scan_jobs_status",
        ),
        sa.CheckConstraint(
            "phase IN ('scan','cleanup')",
            name="ck_attachment_scan_jobs_phase",
        ),
        sa.ForeignKeyConstraint(
            ["attachment_scan_id"],
            ["attachment_scans.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "attachment_scan_id",
            name="uq_attachment_scan_jobs_attachment_scan_id",
        ),
    )
    op.create_index(
        "ix_attachment_scan_jobs_attachment_scan_id",
        "attachment_scan_jobs",
        ["attachment_scan_id"],
    )
    op.create_index(
        "ix_attachment_scan_jobs_claim",
        "attachment_scan_jobs",
        ["status", "available_at", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_attachment_scan_jobs_claim", table_name="attachment_scan_jobs")
    op.drop_index(
        "ix_attachment_scan_jobs_attachment_scan_id",
        table_name="attachment_scan_jobs",
    )
    op.drop_table("attachment_scan_jobs")
    op.drop_column("attachment_scans", "storage_key")
