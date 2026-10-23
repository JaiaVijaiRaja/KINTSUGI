import logging
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.api.routes.health import router as health_router
from app.api.routes.datasets import router as datasets_router
from app.api.routes.pipelines import router as pipelines_router
from app.api.routes.anomalies import router as anomalies_router
from app.api.routes.reconstruction import router as reconstruction_router
from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("kintsugi")

def create_application() -> FastAPI:
    """Factory creating and configuring the FastAPI application instance."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description="Confidence-aware, self-healing industrial data pipeline API.",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
    )

    # Configure CORS - explicitly allows local frontend dev origins
    logger.info("Configuring CORS with origins: %s", settings.CORS_ORIGINS)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # Register API routes under the configured prefix (/api)
    app.include_router(health_router, prefix=settings.API_PREFIX)
    app.include_router(datasets_router, prefix=settings.API_PREFIX)
    app.include_router(pipelines_router, prefix=settings.API_PREFIX)
    app.include_router(anomalies_router, prefix=settings.API_PREFIX)
    app.include_router(reconstruction_router, prefix=settings.API_PREFIX)

    # Global Exception Handlers
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        logger.warning(
            "HTTP %d error on %s: %s", exc.status_code, request.url.path, exc.detail
        )
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": exc.status_code,
                    "message": exc.detail,
                    "path": request.url.path,
                }
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        logger.warning("Validation error on %s: %s", request.url.path, exc.errors())
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": 422,
                    "message": "Validation Error",
                    "details": exc.errors(),
                    "path": request.url.path,
                }
            },
        )

    @app.exception_handler(Exception)
    async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled server exception on %s: %s", request.url.path, str(exc))
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": 500,
                    "message": "Internal Server Error",
                    "path": request.url.path,
                }
            },
        )

    return app


app = create_application()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",
    )
