"""Runtime configuration loaded from environment."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ---------------------------------------------------------------
    app_env: str = Field(default="local")
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")

    # ---- HTTP --------------------------------------------------------------
    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    cors_origins: list[str] = Field(default_factory=list)

    # ---- Database ----------------------------------------------------------
    database_url: str = Field(default="postgresql+asyncpg://medshield:medshield@localhost:5432/medshield")
    database_sync_url: str = Field(default="postgresql+psycopg://medshield:medshield@localhost:5432/medshield")
    database_pool_size: int = Field(default=10)
    database_max_overflow: int = Field(default=10)

    # ---- Redis + Celery ----------------------------------------------------
    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/1")
    celery_result_backend: str = Field(default="redis://localhost:6379/2")

    # ---- Auth --------------------------------------------------------------
    google_client_ids: list[str] = Field(default_factory=list)
    allowed_hd_domains: list[str] = Field(default_factory=list)
    jwt_secret: SecretStr = Field(default=SecretStr("change-me-change-me-change-me-32!"))
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_ttl_seconds: int = Field(default=900)
    jwt_refresh_ttl_days: int = Field(default=30)

    # ---- Attachments -------------------------------------------------------
    attachment_temp_dir: Path = Field(default=Path("/tmp/medshield-attachments"))
    attachment_max_bytes: int = Field(default=25 * 1024 * 1024)
    attachment_deep_scan_threshold: int = Field(default=2 * 1024 * 1024)

    # ---- Quarantine / object storage --------------------------------------
    quarantine_bucket: str = Field(default="medshield-quarantine")
    s3_endpoint_url: str | None = Field(default=None)
    s3_access_key: SecretStr | None = Field(default=None)
    s3_secret_key: SecretStr | None = Field(default=None)
    s3_region: str = Field(default="us-east-1")

    # ---- Observability -----------------------------------------------------
    otel_exporter_otlp_endpoint: str | None = Field(default=None)
    prometheus_port: int = Field(default=9100)
    sentry_dsn: str | None = Field(default=None)

    @field_validator("cors_origins", "google_client_ids", "allowed_hd_domains", mode="before")
    @classmethod
    def parse_csv_list(cls, value: object) -> list[str] | object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @field_validator("sentry_dsn", "otel_exporter_otlp_endpoint", "s3_endpoint_url", mode="before")
    @classmethod
    def empty_string_as_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @property
    def jwt_secret_value(self) -> str:
        return self.jwt_secret.get_secret_value()


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
