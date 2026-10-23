"""Pydantic models for KINTSUGI Phase 6: Confidence-Aware Data Reconstruction Engine."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


ProcessingStatus = Literal["MEASURED", "ESTIMATED", "CORRECTED", "UNRESOLVED"]
ReconstructionMethod = Literal["linear_interpolation", "local_median", "cross_sensor", "none"]
ReconstructionRunStatus = Literal["pending", "running", "completed", "failed", "partial_failure"]
ReviewDecision = Literal["ACCEPT", "REJECT", "MODIFY"]


class ConfidenceBreakdown(BaseModel):
    """Transparent, machine-readable breakdown of evidence-based confidence scoring factors (0 to 100)."""
    neighbor_count_score: float = Field(..., ge=0.0, le=25.0, description="Score based on available valid neighbors (0-25)")
    method_agreement_score: float = Field(..., ge=0.0, le=25.0, description="Score based on concordance between independent methods (0-25)")
    temporal_proximity_score: float = Field(..., ge=0.0, le=20.0, description="Score based on distance / gap size penalty (0-20)")
    local_variance_score: float = Field(..., ge=0.0, le=15.0, description="Score based on local signal dispersion stability (0-15)")
    neighbor_cleanliness_score: float = Field(..., ge=0.0, le=15.0, description="Score based on absence of anomaly flags on neighbors (0-15)")
    cross_sensor_score: float = Field(default=0.0, ge=-25.0, le=15.0, description="Corroboration bonus or conflict penalty from cross-sensor models")
    total_score: float = Field(..., ge=0.0, le=100.0, description="Consolidated confidence score (0 to 100; NOT a calibrated probability)")
    penalty_reasons: List[str] = Field(default_factory=list, description="Explanations for applied confidence deductions")


class EvidenceReference(BaseModel):
    """Reference to a specific supporting observation used as evidence for reconstruction."""
    source_row_index: int = Field(..., description="Source CSV 0-indexed row position of supporting observation")
    timestamp: Optional[str] = Field(default=None, description="Timestamp of supporting observation")
    sensor_column: str = Field(..., description="Sensor column of supporting observation")
    value: float = Field(..., description="Observed sensor value")
    distance: float = Field(..., description="Temporal or row distance from target point")
    weight: float = Field(default=1.0, description="Relative weight assigned in estimation")
    is_anomaly: bool = Field(default=False, description="Whether this supporting observation was itself flagged as an anomaly")


class ReconstructionRecord(BaseModel):
    """Audit record of a signal repair evaluation, candidate proposal, and final accepted value."""
    result_id: str = Field(..., description="Server-controlled unique result identifier ('rec_res_' + hex)")
    reconstruction_run_id: str = Field(..., description="Identifier of the reconstruction run")
    detection_run_id: str = Field(..., description="Source anomaly detection run ID")
    anomaly_id: Optional[str] = Field(default=None, description="Original anomaly ID if this observation was flagged")
    dataset_id: str = Field(..., description="Target dataset ID")
    configuration_id: str = Field(..., description="Pipeline configuration ID")
    sensor_column: str = Field(..., description="Sensor channel name")
    source_row_index: int = Field(..., description="0-indexed position in source CSV file")
    timestamp: Optional[str] = Field(default=None, description="Original timestamp value if present")
    original_value: Optional[float] = Field(default=None, description="Exact unaltered raw measurement (never modified)")
    proposed_value: Optional[float] = Field(default=None, description="Candidate reconstructed value if generated")
    final_value: Optional[float] = Field(default=None, description="Final committed value (original value if UNRESOLVED, proposed if CORRECTED)")
    method: ReconstructionMethod = Field(default="none", description="Reconstruction algorithm used")
    status: ProcessingStatus = Field(..., description="Processing status: MEASURED, ESTIMATED, CORRECTED, or UNRESOLVED")
    confidence_score: float = Field(default=0.0, ge=0.0, le=100.0, description="Evidence-based confidence score (0 to 100)")
    confidence_breakdown: ConfidenceBreakdown = Field(..., description="Breakdown of factors contributing to confidence")
    evidence_summary: str = Field(..., description="Human-readable summary of supporting evidence")
    evidence_references: List[EvidenceReference] = Field(default_factory=list, description="Discrete supporting observations")
    abstention_reason: Optional[str] = Field(default=None, description="Detailed reason if system abstained as UNRESOLVED")
    is_reviewed: bool = Field(default=False, description="Whether an explicit operator review decision was recorded")
    reviewed_by: Optional[str] = Field(default=None, description="Reviewer name / identifier")
    review_decision: Optional[ReviewDecision] = Field(default=None, description="Operator decision: ACCEPT, REJECT, or MODIFY")
    review_comment: Optional[str] = Field(default=None, description="Operator rationale for review decision")
    reviewed_at: Optional[str] = Field(default=None, description="ISO-8601 UTC timestamp of review decision")
    created_at: str = Field(..., description="ISO-8601 UTC timestamp of initial reconstruction")


class ReconstructionSummary(BaseModel):
    """Aggregate metrics and status counts for a reconstruction run."""
    total_evaluated: int = Field(..., ge=0)
    measured_count: int = Field(default=0, ge=0)
    estimated_count: int = Field(default=0, ge=0)
    corrected_count: int = Field(default=0, ge=0)
    unresolved_count: int = Field(default=0, ge=0)
    average_confidence: float = Field(default=0.0, ge=0.0, le=100.0)
    anomalies_reconstructed_count: int = Field(default=0, ge=0)
    by_sensor: Dict[str, Dict[str, int]] = Field(default_factory=dict)
    by_method: Dict[str, int] = Field(default_factory=dict)


class ReconstructionRun(BaseModel):
    """Persisted reconstruction execution metadata, configuration reference, and summary counts."""
    reconstruction_run_id: str = Field(..., description="Server-controlled unique run identifier ('rec_run_' + hex)")
    detection_run_id: str = Field(..., description="Source detection run ID")
    pipeline_id: str = Field(..., description="Pipeline configuration ID")
    dataset_id: str = Field(..., description="Target dataset ID")
    configuration_version: int = Field(default=1, ge=1)
    status: ReconstructionRunStatus = Field(default="completed")
    start_time: str
    completion_time: Optional[str] = None
    summary: ReconstructionSummary
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ReconstructionRunResponse(BaseModel):
    """Envelope returned when a reconstruction run is triggered or inspected."""
    run: ReconstructionRun
    sample_results: List[ReconstructionRecord] = Field(default_factory=list)


class ReconstructionRunListResponse(BaseModel):
    """Envelope for listing reconstruction runs."""
    runs: List[ReconstructionRun]
    total: int


class ReconstructionResultsResponse(BaseModel):
    """Paginated response containing reconstruction records for a specific run."""
    reconstruction_run_id: str
    detection_run_id: str
    pipeline_id: str
    dataset_id: str
    summary: ReconstructionSummary
    total_results: int
    results: List[ReconstructionRecord]
    limit: int
    offset: int


class ReviewDecisionRequest(BaseModel):
    """Payload to record an operator review decision on a reconstruction result."""
    decision: ReviewDecision = Field(..., description="Operator decision: ACCEPT (commit proposed), REJECT (abstain as UNRESOLVED), MODIFY (commit custom value)")
    modified_value: Optional[float] = Field(default=None, description="Custom value when decision is MODIFY")
    reviewer_name: Optional[str] = Field(default="operator_local", description="Identifier of the operator performing review")
    review_comment: Optional[str] = Field(default=None, description="Optional rationale or justification note")
