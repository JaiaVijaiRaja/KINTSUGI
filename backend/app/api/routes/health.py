from datetime import datetime, timezone
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import settings

router = APIRouter(tags=["Health"])


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service status", json_schema_extra={"example": "healthy"})
    service: str = Field(..., description="Service identifier", json_schema_extra={"example": "kintsugi-api"})
    version: str = Field(..., description="API version", json_schema_extra={"example": "0.1.0"})
    environment: str = Field(..., description="Deployment environment", json_schema_extra={"example": "development"})
    timestamp: str = Field(..., description="UTC ISO-8601 timestamp")


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service Health Check",
    description="Returns service status, environment, version, and current server timestamp.",
)
async def get_health() -> HealthResponse:
    """Return system operational status for monitoring and frontend connectivity checks."""
    return HealthResponse(
        status="healthy",
        service="kintsugi-api",
        version=settings.VERSION,
        environment=settings.ENVIRONMENT,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
