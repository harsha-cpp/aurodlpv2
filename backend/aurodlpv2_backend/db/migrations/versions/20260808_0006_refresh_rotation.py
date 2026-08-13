"""Add refresh-token rotation families and reuse detection.

Revision ID: 20260808_0006
Revises: 20260808_0005
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "20260808_0006"
down_revision: str | None = "20260808_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "refresh_tokens",
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "refresh_tokens",
        sa.Column("rotated_from_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "refresh_tokens",
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.execute("UPDATE refresh_tokens SET family_id = id WHERE family_id IS NULL")
    op.alter_column("refresh_tokens", "family_id", nullable=False)
    op.create_index("ix_refresh_tokens_family_id", "refresh_tokens", ["family_id"])
    op.create_unique_constraint(
        "uq_refresh_tokens_rotated_from_id",
        "refresh_tokens",
        ["rotated_from_id"],
    )
    op.create_foreign_key(
        "fk_refresh_tokens_rotated_from_id",
        "refresh_tokens",
        "refresh_tokens",
        ["rotated_from_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_refresh_tokens_rotated_from_id",
        "refresh_tokens",
        type_="foreignkey",
    )
    op.drop_constraint(
        "uq_refresh_tokens_rotated_from_id",
        "refresh_tokens",
        type_="unique",
    )
    op.drop_index("ix_refresh_tokens_family_id", table_name="refresh_tokens")
    op.drop_column("refresh_tokens", "used_at")
    op.drop_column("refresh_tokens", "rotated_from_id")
    op.drop_column("refresh_tokens", "family_id")
