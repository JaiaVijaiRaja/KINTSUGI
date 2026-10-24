"""Pydantic models for KINTSUGI Phase 7: Evaluation Center & Benchmarking Engine."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

FaultType = Literal[
    "point_spike",
    "point_corruption",
    "missing_value",
    "drift",
    "frozen_sensor",
    "communication_gap",
]

EvaluationMode = Literal["mode_a_benchmark", "mode_b_existing_run"]
EvaluationStatus = Literal["pending", "running", "completed", "failed", "partial_failure"]


# ==========================================
# Fault Injection Configurations
# ==========================================

class SpikeFaultConfig(BaseModel):
    """Configuration for synthetic point spike injection."""
    enabled: bool = True
    rate: float = Field(default=0.03, ge=0.001, le=0.5, description="Fraction of rows to inject spikes into (0.001 - 0.5)")
    magnitude_factor: float = Field(default=5.0, ge=1.5, le=50.0, description="Multiplier of signal standard deviation")
    direction: Literal["positive", "negative", "both"] = Field(default="both", description="Direction of injected deviation")


class CorruptionFaultConfig(BaseModel):
    """Configuration for synthetic point corruption injection."""
    enabled: bool = True
    rate: float = Field(default=0.02, ge=0.001, le=0.5, description="Fraction of rows to corrupt with erroneous values")
    scale_multiplier: float = Field(default=10.0, ge=2.0, le=100.0, description="Multiplier producing extreme out-of-scale values")
    fixed_value: Optional[float] = Field(default=None, description="Optional explicit erroneous value (e.g., -9999.0)")


class MissingFaultConfig(BaseModel):
    """Configuration for synthetic missing value injection."""
    enabled: bool = True
    rate: float = Field(default=0.03, ge=0.001, le=0.5, description="Fraction of rows to replace with missing values")


class DriftFaultConfig(BaseModel):
    """Configuration for synthetic sensor drift injection."""
    enabled: bool = True
    interval_length: int = Field(default=20, ge=3, le=500, description="Length of contiguous drift ramp interval in rows")
    slope_factor: float = Field(default=0.2, ge=0.01, le=5.0, description="Per-step deviation ramp multiplier relative to std")
    start_row: Optional[int] = Field(default=None, ge=0, description="Optional explicit start row for drift; if omitted, chosen via seed")


class FrozenFaultConfig(BaseModel):
    """Configuration for synthetic frozen sensor injection."""
    enabled: bool = True
    interval_length: int = Field(default=15, ge=3, le=500, description="Length of contiguous frozen interval in rows")
    frozen_value: Optional[float] = Field(default=None, description="Optional explicit constant value; if omitted, freezes at start row value")
    start_row: Optional[int] = Field(default=None, ge=0, description="Optional explicit start row; if omitted, chosen via seed")


class GapFaultConfig(BaseModel):
    """Configuration for synthetic communication gap injection."""
    enabled: bool = True
    interval_length: int = Field(default=10, ge=2, le=500, description="Length of contiguous missing communication gap in rows")
    start_row: Optional[int] = Field(default=None, ge=0, description="Optional explicit start row; if omitted, chosen via seed")


class FaultInjectionConfig(BaseModel):
    """Consolidated configuration for deterministic synthetic fault injection."""
    seed: int = Field(default=42, description="Reproducible pseudo-random seed")
    sensor_columns: List[str] = Field(default_factory=list, description="Target numeric sensor columns for fault injection")
    spikes: SpikeFaultConfig = Field(default_factory=SpikeFaultConfig)
    corruption: CorruptionFaultConfig = Field(default_factory=CorruptionFaultConfig)
    missing: MissingFaultConfig = Field(default_factory=MissingFaultConfig)
    drift: DriftFaultConfig = Field(default_factory=DriftFaultConfig)
    frozen: FrozenFaultConfig = Field(default_factory=FrozenFaultConfig)
    gap: GapFaultConfig = Field(default_factory=GapFaultConfig)


# ==========================================
# Machine-Readable Ground Truth Manifest
# ==========================================

class InjectedFaultRecord(BaseModel):
    """Exact machine-readable record of an individual injected synthetic fault observation."""
    fault_id: str = Field(..., description="Unique fault identifier ('flt_' + hex)")
    fault_type: FaultType = Field(..., description="Type of synthetic fault injected")
    sensor_column: str = Field(..., description="Target sensor column")
    source_row_index: int = Field(..., description="0-indexed position in source CSV file")
    timestamp: Optional[str] = Field(default=None, description="Timestamp of the observation if available")
    original_value: Optional[float] = Field(default=None, description="Exact preserved ground-truth value before corruption")
    corrupted_value: Optional[float] = Field(default=None, description="Corrupted observation value placed in benchmark copy")
    is_interval: bool = Field(default=False, description="Whether this fault was part of a contiguous interval")
    interval_id: Optional[str] = Field(default=None, description="Identifier of the fault interval if applicable")
    interval_index: Optional[int] = Field(default=None, description="Position within the interval (0 to interval_length - 1)")
    applied: bool = Field(default=True, description="Whether the fault was successfully applied or overridden")
    resolution_note: Optional[str] = Field(default=None, description="Note on overlapping fault resolution or skipped position")


class FaultManifest(BaseModel):
    """Comprehensive ground-truth manifest containing all injected modifications."""
    manifest_id: str = Field(..., description="Unique manifest ID")
    evaluation_id: str = Field(..., description="Associated evaluation run ID")
    source_dataset_id: str = Field(..., description="Original untouched dataset ID")
    benchmark_dataset_id: str = Field(..., description="Corrupted benchmark dataset ID")
    seed: int = Field(..., description="Random seed used for deterministic injection")
    total_injected_points: int = Field(..., ge=0)
    fault_counts_by_type: Dict[str, int] = Field(default_factory=dict)
    fault_counts_by_sensor: Dict[str, int] = Field(default_factory=dict)
    overlapping_skipped_count: int = 0
    injected_faults: List[InjectedFaultRecord] = Field(default_factory=list)


# ==========================================
# Quantitative Metric Models
# ==========================================

class ConfusionMatrix(BaseModel):
    """Binary observation-level confusion matrix for anomaly detection."""
    true_positives: int = Field(default=0, ge=0)
    false_positives: int = Field(default=0, ge=0)
    true_negatives: int = Field(default=0, ge=0)
    false_negatives: int = Field(default=0, ge=0)
    total_labeled_observations: int = Field(default=0, ge=0)


class EventLevelMetrics(BaseModel):
    """Event-level detection metrics for interval faults (drift, frozen sensor, communication gap)."""
    total_interval_events: int = 0
    detected_interval_events: int = 0
    event_detection_rate: Optional[float] = None
    mean_event_detection_latency_steps: Optional[float] = None
    notes: str = "An event is considered detected if at least one observation within the interval was flagged."


class DetectionMetrics(BaseModel):
    """Comprehensive detection performance metrics evaluated against labeled ground truth."""
    confusion_matrix: ConfusionMatrix
    precision: Optional[float] = Field(default=None, description="TP / (TP + FP). None if denominator is zero.")
    recall: Optional[float] = Field(default=None, description="TP / (TP + FN). None if denominator is zero.")
    f1_score: Optional[float] = Field(default=None, description="2 * P * R / (P + R). None if precision+recall is zero or undefined.")
    specificity: Optional[float] = Field(default=None, description="TN / (TN + FP). None if denominator is zero.")
    false_positive_rate: Optional[float] = Field(default=None, description="FP / (FP + TN). None if denominator is zero.")
    injected_faults_count: int = Field(default=0, ge=0)
    detected_faults_count: int = Field(default=0, ge=0)
    evaluation_unit: str = Field(default="sensor_observation_pair", description="Evaluation unit: sensor_observation_pair")
    event_level: Optional[EventLevelMetrics] = None
    notes: List[str] = Field(default_factory=list)


class ReconstructionMetrics(BaseModel):
    """Comprehensive signal repair performance metrics evaluated against known ground truth."""
    mae: Optional[float] = Field(default=None, description="Mean Absolute Error on evaluated accepted repairs")
    rmse: Optional[float] = Field(default=None, description="Root Mean Squared Error on evaluated accepted repairs")
    mape: Optional[float] = Field(default=None, description="Mean Absolute Percentage Error. Excludes zero reference values.")
    mape_evaluated_count: int = Field(default=0, ge=0, description="Denominator count of non-zero reference values evaluated for MAPE")
    total_evaluated_observations: int = Field(default=0, ge=0)
    accepted_corrections_count: int = Field(default=0, ge=0)
    unresolved_count: int = Field(default=0, ge=0)
    proposals_awaiting_review_count: int = Field(default=0, ge=0)
    incorrect_accepted_corrections_count: int = Field(default=0, ge=0)
    reconstruction_coverage: Optional[float] = Field(default=None, description="Proportion of eligible faulted signals repaired")
    correction_acceptance_rate: Optional[float] = Field(default=None, description="Proportion of evaluated signals accepted as CORRECTED")
    readings_improved_count: int = Field(default=0, ge=0)
    readings_worsened_count: int = Field(default=0, ge=0)
    readings_unchanged_count: int = Field(default=0, ge=0)
    error_reduction_percent: Optional[float] = Field(default=None, description="Overall error reduction relative to corrupted baseline")
    has_ground_truth: bool = Field(default=True, description="Whether reference ground truth was available")
    notes: List[str] = Field(default_factory=list)


# ==========================================
# Confidence & Calibration Models
# ==========================================

class ConfidenceRangeSummary(BaseModel):
    """Aggregate accuracy and error metrics within an evidence confidence score bin."""
    range_label: str = Field(..., description="Confidence range bin, e.g. '[0, 20)', '[80, 100]'")
    count: int = Field(default=0, ge=0)
    mean_confidence: float = 0.0
    mean_mae: Optional[float] = None
    mean_rmse: Optional[float] = None
    accepted_count: int = 0
    correct_accepted_count: int = 0
    incorrect_accepted_count: int = 0
    accuracy_rate: Optional[float] = None


class CoverageVsErrorPoint(BaseModel):
    """Parametric evaluation point of reconstruction coverage versus error at varying confidence thresholds."""
    confidence_threshold: float = Field(..., ge=0.0, le=100.0)
    coverage_count: int = Field(default=0, ge=0)
    coverage_rate: float = Field(default=0.0, ge=0.0, le=1.0)
    mae: Optional[float] = None
    rmse: Optional[float] = None


class ConfidenceScatterPoint(BaseModel):
    """Sample observation linking confidence score with ground-truth absolute error."""
    source_row_index: int
    sensor_column: str
    confidence_score: float
    absolute_error: Optional[float] = None
    status: str
    is_correct: Optional[bool] = None


class ConfidenceMetrics(BaseModel):
    """Empirical assessment of confidence scoring behavior against ground-truth outcomes."""
    status_distribution: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    confidence_ranges: List[ConfidenceRangeSummary] = Field(default_factory=list)
    coverage_vs_error: List[CoverageVsErrorPoint] = Field(default_factory=list)
    sample_scatter: List[ConfidenceScatterPoint] = Field(default_factory=list)
    is_calibrated_probability: bool = Field(
        default=False,
        description="Explicit flag: KINTSUGI confidence is an evidence score (0-100), not a calibrated probability.",
    )
    calibration_notes: str = Field(
        default="Scores represent multi-factor evidence concordance rather than Bayesian probabilities; Brier scores are omitted to prevent deceptive calibration claims.",
    )


# ==========================================
# Abstention & Safety Metrics
# ==========================================

class AbstentionMetrics(BaseModel):
    """Assessment of system safety and conservative abstention when evidence is degraded."""
    abstention_count: int = Field(default=0, ge=0)
    abstention_rate: Optional[float] = Field(default=None, description="UNRESOLVED count / total eligible faulted observations")
    correctly_abstained_count: int = Field(default=0, ge=0, description="Abstained where error of any candidate repair would exceed tolerance or context was unavailable")
    unnecessarily_abstained_count: int = Field(default=0, ge=0, description="Abstained despite potential for low-error repair")
    incorrectly_accepted_count: int = Field(default=0, ge=0, description="Accepted as CORRECTED despite absolute error exceeding tolerance")
    correctly_accepted_count: int = Field(default=0, ge=0, description="Accepted as CORRECTED with error within tolerance")
    error_rate_among_accepted: Optional[float] = Field(default=None, description="Incorrectly accepted / total accepted")
    coverage_among_eligible_faults: Optional[float] = None
    safety_ratio: Optional[float] = Field(default=None, description="(Correctly accepted + Correctly abstained) / total evaluated")
    definitions: Dict[str, str] = Field(default_factory=dict)


# ==========================================
# Breakdowns: Per-Sensor & Per-Fault-Type
# ==========================================

class FaultTypeBreakdown(BaseModel):
    """Detailed performance metrics isolated to an individual synthetic fault type."""
    fault_type: str
    injected_count: int = 0
    detected_count: int = 0
    tp: int = 0
    fp: int = 0
    fn: int = 0
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    reconstructed_count: int = 0
    mae: Optional[float] = None
    rmse: Optional[float] = None
    notes: Optional[str] = None


class SensorBreakdown(BaseModel):
    """Performance metrics isolated to a specific telemetry sensor channel."""
    sensor_column: str
    injected_count: int = 0
    detected_count: int = 0
    precision: Optional[float] = None
    recall: Optional[float] = None
    f1_score: Optional[float] = None
    mae: Optional[float] = None
    rmse: Optional[float] = None
    status_counts: Dict[str, int] = Field(default_factory=dict)


# ==========================================
# Profiling & Runtime Timing
# ==========================================

class EvaluationTiming(BaseModel):
    """Precise elapsed execution durations for all pipeline evaluation stages."""
    fault_injection_ms: float = 0.0
    detection_ms: float = 0.0
    reconstruction_ms: float = 0.0
    metrics_ms: float = 0.0
    total_elapsed_ms: float = 0.0


class DatasetProfile(BaseModel):
    """Metadata profile of the dataset under evaluation."""
    dataset_id: str
    row_count: int
    column_count: int
    sensor_columns: List[str]
    has_missing_values: bool
    is_constant_signal: Dict[str, bool] = Field(default_factory=dict)


# ==========================================
# Persisted Evaluation Run
# ==========================================

class EvaluationRun(BaseModel):
    """Complete persisted evaluation run containing configuration, ground truth, metrics, and breakdowns."""
    evaluation_id: str = Field(..., description="Server-controlled unique identifier ('eval_' + hex)")
    evaluation_mode: EvaluationMode = Field(..., description="'mode_a_benchmark' or 'mode_b_existing_run'")
    source_dataset_id: str = Field(..., description="Original source dataset ID")
    benchmark_dataset_id: Optional[str] = Field(default=None, description="Corrupted benchmark dataset ID for Mode A")
    pipeline_id: Optional[str] = Field(default=None, description="Pipeline configuration ID")
    detection_run_id: Optional[str] = Field(default=None, description="Detection run ID")
    reconstruction_run_id: Optional[str] = Field(default=None, description="Reconstruction run ID")
    random_seed: Optional[int] = Field(default=None, description="Reproducible random seed")
    fault_config: Optional[FaultInjectionConfig] = Field(default=None, description="Fault injection configuration")
    status: EvaluationStatus = Field(default="completed")
    start_time: str
    completion_time: Optional[str] = None
    timing: EvaluationTiming = Field(default_factory=EvaluationTiming)
    dataset_profile: DatasetProfile
    detection_metrics: DetectionMetrics
    reconstruction_metrics: ReconstructionMetrics
    confidence_metrics: ConfidenceMetrics
    abstention_metrics: AbstentionMetrics
    fault_breakdowns: List[FaultTypeBreakdown] = Field(default_factory=list)
    sensor_breakdowns: List[SensorBreakdown] = Field(default_factory=list)
    manifest_ref: Optional[str] = Field(default=None, description="Relative path or identifier of manifest")
    errors: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    software_version: str = "0.1.0"


# ==========================================
# API Request & Response Envelopes
# ==========================================

class CreateEvaluationRequest(BaseModel):
    """Payload to trigger a new evaluation run."""
    evaluation_mode: EvaluationMode = Field(default="mode_a_benchmark", description="'mode_a_benchmark' or 'mode_b_existing_run'")
    dataset_id: str = Field(..., description="Target dataset ID")
    pipeline_id: Optional[str] = Field(default=None, description="Existing pipeline ID or template")
    detection_run_id: Optional[str] = Field(default=None, description="Required for Mode B existing run evaluation")
    reconstruction_run_id: Optional[str] = Field(default=None, description="Optional for Mode B reconstruction evaluation")
    sensor_columns: Optional[List[str]] = Field(default=None, description="Sensor columns to evaluate (defaults to all numeric)")
    fault_config: Optional[FaultInjectionConfig] = Field(default=None, description="Fault injection configuration for Mode A")
    seed: int = Field(default=42, description="Reproducible seed for Mode A")


class EvaluationSummaryItem(BaseModel):
    """Compact summary of a persisted evaluation run for catalog listing."""
    evaluation_id: str
    evaluation_mode: EvaluationMode
    source_dataset_id: str
    benchmark_dataset_id: Optional[str] = None
    pipeline_id: Optional[str] = None
    status: EvaluationStatus
    created_at: str
    completed_at: Optional[str] = None
    f1_score: Optional[float] = None
    precision: Optional[float] = None
    recall: Optional[float] = None
    rmse: Optional[float] = None
    mae: Optional[float] = None
    injected_faults_count: int = 0
    total_evaluated_observations: int = 0
    total_elapsed_ms: float = 0.0


class EvaluationListResponse(BaseModel):
    """Paginated collection of historical evaluation runs."""
    evaluations: List[EvaluationSummaryItem]
    total: int
    limit: int
    offset: int


class EvaluationMetricsResponse(BaseModel):
    """Detailed metrics endpoint response with explicit formal definitions."""
    evaluation_id: str
    detection_metrics: DetectionMetrics
    reconstruction_metrics: ReconstructionMetrics
    confidence_metrics: ConfidenceMetrics
    abstention_metrics: AbstentionMetrics
    metric_definitions: Dict[str, str]


class EvaluationBreakdownResponse(BaseModel):
    """Breakdown endpoint response containing per-sensor and per-fault-type metrics."""
    evaluation_id: str
    fault_breakdowns: List[FaultTypeBreakdown]
    sensor_breakdowns: List[SensorBreakdown]


class EvaluationManifestResponse(BaseModel):
    """Manifest endpoint response returning machine-readable ground truth."""
    evaluation_id: str
    manifest: FaultManifest


class ConsistencyCheckResult(BaseModel):
    """Individual consistency check result for validation endpoint."""
    check_name: str
    passed: bool
    details: str


class EvaluationValidationResponse(BaseModel):
    """Validation endpoint response checking mathematical consistency and data preservation."""
    evaluation_id: str
    is_consistent: bool
    source_data_intact: bool
    source_sha256_verified: bool
    checks: List[ConsistencyCheckResult]
