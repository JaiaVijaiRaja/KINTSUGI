from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class NumericStats(BaseModel):
    """Descriptive statistics for numeric sensor or parameter columns."""
    min: float
    max: float
    mean: float
    std: Optional[float] = None
    median: float
    q25: Optional[float] = None
    q75: Optional[float] = None


class ColumnSummary(BaseModel):
    """Metadata and quality metrics for an individual dataset column."""
    name: str
    detected_type: str = Field(..., description="'float', 'integer', 'string', 'boolean', 'datetime'")
    is_numeric: bool
    missing_count: int
    missing_percentage: float
    unique_count: int
    sample_values: List[Any] = Field(default_factory=list)
    numeric_stats: Optional[NumericStats] = None


class TimestampCandidate(BaseModel):
    """Evaluated potential timestamp column with parseability and duplicate analysis."""
    column_name: str
    parseable_percentage: float
    sample_format: Optional[str] = None
    duplicate_timestamp_count: int
    duplicate_percentage: float
    is_monotonic: bool
    notes: Optional[str] = None


class DataQualitySummary(BaseModel):
    """Genuine data-quality analysis calculated by the Python backend engine."""
    dataset_id: str
    total_rows: int
    total_columns: int
    duplicate_rows_count: int
    duplicate_rows_percentage: float
    total_missing_cells: int
    missing_cells_percentage: float
    timestamp_candidates: List[TimestampCandidate] = Field(default_factory=list)
    columns: List[ColumnSummary] = Field(default_factory=list)
    computed_at: str


class DatasetMetadata(BaseModel):
    """Core metadata describing an ingested telemetry dataset."""
    dataset_id: str
    filename: str
    file_size_bytes: int
    row_count: int
    column_count: int
    columns: List[str]
    uploaded_at: str
    parsing_status: str = Field(default="ready", description="'ready' or 'error'")
    quality_available: bool = True


class DatasetDetailResponse(BaseModel):
    """Combined metadata and calculated quality report for a dataset."""
    metadata: DatasetMetadata
    quality: DataQualitySummary


class DatasetPreviewResponse(BaseModel):
    """Bounded tabular preview of actual dataset rows."""
    dataset_id: str
    columns: List[str]
    rows: List[Dict[str, Any]]
    total_rows: int
    preview_rows: int
    offset: int
    limit: int


class DatasetListResponse(BaseModel):
    """Collection of cataloged datasets."""
    datasets: List[DatasetMetadata]
    total: int
