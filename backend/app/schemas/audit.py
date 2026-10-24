"""Pydantic schemas and models for KINTSUGI Audit Trail and Explainability Engine (Phase 8)."""

from enum import Enum
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class AuditEventType(str, Enum):
    """Categorized event types recorded in the append-only audit ledger."""

    # Dataset events
    DATASET_UPLOADED = "DATASET_UPLOADED"
    DATASET_VALIDATED = "DATASET_VALIDATED"
    DATASET_VALIDATION_FAILED = "DATASET_VALIDATION_FAILED"

    # Pipeline events
    PIPELINE_CREATED = "PIPELINE_CREATED"
    PIPELINE_UPDATED = "PIPELINE_UPDATED"
    PIPELINE_VALIDATED = "PIPELINE_VALIDATED"

    # Detection events
    DETECTION_RUN_STARTED = "DETECTION_RUN_STARTED"
    DETECTION_RUN_COMPLETED = "DETECTION_RUN_COMPLETED"
    DETECTION_RUN_FAILED = "DETECTION_RUN_FAILED"
    ANOMALY_DETECTED = "ANOMALY_DETECTED"

    # Reconstruction events
    RECONSTRUCTION_RUN_STARTED = "RECONSTRUCTION_RUN_STARTED"
    RECONSTRUCTION_RUN_COMPLETED = "RECONSTRUCTION_RUN_COMPLETED"
    RECONSTRUCTION_RUN_FAILED = "RECONSTRUCTION_RUN_FAILED"
    VALUE_PROPOSED = "VALUE_PROPOSED"
    CORRECTION_ACCEPTED = "CORRECTION_ACCEPTED"
    CORRECTION_REJECTED = "CORRECTION_REJECTED"
    RECONSTRUCTION_UNRESOLVED = "RECONSTRUCTION_UNRESOLVED"

    # Review events
    REVIEW_REQUESTED = "REVIEW_REQUESTED"
    REVIEW_APPROVED = "REVIEW_APPROVED"
    REVIEW_REJECTED = "REVIEW_REJECTED"
    REVIEW_COMMENT_ADDED = "REVIEW_COMMENT_ADDED"

    # Evaluation events
    EVALUATION_STARTED = "EVALUATION_STARTED"
    EVALUATION_COMPLETED = "EVALUATION_COMPLETED"
    EVALUATION_FAILED = "EVALUATION_FAILED"

    # System events
    OPERATION_RETRIED = "OPERATION_RETRIED"
    OPERATION_PARTIALLY_COMPLETED = "OPERATION_PARTIALLY_COMPLETED"


class AuditEvent(BaseModel):
    """
    Append-only immutable record representing a discrete pipeline decision or lifecycle event.
    Linked in a cryptographic SHA-256 hash chain with canonicalized payload serialization.
    """

    event_id: str = Field(description="Unique event identifier (e.g. evt_...).")
    event_type: AuditEventType = Field(description="Standardized event category.")
    schema_version: str = Field(default="1.0.0", description="Audit event schema version.")
    sequence_number: int = Field(description="Strict monotonically increasing event sequence counter (1-indexed).")
    timestamp: str = Field(description="UTC ISO-8601 timestamp when the event was recorded.")

    # Target entity references
    dataset_id: Optional[str] = Field(default=None, description="Associated source dataset ID.")
    source_row_index: Optional[int] = Field(default=None, description="0-indexed source dataset row position.")
    sensor_column: Optional[str] = Field(default=None, description="Target numeric sensor column name.")
    pipeline_id: Optional[str] = Field(default=None, description="Pipeline configuration ID.")
    pipeline_version: Optional[int] = Field(default=None, description="Pipeline configuration version number.")
    detection_run_id: Optional[str] = Field(default=None, description="Associated detection run ID.")
    anomaly_id: Optional[str] = Field(default=None, description="Associated anomaly record ID.")
    reconstruction_run_id: Optional[str] = Field(default=None, description="Associated reconstruction run ID.")
    reconstruction_result_id: Optional[str] = Field(default=None, description="Associated reconstruction result ID.")
    evaluation_run_id: Optional[str] = Field(default=None, description="Associated evaluation run ID.")
    previous_event_id: Optional[str] = Field(default=None, description="Preceding related event ID in causal sequence.")

    # Value transitions
    original_value: Optional[float] = Field(default=None, description="Preserved original raw sensor measurement.")
    proposed_value: Optional[float] = Field(default=None, description="Candidate algorithmic reconstruction value.")
    final_value: Optional[float] = Field(default=None, description="Final committed value in downstream export.")
    previous_status: Optional[str] = Field(default=None, description="Observation status prior to event transition.")
    new_status: Optional[str] = Field(default=None, description="New observation status after event transition.")

    # Algorithmic methods & evidence
    detection_method: Optional[str] = Field(default=None, description="Detector algorithm name (e.g. statistical_mad, isolation_forest).")
    reconstruction_method: Optional[str] = Field(default=None, description="Reconstruction algorithm name.")
    confidence_score: Optional[float] = Field(default=None, description="Contextual confidence score (0-100).")
    confidence_breakdown: Optional[Dict[str, float]] = Field(default=None, description="Sub-factor breakdown scores.")
    evidence_references: Optional[Dict[str, Any]] = Field(default=None, description="Pointers to neighbor observations or cross-sensor evidence.")

    # Decision & validation outcomes
    decision_reason: Optional[str] = Field(default=None, description="Human/algorithmic rationale for decision.")
    validation_outcomes: Optional[Dict[str, Any]] = Field(default=None, description="Consistency, bounds, or cross-sensor check results.")
    processing_outcome: Optional[str] = Field(default=None, description="Success, failure, or partial completion indicator.")
    error_details: Optional[str] = Field(default=None, description="Sanitized error description if operation failed.")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Safe auxiliary metadata (no secrets/credentials).")

    # Cryptographic Hash Chain Linkage
    previous_hash: str = Field(description="SHA-256 digest of the immediately preceding audit event ('0'*64 for genesis).")
    event_hash: str = Field(description="SHA-256 digest over the canonicalized payload concatenated with previous_hash.")


class DetectionExplanation(BaseModel):
    """Structured, auditable explanation for why an observation was flagged as an anomaly."""

    detector_name: str
    detector_scores: Dict[str, float]
    thresholds: Dict[str, Any]
    observation_index: int
    sensor_column: str
    original_value: Optional[float]
    neighbor_observations: List[Dict[str, Any]] = Field(default_factory=list)
    consensus: str
    agreement_summary: str
    flagged_reason: str


class ReconstructionExplanation(BaseModel):
    """Structured, auditable explanation for a proposed or committed signal repair."""

    original_value: Optional[float]
    proposed_value: Optional[float]
    final_value: Optional[float]
    reconstruction_method: str
    supporting_observation_indices: List[int] = Field(default_factory=list)
    supporting_values: List[float] = Field(default_factory=list)
    valid_neighbors_count: int
    confidence_score: float
    confidence_breakdown: Dict[str, float] = Field(default_factory=dict)
    cross_sensor_validation: Optional[Dict[str, Any]] = None
    policy_outcome: str
    decision_reason: str


class EvaluationExplanation(BaseModel):
    """Structured explanation of evaluation outcomes and benchmark comparisons."""

    evaluation_mode: str
    ground_truth_source: str
    manifest_ref: Optional[str] = None
    metric_definitions: Dict[str, str] = Field(default_factory=dict)
    eligible_observations_count: int
    results_summary: Dict[str, Any] = Field(default_factory=dict)
    unavailable_metrics: List[str] = Field(default_factory=list)
    unavailable_reasons: Dict[str, str] = Field(default_factory=dict)


class CausalTraceStep(BaseModel):
    """Single discrete chronological step in the lifecycle of an observation."""

    step_index: int
    stage: str = Field(description="Lifecycle stage (e.g. OBSERVATION, DETECTION, RECONSTRUCTION, REVIEW, EVALUATION).")
    event_id: Optional[str] = None
    title: str
    timestamp: Optional[str] = None
    status: Optional[str] = None
    details: Dict[str, Any] = Field(default_factory=dict)


class CausalTraceResponse(BaseModel):
    """Complete causal provenance trace for an observation from ingestion to resolution."""

    reconstruction_result_id: str
    anomaly_id: Optional[str] = None
    source_row_index: int
    sensor_column: str
    dataset_id: str
    pipeline_id: str
    detection_run_id: str
    reconstruction_run_id: str
    raw_value: Optional[float] = None
    proposed_value: Optional[float] = None
    final_value: Optional[float] = None
    final_status: str
    confidence_score: float
    detection_explanation: Optional[DetectionExplanation] = None
    reconstruction_explanation: Optional[ReconstructionExplanation] = None
    evaluation_explanation: Optional[EvaluationExplanation] = None
    trace_steps: List[CausalTraceStep] = Field(default_factory=list)
    events: List[AuditEvent] = Field(default_factory=list)


class ObservationHistoryResponse(BaseModel):
    """Chronological audit history and lifecycle record for a specific source dataset row."""

    dataset_id: str
    source_row_index: int
    row_values: Dict[str, Any] = Field(default_factory=dict)
    events: List[AuditEvent] = Field(default_factory=list)
    anomalies: List[Dict[str, Any]] = Field(default_factory=list)
    reconstructions: List[Dict[str, Any]] = Field(default_factory=list)


class HashChainVerificationResponse(BaseModel):
    """Integrity audit result for the sequential SHA-256 event hash chain."""

    is_valid: bool
    total_events_checked: int
    genesis_hash: str
    latest_hash: str
    errors: List[str] = Field(default_factory=list)
    verified_at: str
    limitations: List[str] = Field(default_factory=list)


class AuditEventListResponse(BaseModel):
    """Paginated collection of audit events."""

    events: List[AuditEvent]
    total: int
    limit: int
    offset: int
