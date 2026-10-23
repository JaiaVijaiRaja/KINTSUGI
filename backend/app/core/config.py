import json
from typing import List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings configured via environment variables."""

    PROJECT_NAME: str = "KINTSUGI Pipeline API"
    ENVIRONMENT: str = "development"
    VERSION: str = "0.1.0"
    API_PREFIX: str = "/api"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    CORS_ORIGINS: Union[List[str], str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]
    STORAGE_DIR: str = "storage/datasets"
    PIPELINE_STORAGE_DIR: str = "storage/pipelines"
    RUNS_STORAGE_DIR: str = "storage/runs"
    MAX_UPLOAD_SIZE_BYTES: int = 52_428_800  # 50 MB
    MAX_DATASET_ROWS: int = 500_000
    MAX_DATASET_COLS: int = 200
    DEFAULT_PREVIEW_LIMIT: int = 50
    MAX_PREVIEW_LIMIT: int = 500

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def assemble_cors_origins(cls, v: Union[str, List[str]]) -> List[str]:
        if isinstance(v, str):
            if v.startswith("[") and v.endswith("]"):
                try:
                    parsed = json.loads(v)
                    if isinstance(parsed, list):
                        return parsed
                except Exception:
                    pass
            return [i.strip() for i in v.split(",") if i.strip()]
        if isinstance(v, list):
            return v
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )


settings = Settings()
