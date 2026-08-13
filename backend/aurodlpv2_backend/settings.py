"""Runtime configuration loaded from environment."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

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
    cors_origins: Annotated[list[str], NoDecode] = Field(default_factory=list)

    # ---- Database ----------------------------------------------------------
    database_url: str = Field(
        default="postgresql+asyncpg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2"
    )
    database_sync_url: str = Field(
        default="postgresql+psycopg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2"
    )
    database_pool_size: int = Field(default=5)
    database_max_overflow: int = Field(default=5)
    # Disable asyncpg prepared statements (required for transaction-mode poolers like Neon).
    database_disable_prepared_statements: bool = Field(default=True)
    redis_url: str = Field(default="redis://localhost:6379/0")

    # ---- Auth --------------------------------------------------------------
    jwt_secret: SecretStr = Field(default=SecretStr("change-me-change-me-change-me-32!"))
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_ttl_seconds: int = Field(default=900)
    jwt_refresh_ttl_days: int = Field(default=30)
    refresh_cookie_name: str = Field(default="aurodlpv2_refresh")
    refresh_cookie_secure: bool = Field(default=False)
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = Field(default="lax")
    login_rate_limit_per_minute: int = Field(default=5)
    login_rate_limit_per_hour: int = Field(default=20)
    extension_token_ttl_days: int = Field(default=365, ge=1, le=730)

    # ---- Attachments / object storage --------------------------------------
    attachment_temp_dir: Path = Field(default=Path("/tmp/aurodlpv2-attachments"))
    attachment_max_bytes: int = Field(default=25 * 1024 * 1024, ge=1)
    scan_deep_scan_threshold_bytes: int = Field(default=10 * 1024 * 1024)
    object_storage_endpoint_url: str = Field(default="http://127.0.0.1:9000")
    object_storage_access_key: SecretStr = Field(default=SecretStr("aurodlpv2"))
    object_storage_secret_key: SecretStr = Field(default=SecretStr("aurodlpv2-secret"))
    object_storage_bucket: str = Field(default="aurodlpv2-quarantine")
    object_storage_region: str = Field(default="us-east-1")
    object_storage_sse: Literal["none", "AES256"] = Field(default="none")
    object_storage_retention_days: int = Field(default=1, ge=1, le=7)
    scan_worker_poll_seconds: float = Field(default=1.0, ge=0.1, le=60)
    scan_worker_lease_seconds: int = Field(default=300, ge=30, le=3600)
    scan_worker_max_attempts: int = Field(default=5, ge=1, le=20)

    # ---- Observability -----------------------------------------------------
    sentry_dsn: str | None = Field(default=None)

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_csv_list(cls, value: object) -> list[str] | object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @field_validator("sentry_dsn", mode="before")
    @classmethod
    def empty_string_as_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("refresh_cookie_samesite", mode="before")
    @classmethod
    def normalize_samesite(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @model_validator(mode="after")
    def enforce_production_security(self) -> Settings:
        if not self.is_production:
            return self
        if not self.refresh_cookie_secure:
            raise ValueError("REFRESH_COOKIE_SECURE must be true in production")
        if self.jwt_secret_value.startswith("change-me"):
            raise ValueError("JWT_SECRET must be changed in production")
        if not self.cors_origins:
            raise ValueError("CORS_ORIGINS must be explicit in production")
        if not self.object_storage_endpoint_url.startswith("https://"):
            raise ValueError("OBJECT_STORAGE_ENDPOINT_URL must use HTTPS in production")
        if self.object_storage_access_key.get_secret_value() == "aurodlpv2":
            raise ValueError("OBJECT_STORAGE_ACCESS_KEY must be changed in production")
        if self.object_storage_secret_key.get_secret_value() == "aurodlpv2-secret":
            raise ValueError("OBJECT_STORAGE_SECRET_KEY must be changed in production")
        return self

    @property
    def jwt_secret_value(self) -> str:
        return self.jwt_secret.get_secret_value()

    @property
    def object_storage_access_key_value(self) -> str:
        return self.object_storage_access_key.get_secret_value()

    @property
    def object_storage_secret_key_value(self) -> str:
        return self.object_storage_secret_key.get_secret_value()

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
