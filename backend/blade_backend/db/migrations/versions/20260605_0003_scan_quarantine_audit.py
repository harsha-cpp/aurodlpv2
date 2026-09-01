from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "20260605_0003"
down_revision = "20260605_0002"
branch_labels: tuple[str, ...] | None = None
depends_on: tuple[str, ...] | None = None

def upgrade() -> None:
    op.create_table(
        "attachment_scans",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("client_scan_id", sa.Text(), nullable=False),
        sa.Column("attachment_id", sa.Text(), nullable=False),
        sa.Column("filename", sa.Text(), nullable=False),
        sa.Column("mime_type", sa.Text(), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False, server_default=sa.text("'none'")),
        sa.Column("risk_score", sa.Numeric(5, 2), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "entities",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "extraction_errors",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("storage_path", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "status IN ('scanned','queued','failed')",
            name="ck_attachment_scans_status",
        ),
        sa.CheckConstraint(
            "severity IN ('none','low','medium','high','critical')",
            name="ck_attachment_scans_severity",
        ),
        sa.UniqueConstraint(
            "org_id",
            "client_scan_id",
            "attachment_id",
            name="uq_attachment_scans_org_client_attachment",
        ),
    )
    op.create_index("ix_attachment_scans_org_id", "attachment_scans", ["org_id"])
    op.create_index(
        "ix_attachment_scans_org_client",
        "attachment_scans",
        ["org_id", "client_scan_id"],
    )

    op.create_table(
        "quarantine_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "scan_event_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("scan_events.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("scan_id", sa.Text(), nullable=False),
        sa.Column("client_scan_id", sa.Text(), nullable=False),
        sa.Column("sender", sa.Text(), nullable=False, server_default=sa.text("'unknown'")),
        sa.Column("subject", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "recipients",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column(
            "entities",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "matched_policy_ids",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
        sa.Column("risk_score", sa.Numeric(5, 2), nullable=False, server_default=sa.text("0")),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column(
            "analyst_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("org_members.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("analyst_note", sa.Text(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "attachment_refs",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
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
        sa.CheckConstraint(
            "status IN ('pending','approved','rejected')",
            name="ck_quarantine_items_status",
        ),
    )
    op.create_index("ix_quarantine_items_org_id", "quarantine_items", ["org_id"])
    op.create_index(
        "ix_quarantine_items_scan_event_id",
        "quarantine_items",
        ["scan_event_id"],
    )
    op.create_index(
        "ix_quarantine_items_org_status_created",
        "quarantine_items",
        ["org_id", "status", "created_at"],
    )
    op.create_index("ix_quarantine_items_org_scan", "quarantine_items", ["org_id", "scan_id"])

    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "org_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("organizations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("actor", sa.Text(), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("action", sa.Text(), nullable=False),
        sa.Column(
            "metadata",
            postgresql.JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("previous_hash", sa.Text(), nullable=True),
        sa.Column("event_hash", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("event_hash", name="uq_audit_events_event_hash"),
    )
    op.create_index("ix_audit_events_org_id", "audit_events", ["org_id"])
    op.create_index("ix_audit_events_org_created", "audit_events", ["org_id", "created_at"])
    op.create_index(
        "ix_audit_events_org_category_created",
        "audit_events",
        ["org_id", "category", "created_at"],
    )

    op.execute(
        """
        CREATE OR REPLACE FUNCTION block_audit_event_mutation()
        RETURNS trigger AS $$
        BEGIN
            RAISE EXCEPTION 'audit_events are append-only';
        END;
        $$ LANGUAGE plpgsql;
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_no_update
        BEFORE UPDATE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION block_audit_event_mutation();
        """
    )
    op.execute(
        """
        CREATE TRIGGER audit_events_no_delete
        BEFORE DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION block_audit_event_mutation();
        """
    )

def downgrade() -> None:
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events")
    op.execute("DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events")
    op.execute("DROP FUNCTION IF EXISTS block_audit_event_mutation")
    op.drop_index("ix_audit_events_org_category_created", table_name="audit_events")
    op.drop_index("ix_audit_events_org_created", table_name="audit_events")
    op.drop_index("ix_audit_events_org_id", table_name="audit_events")
    op.drop_table("audit_events")
    op.drop_index("ix_quarantine_items_org_scan", table_name="quarantine_items")
    op.drop_index("ix_quarantine_items_org_status_created", table_name="quarantine_items")
    op.drop_index("ix_quarantine_items_scan_event_id", table_name="quarantine_items")
    op.drop_index("ix_quarantine_items_org_id", table_name="quarantine_items")
    op.drop_table("quarantine_items")
    op.drop_index("ix_attachment_scans_org_client", table_name="attachment_scans")
    op.drop_index("ix_attachment_scans_org_id", table_name="attachment_scans")
    op.drop_table("attachment_scans")
