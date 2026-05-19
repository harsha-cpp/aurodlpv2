"""phase 0 baseline

Revision ID: 20260518_1700
Revises:
Create Date: 2026-05-18 17:00:00.000000
"""

from __future__ import annotations

from alembic import op

revision = "20260518_1700"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")
