"""API endpoints for querying and retrieving detected sensor anomaly records."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query, status

from app.schemas.anomaly import AnomalyListResponse, AnomalyRecord
from app.services.detection_service import detection_service

router = APIRouter(prefix="/anomalies", tags=["Anomalies"])


@router.get(
    "",
    response_model=AnomalyListResponse,
    summary="List and filter anomalies",
    description="Retrieve detected anomaly records across runs with filtering by dataset, run, sensor channel, detector, and severity.",
)
async def list_anomalies(
    dataset_id: Optional[str] = Query(None, description="Filter by source dataset ID"),
    run_id: Optional[str] = Query(None, description="Filter by detection run ID"),
    sensor_column: Optional[str] = Query(None, description="Filter by sensor column name"),
    detector_name: Optional[str] = Query(None, description="Filter by detector algorithm name"),
    severity: Optional[str] = Query(None, description="Filter by severity level (CRITICAL, HIGH, MEDIUM, LOW)"),
    limit: int = Query(50, ge=1, le=1000, description="Maximum number of records to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> AnomalyListResponse:
    """Retrieve filtered anomaly records."""
    return detection_service.list_anomalies(
        dataset_id=dataset_id,
        run_id=run_id,
        sensor_column=sensor_column,
        detector_name=detector_name,
        severity=severity,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/{anomaly_id}",
    response_model=AnomalyRecord,
    summary="Get anomaly details",
    description="Retrieve detailed information for a specific detected anomaly record by its unique identifier.",
)
async def get_anomaly(anomaly_id: str) -> AnomalyRecord:
    """Lookup a single anomaly record by ID."""
    return detection_service.get_anomaly_by_id(anomaly_id)
