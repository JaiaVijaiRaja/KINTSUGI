"""API endpoints for KINTSUGI Phase 7: Evaluation Center and Benchmarking Engine."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.evaluation import (
    CreateEvaluationRequest,
    EvaluationBreakdownResponse,
    EvaluationListResponse,
    EvaluationManifestResponse,
    EvaluationMetricsResponse,
    EvaluationRun,
    EvaluationValidationResponse,
)
from app.services.evaluation_service import evaluation_service

router = APIRouter(prefix="/evaluations", tags=["Evaluation Center"])


@router.post(
    "",
    response_model=EvaluationRun,
    status_code=status.HTTP_201_CREATED,
    summary="Create and execute an evaluation run",
    description="Initiate either a controlled synthetic benchmark (Mode A) or inspect existing detection/reconstruction runs (Mode B).",
)
async def create_evaluation(request: CreateEvaluationRequest) -> EvaluationRun:
    """Create and execute an evaluation run."""
    return evaluation_service.execute_evaluation(request)


@router.get(
    "",
    response_model=EvaluationListResponse,
    summary="List historical evaluation runs",
    description="Retrieve paginated catalog of persisted evaluation benchmarks with optional dataset and mode filters.",
)
async def list_evaluations(
    dataset_id: Optional[str] = Query(None, description="Filter by source dataset ID"),
    mode: Optional[str] = Query(None, description="Filter by evaluation mode ('mode_a_benchmark' or 'mode_b_existing_run')"),
    limit: int = Query(50, ge=1, le=500, description="Maximum evaluations per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> EvaluationListResponse:
    """List historical evaluation runs."""
    return evaluation_service.list_evaluations(
        dataset_id=dataset_id,
        mode=mode,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{evaluation_id}",
    response_model=EvaluationRun,
    summary="Get evaluation run details",
    description="Retrieve complete metadata, status, quantitative metrics, and breakdowns for a specific evaluation run.",
)
async def get_evaluation(evaluation_id: str) -> EvaluationRun:
    """Retrieve full evaluation run by evaluation_id."""
    return evaluation_service.get_evaluation(evaluation_id)


@router.get(
    "/{evaluation_id}/metrics",
    response_model=EvaluationMetricsResponse,
    summary="Get quantitative evaluation metrics and definitions",
    description="Retrieve detection confusion matrix, precision, recall, F1, reconstruction MAE/RMSE/MAPE, confidence summaries, and formal definitions.",
)
async def get_evaluation_metrics(evaluation_id: str) -> EvaluationMetricsResponse:
    """Retrieve evaluation metrics with formal mathematical definitions."""
    return evaluation_service.get_evaluation_metrics(evaluation_id)


@router.get(
    "/{evaluation_id}/breakdown",
    response_model=EvaluationBreakdownResponse,
    summary="Get per-sensor and per-fault breakdowns",
    description="Retrieve isolated performance breakdown grouped by synthetic fault type and by sensor telemetry channel.",
)
async def get_evaluation_breakdown(evaluation_id: str) -> EvaluationBreakdownResponse:
    """Retrieve per-sensor and per-fault breakdowns."""
    return evaluation_service.get_evaluation_breakdown(evaluation_id)


@router.get(
    "/{evaluation_id}/manifest",
    response_model=EvaluationManifestResponse,
    summary="Get machine-readable ground truth manifest",
    description="Retrieve or download the complete machine-readable manifest recording every injected synthetic modification.",
)
async def get_evaluation_manifest(evaluation_id: str) -> EvaluationManifestResponse:
    """Retrieve machine-readable fault injection manifest."""
    return evaluation_service.get_evaluation_manifest(evaluation_id)


@router.post(
    "/{evaluation_id}/validate",
    response_model=EvaluationValidationResponse,
    summary="Perform non-destructive consistency validation",
    description="Verify mathematical identities, ground truth alignments, and confirm that source dataset remains immutable and uncorrupted.",
)
async def validate_evaluation(evaluation_id: str) -> EvaluationValidationResponse:
    """Execute non-destructive consistency checks on an evaluation."""
    return evaluation_service.validate_evaluation(evaluation_id)
