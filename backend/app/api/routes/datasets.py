from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

from app.schemas.dataset import (
    DataQualitySummary,
    DatasetDetailResponse,
    DatasetListResponse,
    DatasetMetadata,
    DatasetPreviewResponse,
    LoadDemoRequest,
)
from app.services.dataset_service import dataset_service

router = APIRouter(prefix="/datasets", tags=["Datasets"])


@router.post(
    "/upload",
    response_model=DatasetDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload & Ingest CSV Telemetry Dataset",
    description="Validate, parse, store CSV dataset, and compute genuine data quality metrics.",
)
async def upload_dataset(file: UploadFile = File(...)) -> DatasetDetailResponse:
    """Accept multipart/form-data CSV, validate, store locally, and return computed quality metrics."""
    return await dataset_service.ingest_dataset(file)


@router.post(
    "/load-demo",
    response_model=DatasetDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Pre-load Deterministic Demo Dataset",
    description="Ingest pre-configured Demo 1 or Demo 2 industrial telemetry dataset into local storage.",
)
def load_demo_dataset(payload: LoadDemoRequest) -> DatasetDetailResponse:
    """Load and ingest Demo 1 or Demo 2 dataset into local storage."""
    return dataset_service.ingest_demo_dataset(payload.demo_id)


@router.get(
    "",
    response_model=DatasetListResponse,
    summary="List Registered Datasets",
    description="Return metadata for all datasets successfully cataloged in local storage.",
)
def list_datasets() -> DatasetListResponse:
    """List all registered datasets sorted by upload timestamp."""
    return dataset_service.list_datasets()


@router.get(
    "/{dataset_id}",
    response_model=DatasetMetadata,
    summary="Get Dataset Metadata",
    description="Return metadata, schema, and column count for a specific dataset ID.",
)
def get_dataset(dataset_id: str) -> DatasetMetadata:
    """Retrieve metadata for the requested dataset."""
    return dataset_service.get_dataset_metadata(dataset_id)


@router.get(
    "/{dataset_id}/preview",
    response_model=DatasetPreviewResponse,
    summary="Preview Dataset Rows",
    description="Return a bounded tabular preview of actual rows from the stored CSV dataset.",
)
def get_dataset_preview(
    dataset_id: str,
    limit: int = Query(default=50, ge=1, le=500, description="Number of rows to preview"),
    offset: int = Query(default=0, ge=0, description="Row offset from start"),
) -> DatasetPreviewResponse:
    """Return bounded chunk of rows for inspection in the UI."""
    return dataset_service.get_dataset_preview(dataset_id, limit=limit, offset=offset)


@router.get(
    "/{dataset_id}/quality",
    response_model=DataQualitySummary,
    summary="Get Data Quality Summary",
    description="Return calculated data-quality report including missing values, duplicates, and timestamp analysis.",
)
def get_dataset_quality(dataset_id: str) -> DataQualitySummary:
    """Retrieve computed data quality analysis."""
    return dataset_service.get_dataset_quality(dataset_id)
