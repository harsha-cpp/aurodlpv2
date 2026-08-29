from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from aurodlpv2_backend.db.models import ApprovedDomain, Organization
from aurodlpv2_backend.public.api import get_public_config
from aurodlpv2_backend.settings import Settings


class _ScalarRows:
    def __init__(self, rows: list[ApprovedDomain]) -> None:
        self._rows = rows

    def all(self) -> list[ApprovedDomain]:
        return self._rows


class _FakeSession:
    def __init__(self, org: Organization, domains: list[ApprovedDomain]) -> None:
        self.org = org
        self.domains = domains

    async def scalar(self, _statement: object) -> Organization:
        return self.org

    async def scalars(self, _statement: object) -> _ScalarRows:
        return _ScalarRows(self.domains)


def _domain(domain: str, direction: str, classification: str) -> ApprovedDomain:
    return ApprovedDomain(
        id=uuid4(),
        org_id=uuid4(),
        domain=domain,
        direction=direction,  # type: ignore[arg-type]
        classification=classification,  # type: ignore[arg-type]
        created_at=datetime.now(UTC),
    )


@pytest.mark.unit
async def test_public_config_never_returns_blocked_or_sender_only_domains_as_allowlist() -> None:
    org = Organization(id=uuid4(), name="Auro", slug="auro", org_code="AUR-ABC123")
    session = _FakeSession(
        org,
        [
            _domain("allowed.example", "both", "partner"),
            _domain("sender-only.example", "sender", "partner"),
            _domain("blocked.example", "both", "blocked"),
        ],
    )

    config = await get_public_config("aur-abc123", session)  # type: ignore[arg-type]

    assert [domain.domain for domain in config.domains] == ["allowed.example"]
    assert [domain.domain for domain in config.blocked_domains] == ["blocked.example"]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("https://a.example,https://b.example", ["https://a.example", "https://b.example"]),
        ('["https://c.example"]', ["https://c.example"]),
        ("https://d.example", ["https://d.example"]),
        ("", []),
        ("  https://e.example ,  https://f.example  ", ["https://e.example", "https://f.example"]),
    ],
)
def test_list_settings_accept_csv_and_json(
    monkeypatch: pytest.MonkeyPatch,
    raw: str,
    expected: list[str],
) -> None:
    monkeypatch.setenv("CORS_ORIGINS", raw)
    assert Settings().cors_origins == expected
