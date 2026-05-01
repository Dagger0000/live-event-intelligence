from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Auth
    jwt_secret: str = "dev_secret_change_in_production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440

    # AI APIs
    groq_api_key: str = ""
    gemini_api_key: str = ""

    # Sports Data
    thesportsdb_api_key: str = "123"
    use_mock: bool = True

    # Infrastructure
    redis_url: str = "redis://localhost:6379"
    database_url: str = "sqlite+aiosqlite:///./data/events.db"

    # App
    backend_url: str = "http://localhost:8000"

    class Config:
        env_file = ".env"
        extra = "ignore"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
