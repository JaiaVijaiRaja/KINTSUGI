from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class DetectorResultDetail(BaseModel):
    """Detailed result produced by an individual detector for a specific observation."""
    detector_name: str
    flagged: bool
    score: Optional[float] = None
    reason: str
    threshold: Optional[float] = None
    baseline: Optional[float] = None
    dispersion: Optional[float] = None


AnomalySeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
ConsensusType = Literal["SINGLE_DETECTOR", "MULTI_DETECTOR", "NORMAL", "UNASSESSED"]
DetectionRunStatus = Literal["pending", "running", "completed", "failed", "partial_failure"]


class AnomalyRecord(BaseModel):
    """Individual flagged sensor anomaly observation."""
    anomaly_id: str = Field(..., description="Server-generated unique identifier ('anom_' + hex)")
    run_id: str = Field(..., description="Identifier of the detection run that produced this record")
    dataset_id: str = Field(..., description="Target dataset identifier")
    configuration_id: str = Field(..., description="Pipeline configuration identifier")
    sensor_column: str = Field(..., description="Sensor column name where anomaly occurred")
    source_row_index: int = Field(..., description="0-indexed position in source CSV file")
    timestamp: Optional[str] = Field(default=None, description="Original timestamp value if present")
    original_value: Optional[float] = Field(default=None, description="Exact unaltered raw measurement")
    detector_name: str = Field(..., description="Detectors that flagged this observation")
    detector_score: Optional[float] = Field(default=None, description="Algorithm-specific anomaly score (not a probability)")
    detection_reason: str = Field(..., description="Detailed explanation of anomaly detection logic")
    severity: AnomalySeverity = Field(default="MEDIUM", description="Severity classification based on deviation magnitude and consensus")
    flagged_status: str = Field(default="FLAGGED", description="Current status of the anomaly")
    consensus: ConsensusType = Field(default="SINGLE_DETECTOR", description="Whether single or multiple detectors agreed")
    detectors_flagged: List[str] = Field(default_factory=list, description="List of detector names that flagged this observation")
    detector_details: Dict[str, DetectorResultDetail] = Field(default_factory=dict, description="Per-detector outputs")


class RunSummary(BaseModel):
    """Summary metrics for a completed or partial detection run."""
    total_rows_analyzed: int
    total_anomalies_detected: int
    anomalies_by_sensor: Dict[str, int] = Field(default_factory=dict)
    anomalies_by_detector: Dict[str, int] = Field(default_factory=dict)
    anomalies_by_severity: Dict[str, int] = Field(default_factory=dict)
    multi_detector_consensus_count: int = 0
    unusable_rows_count: int = 0


class DetectionRun(BaseModel):
    """Full persisted detection run specification and execution state."""
    run_id: str = Field(..., description="Server-generated unique identifier ('run_' + hex)")
    dataset_id: str
    configuration_id: str
    configuration_version: int = 1
    status: DetectionRunStatus = "completed"
    start_time: str
    completion_time: Optional[str] = None
    detector_methods: List[str] = Field(default_factory=list)
    summary: RunSummary
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class AnomalyListResponse(BaseModel):
    """Paginated collection of anomaly records."""
    anomalies: List[AnomalyRecord]
    total: int
    limit: int
    offset: int


class DetectionRunResponse(BaseModel):
    """Response returned upon initiating or checking a detection run."""
    run: DetectionRun
    sample_anomalies: List[AnomalyRecord] = Field(default_factory=list)


class DetectionRunResultsResponse(BaseModel):
    """Complete paginated detection results for a specific run."""
    run_id: str
    dataset_id: str
    configuration_id: str
    summary: RunSummary
    total_anomalies: int
    anomalies: List[AnomalyRecord]
    limit: int
    offset: int
