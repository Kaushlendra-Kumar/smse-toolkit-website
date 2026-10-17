from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BACKEND_DIR / ".env", extra="ignore")

    # Materials Project API key — get one at https://next-gen.materialsproject.org/api
    mp_api_key: str = ""
    mp_api_url: str = "https://api.materialsproject.org"

    cors_origins: list[str] = ["http://localhost:3000"]
    models_dir: Path = BACKEND_DIR / "models"
    # Contact address sent to Crossref (their "polite pool" etiquette)
    crossref_mailto: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
