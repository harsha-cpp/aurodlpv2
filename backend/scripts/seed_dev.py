"""Seed local dev DB with demo workspace, users, policies, and domains.

Run with: uv run python -m scripts.seed_dev
"""

from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from aurodlpv2_backend.db.models import (
    DomainClassification,
    PolicyRecord,
    User,
    Workspace,
)
from aurodlpv2_backend.settings import get_settings
from aurodlpv2_backend.utils.uuid import uuid7


DEMO_WORKSPACE_ID = UUID("01912345-6789-7000-8000-000000000001")
DEMO_ADMIN_ID = UUID("01912345-6789-7000-8000-000000000010")

DEFAULT_POLICIES = [
    {
        "name": "Block Aadhaar to Public Email",
        "description": "Block sending Aadhaar numbers to public email domains",
        "enabled": True,
        "priority": 100,
        "body": {
            "id": "pol_block_aadhaar_public",
            "name": "Block Aadhaar to Public Email",
            "when": {
                "op": "all_of",
                "clauses": [
                    {"kind": "entity", "op": "contains", "value": "IN_AADHAAR"},
                    {"kind": "recipient", "op": "classification_in", "value": ["public_email", "unknown"]},
                ],
            },
            "action": "block",
            "severity": "critical",
        },
    },
    {
        "name": "Block PAN to External",
        "description": "Block PAN card numbers to external recipients",
        "enabled": True,
        "priority": 90,
        "body": {
            "id": "pol_block_pan_external",
            "name": "Block PAN to External",
            "when": {
                "op": "all_of",
                "clauses": [
                    {"kind": "entity", "op": "contains", "value": "IN_PAN"},
                    {"kind": "recipient", "op": "classification_in", "value": ["external", "public_email", "unknown"]},
                ],
            },
            "action": "block",
            "severity": "high",
        },
    },
    {
        "name": "Warn ICD-10 to External Org",
        "description": "Warn when ICD-10 codes are sent to external organizations",
        "enabled": True,
        "priority": 70,
        "body": {
            "id": "pol_warn_icd10_external",
            "name": "Warn ICD-10 to External Org",
            "when": {
                "op": "all_of",
                "clauses": [
                    {"kind": "entity", "op": "contains", "value": "ICD10"},
                    {"kind": "recipient", "op": "classification_in", "value": ["external"]},
                ],
            },
            "action": "warn",
            "severity": "medium",
        },
    },
    {
        "name": "Quarantine ABHA to Unknown",
        "description": "Quarantine emails with ABHA numbers sent to unknown domains",
        "enabled": True,
        "priority": 80,
        "body": {
            "id": "pol_quarantine_abha_unknown",
            "name": "Quarantine ABHA to Unknown",
            "when": {
                "op": "all_of",
                "clauses": [
                    {"kind": "entity", "op": "contains", "value": "IN_ABHA"},
                    {"kind": "recipient", "op": "classification_in", "value": ["unknown"]},
                ],
            },
            "action": "quarantine",
            "severity": "high",
        },
    },
    {
        "name": "Warn Multiple PHI Entities",
        "description": "Warn when 3+ sensitive entities detected regardless of recipient",
        "enabled": True,
        "priority": 50,
        "body": {
            "id": "pol_warn_multiple_phi",
            "name": "Warn Multiple PHI Entities",
            "when": {
                "op": "any_of",
                "clauses": [
                    {"kind": "entity", "op": "count_gte", "value": 3},
                ],
            },
            "action": "warn",
            "severity": "medium",
        },
    },
]

APPROVED_DOMAINS = [
    ("apollo-hospitals.com", "approved_partner"),
    ("manipalhospitals.com", "approved_partner"),
    ("aiims.nic.in", "approved_partner"),
    ("nhp.gov.in", "approved_partner"),
    ("maxhealthcare.in", "approved_partner"),
]

DEMO_USERS = [
    ("admin@aurodlpv2-demo.com", "super_admin"),
    ("analyst@aurodlpv2-demo.com", "analyst"),
    ("dr.sharma@aurodlpv2-demo.com", "user"),
    ("nurse.priya@aurodlpv2-demo.com", "user"),
    ("receptionist@aurodlpv2-demo.com", "user"),
]


async def seed() -> None:
    settings = get_settings()
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        existing = await session.execute(
            text("SELECT id FROM workspaces WHERE id = :id"),
            {"id": DEMO_WORKSPACE_ID},
        )
        if existing.scalar_one_or_none():
            print("Demo workspace already exists, skipping seed.")
            return

        workspace = Workspace(
            id=DEMO_WORKSPACE_ID,
            name="Auro DLP v2 Demo Hospital",
            google_domains=["aurodlpv2-demo.com"],
            settings={},
        )
        session.add(workspace)
        await session.flush()

        users = []
        for email, role in DEMO_USERS:
            uid = DEMO_ADMIN_ID if role == "super_admin" else uuid7()
            u = User(id=uid, workspace_id=DEMO_WORKSPACE_ID, email=email, role=role)
            session.add(u)
            users.append(u)

        for pol in DEFAULT_POLICIES:
            p = PolicyRecord(
                id=uuid7(),
                workspace_id=DEMO_WORKSPACE_ID,
                name=pol["name"],
                enabled=pol["enabled"],
                rules=[pol["body"]],
            )
            session.add(p)

        for domain, classification in APPROVED_DOMAINS:
            d = DomainClassification(
                workspace_id=DEMO_WORKSPACE_ID,
                domain=domain,
                classification=classification,
            )
            session.add(d)

        await session.commit()
        print(f"Seeded: 1 workspace, {len(DEMO_USERS)} users, {len(DEFAULT_POLICIES)} policies, {len(APPROVED_DOMAINS)} domains")


def main() -> None:
    asyncio.run(seed())


if __name__ == "__main__":
    main()
