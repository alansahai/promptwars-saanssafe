"""SaansSafe application configuration.

All configuration is loaded from environment variables (or a .env file).
No secrets are hardcoded. Use .env.example as a template.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    # --- Gemini / GenAI ---
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"

    # --- CORS ---
    allowed_origins: list[str] = ["*"]

    # --- Rate limiting (in-memory, per-instance; best-effort on serverless) ---
    rate_limit_per_minute: int = 60

    # --- Cache ---
    aqi_cache_ttl_seconds: int = 900  # 15 minutes

    # --- Timeouts (seconds) ---
    open_meteo_timeout: float = 4.0
    gemini_timeout: float = 6.0

    # --- Request body size ---
    max_body_size_bytes: int = 65_536  # 64 KB

    # --- Logging ---
    log_level: str = "INFO"

    # --- Environment ---
    environment: str = "production"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached application settings (singleton).

    Returns:
        A Settings instance loaded once from environment variables.
    """
    return Settings()
