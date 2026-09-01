# pyright: reportPrivateUsage=false

from __future__ import annotations

from uuid import uuid4

import pytest

from blade_backend.auth.session import serialize_org
from blade_backend.db.models import MemberRole, Organization
from blade_backend.orgs.api import _serialize as serialize_org_out


def _org() -> Organization:
    return Organization(
        id=uuid4(),
        name="City Hospital",
        slug="city-hospital",
        org_code="BLD-SECRET",
        plan="free",
    )


@pytest.mark.unit
@pytest.mark.parametrize("role", ["owner", "admin"])
def test_admins_can_read_the_org_code(role: MemberRole) -> None:
    assert serialize_org_out(_org(), role).org_code == "BLD-SECRET"
    assert serialize_org(_org(), viewer_role=role).org_code == "BLD-SECRET"


@pytest.mark.unit
@pytest.mark.parametrize("role", ["analyst", "viewer"])
def test_lower_roles_never_see_the_org_code(role: MemberRole) -> None:
    assert serialize_org_out(_org(), role).org_code is None
    assert serialize_org(_org(), viewer_role=role).org_code is None


@pytest.mark.unit
def test_org_code_is_withheld_when_no_role_is_supplied() -> None:
    assert serialize_org(_org()).org_code is None
