from __future__ import annotations

from typing import Any, cast
from uuid import UUID

import structlog
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from blade_backend.db.models import Organization
from blade_backend.policy.defaults import BUILTIN_POLICY_SET
from blade_backend.policy.models import PolicySet

logger = structlog.get_logger(__name__)

POLICY_SETTINGS_KEY = "policy"


def parse_policy_set(raw: object) -> PolicySet | None:
    if not isinstance(raw, dict):
        return None
    try:
        return PolicySet.model_validate(raw)
    except ValidationError:
        logger.warning("stored policy set is invalid; falling back to the builtin rules")
        return None


async def load_policy_set(session: AsyncSession, org_id: UUID) -> PolicySet:
    settings_blob = await session.scalar(
        select(Organization.settings).where(Organization.id == org_id)
    )
    if not isinstance(settings_blob, dict):
        return BUILTIN_POLICY_SET
    stored = cast(dict[str, Any], settings_blob).get(POLICY_SETTINGS_KEY)
    return parse_policy_set(stored) or BUILTIN_POLICY_SET


async def save_policy_set(
    session: AsyncSession,
    org_id: UUID,
    policy_set: PolicySet,
) -> PolicySet:
    org = await session.get(Organization, org_id)
    if org is None:
        raise LookupError(org_id)
    settings_blob = dict(org.settings or {})
    settings_blob[POLICY_SETTINGS_KEY] = policy_set.model_dump(mode="json")
    org.settings = settings_blob
    await session.flush()
    return policy_set


async def reset_policy_set(session: AsyncSession, org_id: UUID) -> PolicySet:
    org = await session.get(Organization, org_id)
    if org is None:
        raise LookupError(org_id)
    settings_blob = dict(org.settings or {})
    settings_blob.pop(POLICY_SETTINGS_KEY, None)
    org.settings = settings_blob
    await session.flush()
    return BUILTIN_POLICY_SET
