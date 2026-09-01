from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260605_0002"
down_revision = "20260521_0001"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None

def upgrade() -> None:
    op.add_column("scan_events", sa.Column("client_event_id", sa.Text(), nullable=True))
    op.create_unique_constraint(
        "uq_scan_events_org_client_event",
        "scan_events",
        ["org_id", "client_event_id"],
    )

def downgrade() -> None:
    op.drop_constraint("uq_scan_events_org_client_event", "scan_events", type_="unique")
    op.drop_column("scan_events", "client_event_id")
