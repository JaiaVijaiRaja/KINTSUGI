"""API endpoints for KINTSUGI signal reconstruction runs, results, and operator review decisions."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status

from app.schemas.reconstruction import (
    ReconstructionRecord,
    ReconstructionResultsResponse,
    ReconstructionRun,
    ReconstructionRunListResponse,
    ReconstructionRunResponse,
    ReviewDecisionRequest,
)
from app.services.reconstruction_service import reconstruction_service

router = APIRouter(prefix="/reconstruction", tags=["Reconstruction"])


@router.get(
    "/runs",
    response_model=ReconstructionRunListResponse,
    summary="List reconstruction runs",
    description="Retrieve historical signal reconstruction runs with filtering by pipeline, dataset, or source detection run.",
)
async def list_reconstruction_runs(
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline configuration ID"),
    detection_run_id: Optional[str] = Query(None, description="Filter by detection run ID"),
    dataset_id: Optional[str] = Query(None, description="Filter by target dataset ID"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of runs to return"),
    offset: int = Query(0, ge=0, description="Pagination offset"),
) -> ReconstructionRunListResponse:
    """List historical reconstruction runs."""
    return reconstruction_service.list_reconstruction_runs(
        pipeline_id=pipeline_id,
        detection_run_id=detection_run_id,
        dataset_id=dataset_id,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/execute-for-dataset/{dataset_id}",
    response_model=ReconstructionRunResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Execute end-to-end signal recovery for dataset",
    description="Validates target dataset, configures recovery pipeline, runs anomaly detection, and executes confidence-aware signal repair.",
)
async def execute_recovery_for_dataset(
    dataset_id: str,
    allow_automatic_correction: bool = Query(True, description="Permit automatic correction when confidence threshold is satisfied"),
) -> ReconstructionRunResponse:
    """Execute end-to-end signal recovery on a selected dataset."""
    return reconstruction_service.execute_recovery_for_dataset(
        dataset_id=dataset_id,
        allow_automatic_correction=allow_automatic_correction,
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


@router.get(
    "/runs/{reconstruction_run_id}/export",
    summary="Export reconstructed dataset",
    description="Export full dataset incorporating genuine signal repairs, provenance status columns, and confidence evidence.",
)
async def export_reconstructed_dataset(
    reconstruction_run_id: str,
    format: str = Query("csv", pattern="^(csv|json)$", description="Export format: 'csv' or 'json'"),
) -> Response:
    """Download export of repaired dataset with provenance statuses."""
    content, media_type = reconstruction_service.export_reconstructed_dataset(
        reconstruction_run_id=reconstruction_run_id,
        format_type=format,
    )
    ext = "csv" if format == "csv" else "json"
    filename = f"kintsugi_reconstruction_{reconstruction_run_id}.{ext}"
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
