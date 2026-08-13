from __future__ import annotations

import pytest
from pydantic import ValidationError

from aurodlpv2_backend.settings import Settings


@pytest.mark.unit
def test_cors_origins_accept_documented_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv(
        "CORS_ORIGINS",
        "http://localhost:5173, chrome-extension://example",
    )

    settings = Settings(_env_file=None)  # type: ignore[call-arg]

    assert settings.cors_origins == [
        "http://localhost:5173",
        "chrome-extension://example",
    ]


@pytest.mark.unit
def test_production_rejects_default_object_storage_credentials() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,  # type: ignore[call-arg]
            app_env="production",
            refresh_cookie_secure=True,
            jwt_secret="a-production-secret-longer-than-thirty-two-bytes",
            cors_origins=["https://console.example.com"],
            object_storage_endpoint_url="https://objects.example.com",
        )
