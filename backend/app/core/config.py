from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    redis_url: str = "redis://127.0.0.1:6379/0"
    celery_broker_url: str = "redis://127.0.0.1:6379/0"
    celery_result_backend: str = "redis://127.0.0.1:6379/1"

    data_dir: Path = _BACKEND_ROOT / "data"
    skills_dir: Path = _BACKEND_ROOT / "app" / "skills" / "bundled"

    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    voice_agent_api_key: str = ""
    voice_agent_base_url: str = ""
    exa_api_key: str = ""

    # Streaming transcription: coalesce partials before persist callback
    transcript_buffer_max_chars: int = 2000
    transcript_buffer_flush_ms: int = 800

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
