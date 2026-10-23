import logging
from fastapi import APIRouter, status

from app.schemas.pipeline import (
    PipelineConfig,
    PipelineConfigCreate,
    PipelineConfigUpdate,
    PipelineListResponse,
    PipelineValidationResponse,
)
from app.services.pipeline_service import pipeline_service

logger = logging.getLogger("kintsugi.api.pipelines")

router = APIRouter(prefix="/pipelines", tags=["Pipelines"])


@router.post(
    "/validate",
    response_model=PipelineValidationResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate pipeline configuration",
    description=(
        "Validates column mappings, detection settings, reconstruction policies, and confidence thresholds "
        "against the actual target dataset schema and quality audit. Does NOT save the configuration or execute any pipeline."
    ),
)
async def validate_pipeline(payload: PipelineConfigCreate) -> PipelineValidationResponse:
    """Validate submitted configuration against target dataset."""
    logger.info("Validating pipeline configuration '%s' against dataset '%s'", payload.configuration_name, payload.dataset_id)
    return pipeline_service.validate_pipeline_config(payload)


@router.post(
    "",
    response_model=PipelineConfig,
    status_code=status.HTTP_201_CREATED,
    summary="Create pipeline configuration",
    description="Validate and persist a new pipeline configuration. Does NOT trigger pipeline execution.",
)
async def create_pipeline(payload: PipelineConfigCreate) -> PipelineConfig:
    """Create and persist a new validated pipeline configuration."""
    logger.info("Creating new pipeline configuration '%s'", payload.configuration_name)
    return pipeline_service.create_pipeline_config(payload)


@router.post(
    "/configs",
    response_model=PipelineConfig,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def create_pipeline_alias(payload: PipelineConfigCreate) -> PipelineConfig:
    """Compatibility alias for POST /api/pipelines."""
    return pipeline_service.create_pipeline_config(payload)


@router.get(
    "",
    response_model=PipelineListResponse,
    status_code=status.HTTP_200_OK,
    summary="List pipeline configurations",
    description="List all saved pipeline configurations from persistent storage.",
)
async def list_pipelines() -> PipelineListResponse:
    """List all saved pipeline configurations."""
    return pipeline_service.list_pipeline_configs()


@router.get(
    "/configs",
    response_model=PipelineListResponse,
    status_code=status.HTTP_200_OK,
    include_in_schema=False,
)
async def list_pipelines_alias() -> PipelineListResponse:
    """Compatibility alias for GET /api/pipelines."""
    return pipeline_service.list_pipeline_configs()


@router.get(
    "/{pipeline_id}",
    response_model=PipelineConfig,
    status_code=status.HTTP_200_OK,
    summary="Retrieve pipeline configuration",
    description="Retrieve a specific saved pipeline configuration by its server-generated ID.",
)
async def get_pipeline(pipeline_id: str) -> PipelineConfig:
    """Retrieve saved pipeline configuration by ID."""
    return pipeline_service.get_pipeline_config(pipeline_id)


@router.put(
    "/{pipeline_id}",
    response_model=PipelineConfig,
    status_code=status.HTTP_200_OK,
    summary="Update pipeline configuration",
    description="Update an existing pipeline configuration with incremented version and re-validation.",
)
async def update_pipeline(
    pipeline_id: str, payload: PipelineConfigUpdate
) -> PipelineConfig:
    """Update existing pipeline configuration."""
    logger.info("Updating pipeline configuration '%s'", pipeline_id)
    return pipeline_service.update_pipeline_config(pipeline_id, payload)


# Phase 5: Anomaly Detection Execution & Run Endpoints

from app.schemas.anomaly import (
    DetectionRun,
    DetectionRunResponse,
    DetectionRunResultsResponse,
)
from app.services.detection_service import detection_service


@router.post(
    "/{pipeline_id}/run",
    response_model=DetectionRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute pipeline anomaly detection",
    description="Starts and persists a detection run on the pipeline's target dataset using configured detectors.",
)
async def execute_pipeline_run(pipeline_id: str) -> DetectionRunResponse:
    """Execute detection run for saved pipeline configuration."""
    logger.info("Triggered detection run execution for pipeline '%s'", pipeline_id)
    run = detection_service.execute_detection_run(pipeline_id)
    results = detection_service.get_detection_run_results(run.run_id, limit=5, offset=0)
    return DetectionRunResponse(run=run, sample_anomalies=results.anomalies)


@router.post(
    "/{pipeline_id}/execute",
    response_model=DetectionRunResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False,
)
async def execute_pipeline_alias(pipeline_id: str) -> DetectionRunResponse:
    """Compatibility alias for POST /api/pipelines/{pipeline_id}/run."""
    return await execute_pipeline_run(pipeline_id)


@router.get(
    "/{pipeline_id}/runs/{run_id}",
    response_model=DetectionRun,
    status_code=status.HTTP_200_OK,
    summary="Retrieve detection run status",
    description="Retrieves detection run execution status, metadata, and summary counts.",
)
async def get_pipeline_run_status(pipeline_id: str, run_id: str) -> DetectionRun:
    """Retrieve status for a specific detection run."""
    run = detection_service.get_detection_run(run_id)
    if run.configuration_id != pipeline_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run '{run_id}' does not belong to pipeline '{pipeline_id}'.",
        )
    return run


@router.get(
    "/{pipeline_id}/runs/{run_id}/results",
    response_model=DetectionRunResultsResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve detection run results",
    description="Retrieves persisted anomaly records for a completed detection run.",
)
async def get_pipeline_run_results(
    pipeline_id: str,
    run_id: str,
    limit: int = 50,
    offset: int = 0,
) -> DetectionRunResultsResponse:
    """Retrieve persisted anomaly records for a detection run."""
    run = detection_service.get_detection_run(run_id)
    if run.configuration_id != pipeline_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Run '{run_id}' does not belong to pipeline '{pipeline_id}'.",
        )
    return detection_service.get_detection_run_results(run_id, limit=limit, offset=offset)
