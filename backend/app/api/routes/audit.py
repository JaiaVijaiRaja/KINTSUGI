"""FastAPI route handlers for KINTSUGI Audit Trail and Explainability Engine (Phase 8)."""

from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response, status

from app.schemas.audit import (
    AuditEvent,
    AuditEventListResponse,
    CausalTraceResponse,
    HashChainVerificationResponse,
    ObservationHistoryResponse,
)
from app.services.audit_service import audit_service

router = APIRouter(prefix="/audit", tags=["Audit Trail"])


@router.get(
    "/events",
    response_model=AuditEventListResponse,
    summary="List audit events",
    description="Query chronological append-only audit ledger events with pagination and filters.",
)
def list_audit_events(
    dataset_id: Optional[str] = Query(None, description="Filter by source dataset ID"),
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline configuration ID"),
    event_type: Optional[str] = Query(None, description="Filter by standardized event type"),
    sensor_column: Optional[str] = Query(None, description="Filter by target sensor column"),
    run_id: Optional[str] = Query(None, description="Filter by detection, reconstruction, or evaluation run ID"),
    status: Optional[str] = Query(None, description="Filter by observation status or processing outcome"),
    start_time: Optional[str] = Query(None, description="Filter events on or after UTC ISO timestamp"),
    end_time: Optional[str] = Query(None, description="Filter events on or before UTC ISO timestamp"),
    limit: int = Query(50, ge=1, le=500, description="Maximum number of events to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> AuditEventListResponse:
    return audit_service.list_events(
        dataset_id=dataset_id,
        pipeline_id=pipeline_id,
        event_type=event_type,
        sensor_column=sensor_column,
        run_id=run_id,
        status=status,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/events/{event_id}",
    response_model=AuditEvent,
    summary="Get audit event by ID",
    description="Retrieve a single audit event record including its cryptographic hash chain digests.",
)
def get_audit_event(event_id: str) -> AuditEvent:
    return audit_service.get_event(event_id)


@router.get(
    "/observations/{dataset_id}/{row_id}",
    response_model=ObservationHistoryResponse,
    summary="Get observation audit history",
    description="Retrieve complete observation lifecycle history, raw values, and transitions for a dataset row index.",
)
def get_observation_history(dataset_id: str, row_id: int) -> ObservationHistoryResponse:
    if row_id < 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Row index must be a non-negative integer.",
        )
    return audit_service.get_observation_history(dataset_id=dataset_id, row_id=row_id)


@router.get(
    "/traces/{reconstruction_result_id}",
    response_model=CausalTraceResponse,
    summary="Get causal trace for a reconstruction result",
    description="Assemble end-to-end causal provenance trace: Observation -> Detector -> Anomaly -> Reconstruction -> Confidence -> Review -> Benchmark.",
)
def get_causal_trace(reconstruction_result_id: str) -> CausalTraceResponse:
    return audit_service.get_causal_trace(reconstruction_result_id)


@router.get(
    "/runs/{run_id}",
    response_model=AuditEventListResponse,
    summary="Get audit events for a run",
    description="Retrieve all audit records associated with a specific detection, reconstruction, or evaluation run.",
)
def get_run_audit_events(
    run_id: str,
    limit: int = Query(200, ge=1, le=1000, description="Maximum events to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
) -> AuditEventListResponse:
    return audit_service.get_run_events(run_id=run_id, limit=limit, offset=offset)


@router.post(
    "/verify",
    response_model=HashChainVerificationResponse,
    summary="Verify cryptographic hash chain integrity",
    description="Recomputes SHA-256 digests across the entire append-only audit event chain to detect tampering or corruption.",
)
def verify_hash_chain() -> HashChainVerificationResponse:
    return audit_service.verify_hash_chain()


@router.get(
    "/export",
    summary="Export audit ledger records",
    description="Export filtered audit trail records in JSONL or CSV format for regulatory compliance.",
)
def export_audit_events(
    format: str = Query("jsonl", pattern="^(jsonl|csv)$", description="Export format: 'jsonl' or 'csv'"),
    dataset_id: Optional[str] = Query(None, description="Filter by source dataset ID"),
    pipeline_id: Optional[str] = Query(None, description="Filter by pipeline configuration ID"),
    event_type: Optional[str] = Query(None, description="Filter by standardized event type"),
    sensor_column: Optional[str] = Query(None, description="Filter by target sensor column"),
    run_id: Optional[str] = Query(None, description="Filter by run ID"),
    status: Optional[str] = Query(None, description="Filter by status"),
    start_time: Optional[str] = Query(None, description="Filter on or after start time"),
    end_time: Optional[str] = Query(None, description="Filter on or before end time"),
    limit: int = Query(1000, ge=1, le=10000, description="Maximum records to export (up to 10,000)"),
) -> Response:
    content, media_type = audit_service.export_events(
        format_type=format,
        dataset_id=dataset_id,
        pipeline_id=pipeline_id,
        event_type=event_type,
        sensor_column=sensor_column,
        run_id=run_id,
        status=status,
        start_time=start_time,
        end_time=end_time,
        limit=limit,
    )

    ext = "csv" if format == "csv" else "jsonl"
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"kintsugi_audit_export_{ts}.{ext}"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
