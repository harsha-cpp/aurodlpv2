from __future__ import annotations

import pytest

from aurodlpv2_backend.recipients.classifier import email_domain


@pytest.mark.unit
def test_email_domain_normalizes_address_domain() -> None:
    assert email_domain("Patient@Gmail.COM") == "gmail.com"
