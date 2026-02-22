"""Application configuration loaded from environment variables."""

from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # Telegram
    bot_token: str = ""
    webapp_url: str = "http://localhost:5173"

    # Database
    database_url: str = "postgresql+asyncpg://user:password@localhost:5432/exchanger_db"

    # Exchanger API
    api_login: str = ""
    api_key: str = ""
    base_url: str = "https://sapsanex.cc/api/userapi/v1/"

    # App
    debug: bool = True
    cors_origins: str = '["http://localhost:5173","http://localhost:3000"]'

    @property
    def cors_origins_list(self) -> List[str]:
        return json.loads(self.cors_origins)

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()