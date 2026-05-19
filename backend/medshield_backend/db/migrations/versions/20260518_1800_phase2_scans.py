"""phase 2 scans

Revision ID: 20260518_1800
Revises: 20260518_1730
Create Date: 2026-05-18 18:00:00.000000
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "20260518_1800"
down_revision = "20260518_1730"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), server_default=sa.text("uuidv7()"), nullable=False),
        sa.Column("workspace_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("message_id", sa.Text(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("decision", sa.Text(), nullable=True),
        sa.Column("severity", sa.Text(), nullable=True),
        sa.Column("score", sa.Numeric(5, 2), nullable=True),
        sa.Column("matched_policies", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=True),
        sa.Column("entities_summary", postgresql.JSONB(), nullable=True),
        sa.Column("attachments_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("status IN ('pending','scanning','completed','failed')", name="ck_scans_status"),
        sa.CheckConstraint(
            "decision IS NULL OR decision IN ('allow','warn','block','quarantine','escalate')",
            name="ck_scans_decision",
        ),
        sa.CheckConstraint(
            "severity IS NULL OR severity IN ('none','low','medium','high','critical')",
            name="ck_scans_severity",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_scans_ws_created", "scans", ["workspace_id", sa.text("created_at DESC")])
    op.create_index("idx_scans_ws_decision", "scans", ["workspace_id", "decision", sa.text("created_at DESC")])


def downgrade() -> None:
    op.drop_index("idx_scans_ws_decision", table_name="scans")
    op.drop_index("idx_scans_ws_created", table_name="scans")
    op.drop_table("scans")
