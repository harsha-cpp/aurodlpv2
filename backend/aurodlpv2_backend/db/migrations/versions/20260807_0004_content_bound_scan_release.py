"""Bind scan decisions and quarantine releases to message content.

Revision ID: 20260807_0004
Revises: 20260605_0003
Create Date: 2026-08-07
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260807_0004"
down_revision = "20260605_0003"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None


def upgrade() -> None:
    op.add_column("scan_events", sa.Column("content_digest", sa.Text(), nullable=True))
    op.add_column("quarantine_items", sa.Column("content_digest", sa.Text(), nullable=True))
    op.add_column(
        "quarantine_items",
        sa.Column("released_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("quarantine_items", "released_at")
    op.drop_column("quarantine_items", "content_digest")
    op.drop_column("scan_events", "content_digest")
