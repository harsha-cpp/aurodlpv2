"""Runtime configuration loaded from environment."""

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

#: Settings a deployer will reasonably write as "a,b,c" in a .env file.
_CSV_LIST_FIELDS = frozenset({"cors_origins", "api_rate_limit_exempt_paths"})


class _CsvOrJsonDecoder:
    """Mixin: accept ``a,b`` as well as ``["a","b"]`` for list settings."""

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
    """Environment variables, with CSV tolerated for list fields.

    pydantic-settings JSON-decodes complex fields in the source, before any
    ``field_validator`` runs, so a plain comma-separated value raised a
    SettingsError at startup. An operator writing
    ``CORS_ORIGINS=https://a,https://b`` should not get a container that
    refuses to boot.
    """


class CsvOrJsonDotEnvSource(_CsvOrJsonDecoder, DotEnvSettingsSource):
    """The same tolerance for values read out of a .env file."""


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
    celery_broker_url: str = Field(default="redis://localhost:6379/0")
    celery_result_backend: str = Field(default="redis://localhost:6379/0")

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
    # Behind a load balancer request.client.host is the LB, so every hospital
    # shares one login bucket. Set to the number of proxies that append to
    # X-Forwarded-For so the real client IP can be read from the right position.
    trusted_proxy_count: int = Field(default=0, ge=0, le=8)
    # Self-serve tenant creation. Hospitals run this closed; dev needs it open.
    allow_open_signup: bool = Field(default=True)
    # Concurrent refresh calls (two dashboard tabs) must not log the user out,
    # so a rotated token stays usable for this long before it reads as theft.
    refresh_rotation_grace_seconds: int = Field(default=60, ge=0, le=600)
    password_reset_ttl_seconds: int = Field(default=3600, ge=300, le=86400)
    email_verification_ttl_hours: int = Field(default=24, ge=1, le=168)
    device_token_ttl_days: int = Field(default=365, ge=1, le=3650)
    mfa_issuer: str = Field(default="Auro Healthcare DLP")
    # TOTP secrets are password-equivalent; a DB dump must not hand over MFA.
    # Defaults to jwt_secret so local dev works without extra config.
    mfa_encryption_key: SecretStr | None = Field(default=None)

    # ---- API rate limit (RateLimitMiddleware) --------------------------------
    # Shared across workers via Redis, so the budget is per-key not per-process.
    # A hospital behind one NAT IP puts every workstation on one key, hence the
    # high ceiling; /scan and /events get their own per-device limits elsewhere.
    api_rate_limit_per_minute: int = Field(default=600, ge=1)
    api_rate_limit_exempt_paths: list[str] = Field(
        default_factory=lambda: ["/api/v1/scan", "/api/v1/events"]
    )
    # Bounds the in-memory fallback so a spray of unique keys cannot OOM a worker.
    api_rate_limit_max_keys: int = Field(default=10_000, ge=100)

    # ---- Outbound mail -------------------------------------------------------
    mailer_backend: Literal["console", "smtp"] = Field(default="console")
    smtp_host: str = Field(default="localhost")
    smtp_port: int = Field(default=587)
    smtp_user: str | None = Field(default=None)
    smtp_password: SecretStr | None = Field(default=None)
    smtp_from: str = Field(default="Auro Healthcare DLP <no-reply@localhost>")
    smtp_tls: bool = Field(default=True)
    # Base URL of the dashboard, used to build invite / reset / verify links.
    app_base_url: str = Field(default="http://localhost:5173")

    # ---- Attachments / object storage ----------------------------------------
    attachment_temp_dir: Path = Field(default=Path("/tmp/aurodlpv2-attachments"))
    quarantine_storage_dir: Path = Field(default=Path("/tmp/aurodlpv2-quarantine"))
    scan_deep_scan_threshold_bytes: int = Field(default=10 * 1024 * 1024)
    # "local" only works when the API and the Celery worker share a filesystem.
    storage_backend: Literal["local", "s3"] = Field(default="local")
    s3_bucket: str = Field(default="aurodlpv2-attachments")
    s3_prefix: str = Field(default="queued-scans")
    s3_region: str = Field(default="ap-south-1")
    s3_endpoint_url: str | None = Field(default=None)
    s3_access_key_id: str | None = Field(default=None)
    s3_secret_access_key: SecretStr | None = Field(default=None)
    s3_server_side_encryption: str | None = Field(default="AES256")

    # ---- Scan execution ------------------------------------------------------
    # Detection is CPU-bound and synchronous. Running it on the event loop stalls
    # every other request in the worker, health checks included.
    scan_max_concurrency: int = Field(default=4, ge=1, le=64)
    # /scan and /events are exempt from the IP-keyed global limiter (a whole
    # hospital shares one NAT address). The budget lives on the credential
    # instead; these are the ceilings.
    scan_rate_limit_per_device_per_minute: int = Field(default=60, ge=1)
    scan_rate_limit_per_org_per_minute: int = Field(default=600, ge=1)

    # ---- Observability -------------------------------------------------------
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
