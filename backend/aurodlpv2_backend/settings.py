from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import (
    BaseSettings,
    DotEnvSettingsSource,
    EnvSettingsSource,
    SettingsConfigDict,
)
from pydantic_settings.sources import PydanticBaseSettingsSource

BACKEND_ROOT = Path(__file__).resolve().parents[1]

_CSV_LIST_FIELDS = frozenset({"cors_origins", "api_rate_limit_exempt_paths"})


class _CsvOrJsonDecoder:
    def decode_complex_value(
        self,
        field_name: str,
        field: object,
        value: object,
    ) -> object:
        if field_name in _CSV_LIST_FIELDS and isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            if not stripped.startswith(("[", "{")):
                return [item.strip() for item in stripped.split(",") if item.strip()]
        return super().decode_complex_value(field_name, field, value)  # type: ignore[misc]


class CsvOrJsonEnvSource(_CsvOrJsonDecoder, EnvSettingsSource):
    pass


class CsvOrJsonDotEnvSource(_CsvOrJsonDecoder, DotEnvSettingsSource):
    pass


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    app_env: str = Field(default="local")
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")

    api_host: str = Field(default="0.0.0.0")
    api_port: int = Field(default=8000)
    cors_origins: list[str] = Field(default_factory=list)

    database_url: str = Field(
        default="postgresql+asyncpg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2"
    )
    database_sync_url: str = Field(
        default="postgresql+psycopg://aurodlpv2:aurodlpv2@localhost:5433/aurodlpv2"
    )
    database_pool_size: int = Field(default=5)
    database_max_overflow: int = Field(default=5)
    database_disable_prepared_statements: bool = Field(default=True)
    redis_url: str = Field(default="redis://localhost:6379/0")
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/0")

    jwt_secret: SecretStr = Field(default=SecretStr("change-me-change-me-change-me-32!"))
    jwt_algorithm: str = Field(default="HS256")
    jwt_access_ttl_seconds: int = Field(default=900)
    jwt_refresh_ttl_days: int = Field(default=30)
    refresh_cookie_name: str = Field(default="aurodlpv2_refresh")
    refresh_cookie_secure: bool = Field(default=False)
    refresh_cookie_samesite: Literal["lax", "strict", "none"] = Field(default="lax")
    login_rate_limit_per_minute: int = Field(default=5)
    login_rate_limit_per_hour: int = Field(default=20)
    trusted_proxy_count: int = Field(default=0, ge=0, le=8)
    allow_open_signup: bool = Field(default=True)
    refresh_rotation_grace_seconds: int = Field(default=60, ge=0, le=600)
    password_reset_ttl_seconds: int = Field(default=3600, ge=300, le=86400)
    email_verification_ttl_hours: int = Field(default=24, ge=1, le=168)
    device_token_ttl_days: int = Field(default=365, ge=1, le=3650)
    mfa_issuer: str = Field(default="Auro Healthcare DLP")
    mfa_encryption_key: SecretStr | None = Field(default=None)

    api_rate_limit_per_minute: int = Field(default=600, ge=1)
    api_rate_limit_exempt_paths: list[str] = Field(
        default_factory=lambda: ["/api/v1/scan", "/api/v1/events"]
    )
    api_rate_limit_max_keys: int = Field(default=10_000, ge=100)

    mailer_backend: Literal["console", "smtp"] = Field(default="console")
    smtp_host: str = Field(default="localhost")
    smtp_port: int = Field(default=587)
    smtp_user: str | None = Field(default=None)
    smtp_password: SecretStr | None = Field(default=None)
    smtp_from: str = Field(default="Auro Healthcare DLP <no-reply@localhost>")
    smtp_tls: bool = Field(default=True)
    app_base_url: str = Field(default="http://localhost:5173")

    attachment_temp_dir: Path = Field(default=Path("/tmp/aurodlpv2-attachments"))
    quarantine_storage_dir: Path = Field(default=Path("/tmp/aurodlpv2-quarantine"))
    scan_deep_scan_threshold_bytes: int = Field(default=10 * 1024 * 1024)
    storage_backend: Literal["local", "s3"] = Field(default="local")
    s3_bucket: str = Field(default="aurodlpv2-attachments")
    s3_prefix: str = Field(default="queued-scans")
    s3_region: str = Field(default="ap-south-1")
    s3_endpoint_url: str | None = Field(default=None)
    s3_access_key_id: str | None = Field(default=None)
    s3_secret_access_key: SecretStr | None = Field(default=None)
    s3_server_side_encryption: str | None = Field(default="AES256")

    scan_max_concurrency: int = Field(default=4, ge=1, le=64)
    scan_rate_limit_per_device_per_minute: int = Field(default=60, ge=1)
    scan_rate_limit_per_org_per_minute: int = Field(default=600, ge=1)

    sentry_dsn: str | None = Field(default=None)

    @field_validator("cors_origins", "api_rate_limit_exempt_paths", mode="before")
    @classmethod
    def parse_csv_list(cls, value: object) -> list[str] | object:
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return []
            return [item.strip() for item in stripped.split(",") if item.strip()]
        return value

    @field_validator(
        "sentry_dsn",
        "s3_endpoint_url",
        "s3_access_key_id",
        "s3_server_side_encryption",
        "smtp_user",
        mode="before",
    )
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
        if self.storage_backend == "local":
            raise ValueError(
                "STORAGE_BACKEND must be 's3' in production: local storage requires "
                "the API and the Celery worker to share a filesystem"
            )
        if self.mailer_backend == "console":
            raise ValueError(
                "MAILER_BACKEND must be 'smtp' in production: invites and password "
                "resets are undeliverable when mail only goes to the log"
            )
        return self

    @property
    def jwt_secret_value(self) -> str:
        return self.jwt_secret.get_secret_value()

    @property
    def mfa_encryption_key_value(self) -> str:
        key = self.mfa_encryption_key
        return key.get_secret_value() if key is not None else self.jwt_secret_value

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() == "production"

    @classmethod
    def settings_customise_sources(
        cls,
        settings_cls: type[BaseSettings],
        init_settings: PydanticBaseSettingsSource,
        env_settings: PydanticBaseSettingsSource,
        dotenv_settings: PydanticBaseSettingsSource,
        file_secret_settings: PydanticBaseSettingsSource,
    ) -> tuple[PydanticBaseSettingsSource, ...]:
        del env_settings, dotenv_settings
        return (
            init_settings,
            CsvOrJsonEnvSource(settings_cls),
            CsvOrJsonDotEnvSource(
                settings_cls,
                env_file=settings_cls.model_config.get("env_file"),
                env_file_encoding="utf-8",
            ),
            file_secret_settings,
        )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
