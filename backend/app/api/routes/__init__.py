"""API Routes module."""

from app.api.routes.health import router as health_router
from app.api.routes.datasets import router as datasets_router
from app.api.routes.pipelines import router as pipelines_router
from app.api.routes.anomalies import router as anomalies_router

__all__ = ["health_router", "datasets_router", "pipelines_router", "anomalies_router"]
