"""API endpoints for KINTSUGI signal reconstruction runs, results, and operator review decisions."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.reconstruction import (
    ReconstructionRecord,
    ReconstructionResultsResponse,
    ReconstructionRun,
    ReconstructionRunListResponse,
    ReviewDecisionRequest,
)
from app.services.reconstruction_service import reconstruction_service

router = APIRouter(prefix="/reconstruction", tags=["Reconstruction"])


@router.get(
    "/runs",
    response_model=ReconstructionRunListResponse,
    summary="List reconstruction runs",
    description="Retrieve historical signal reconstruction runs with filtering by pipeline or source detection run.",
)
async def list_reconstruction_runs(
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline configuration ID"),
    detection_run_id: Optional[str] = Query(None, description="Filter by detection run ID"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of runs to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> ReconstructionRunListResponse:
    """List historical reconstruction runs."""
    return reconstruction_service.list_reconstruction_runs(
        pipeline_id=pipeline_id,
        detection_run_id=detection_run_id,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/runs/{reconstruction_run_id}",
    response_model=ReconstructionRun,
    summary="Get reconstruction run status and summary",
    description="Retrieve execution state, summary metrics, and status breakdown for a specific reconstruction run.",
)
async def get_reconstruction_run(reconstruction_run_id: str) -> ReconstructionRun:
    """Retrieve metadata and summary for a single reconstruction run."""
    return reconstruction_service.get_reconstruction_run(reconstruction_run_id)


@router.get(
    "/runs/{reconstruction_run_id}/results",
    response_model=ReconstructionResultsResponse,
    summary="Get reconstruction results for a run",
    description="Retrieve paginated individual reconstruction records with filtering by sensor channel and processing status.",
)
async def get_reconstruction_run_results(
    reconstruction_run_id: str,
    sensor_column: Optional[str] = Query(None, description="Filter by sensor channel name"),
    status: Optional[str] = Query(None, description="Filter by status (MEASURED, ESTIMATED, CORRECTED, UNRESOLVED)"),
    limit: int = Query(50, ge=1, le=500, description="Maximum records per page"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> ReconstructionResultsResponse:
    """Retrieve filtered and paginated reconstruction records."""
    return reconstruction_service.get_reconstruction_results(
        reconstruction_run_id=reconstruction_run_id,
        sensor_column=sensor_column,
        status=status,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/results/{result_id}",
    response_model=ReconstructionRecord,
    summary="Get single reconstruction record",
    description="Retrieve full audit details, supporting evidence references, and confidence factor breakdown for an individual observation.",
)
async def get_reconstruction_result(result_id: str) -> ReconstructionRecord:
    """Lookup an individual reconstruction record by ID."""
    return reconstruction_service.get_result_by_id(result_id)


@router.post(
    "/results/{result_id}/review",
    response_model=ReconstructionRecord,
    summary="Submit operator review decision",
    description="Record an explicit human review decision (ACCEPT, REJECT, or MODIFY) for a candidate signal repair.",
)
async def review_reconstruction_result(
    result_id: str,
    decision_payload: ReviewDecisionRequest,
) -> ReconstructionRecord:
    """Record an operator review decision on a signal repair proposal."""
    return reconstruction_service.review_result(
        result_id=result_id,
        decision_req=decision_payload,
    )
