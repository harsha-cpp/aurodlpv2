from __future__ import annotations

import pytest

from aurodlpv2_backend.auth.google_oauth import GoogleTokenError, google_identity_from_payload


@pytest.mark.unit
def test_google_identity_accepts_allowed_hd() -> None:
    identity = google_identity_from_payload(
        {
            "aud": "client.apps.googleusercontent.com",
            "email": "alice@hospital.example.org",
            "email_verified": True,
            "hd": "hospital.example.org",
            "sub": "google-sub",
        },
        allowed_hd_domains=["hospital.example.org"],
        google_client_ids=["client.apps.googleusercontent.com"],
    )

    assert identity.email == "alice@hospital.example.org"
    assert identity.hd == "hospital.example.org"


@pytest.mark.unit
def test_google_identity_rejects_hd_mismatch() -> None:
    with pytest.raises(GoogleTokenError):
        google_identity_from_payload(
            {
                "aud": "client.apps.googleusercontent.com",
                "email": "alice@gmail.com",
                "email_verified": True,
                "hd": "gmail.com",
                "sub": "google-sub",
            },
            allowed_hd_domains=["hospital.example.org"],
            google_client_ids=["client.apps.googleusercontent.com"],
        )
