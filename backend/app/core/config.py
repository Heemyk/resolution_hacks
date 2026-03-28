from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

_BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = (
        "http://localhost:3000,http://localhost:3001,"
        "http://127.0.0.1:3000,http://127.0.0.1:3001"
    )

    data_dir: Path = _BACKEND_ROOT / "data"
    skills_dir: Path = _BACKEND_ROOT / "app" / "skills" / "bundled"

    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    voice_agent_api_key: str = ""
    voice_agent_base_url: str = ""
    exa_api_key: str = ""
    serper_api_key: str = ""

    # Streaming transcription: coalesce partials before persist callback
    transcript_buffer_max_chars: int = 2000
    transcript_buffer_flush_ms: int = 800

    # logging: DEBUG, INFO, WARNING, ERROR (DEBUG → buffer/SSE/LLM chunk detail)
    log_level: str = "DEBUG"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
