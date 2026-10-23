from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class StatisticalDetectorSettings(BaseModel):
    """Configuration for rolling window statistical anomaly detection (Z-Score / MAD)."""
    enabled: bool = Field(default=True, description="Enable rolling statistical outlier detection")
    window_size: int = Field(default=30, ge=5, le=500, description="Rolling window size in samples (5 to 500)")
    mad_threshold: float = Field(default=3.5, ge=1.0, le=10.0, description="Median Absolute Deviation sensitivity threshold (1.0 to 10.0)")
    min_observations: int = Field(default=10, ge=5, le=100, description="Minimum observations required before calculating statistics")


class IsolationForestSettings(BaseModel):
    """Configuration for Isolation Forest multi-sensor anomaly detection."""
    enabled: bool = Field(default=True, description="Enable Isolation Forest multi-sensor detection")
    contamination: float = Field(default=0.05, ge=0.001, le=0.5, description="Expected proportion of anomalies (0.1% to 50%)")
    random_seed: int = Field(default=42, ge=0, le=2147483647, description="Random seed for tree generation reproducibility")
    min_observations: int = Field(default=50, ge=10, le=1000, description="Minimum observations required for tree training")


class DetectionSettings(BaseModel):
    """Aggregated future anomaly detection settings."""
    statistical: StatisticalDetectorSettings = Field(default_factory=StatisticalDetectorSettings)
    isolation_forest: IsolationForestSettings = Field(default_factory=IsolationForestSettings)


class ReconstructionSettings(BaseModel):
    """Policies governing future signal healing and imputation."""
    allow_linear_interpolation: bool = Field(default=True, description="Permit linear interpolation for small internal gaps")
    max_gap_size: int = Field(default=5, ge=1, le=100, description="Maximum contiguous missing samples permitted for interpolation")
    require_cross_sensor_validation: bool = Field(default=True, description="Require corroborating confirmation from neighboring sensor channels")
    preserve_original_readings: bool = Field(default=True, description="Enforce immutable retention of raw measured values; never overwrite")
    allow_automatic_correction: bool = Field(default=False, description="Permit automatic correction when confidence threshold is satisfied")
    fallback_behavior: Literal["abstain_unresolved", "flag_only"] = Field(
        default="abstain_unresolved",
        description="Action when reconstruction is unsupported or evidence is insufficient ('abstain_unresolved' or 'flag_only')"
    )


class ConfidencePolicy(BaseModel):
    """Decision policy for confidence evaluation, review thresholds, and abstention."""
    review_threshold: float = Field(default=0.80, ge=0.0, le=1.0, description="Decision policy threshold: repairs below this score are abstained as UNRESOLVED")
    human_review_required: bool = Field(default=True, description="Whether human review is required before committing corrected signals")
    min_evidence_sensors: int = Field(default=1, ge=0, le=20, description="Minimum number of corroborating sensor channels required for justified correction")
    unjustified_behavior: Literal["abstain_unresolved", "retain_raw"] = Field(
        default="abstain_unresolved",
        description="System behavior when repair cannot be justified ('abstain_unresolved' or 'retain_raw')"
    )


class ValidationIssue(BaseModel):
    """Structured validation finding (error or advisory warning)."""
    field: str
    message: str
    severity: Literal["error", "warning"] = "error"


class PipelineValidationResponse(BaseModel):
    """Structured response from configuration validation."""
    is_valid: bool
    errors: List[ValidationIssue] = Field(default_factory=list)
    warnings: List[ValidationIssue] = Field(default_factory=list)
    dataset_id: str


class PipelineConfigCreate(BaseModel):
    """Request payload to create or validate a pipeline configuration."""
    configuration_name: str = Field(..., min_length=1, max_length=100, description="Human-readable pipeline configuration name")
    description: Optional[str] = Field(default=None, max_length=500, description="Optional configuration notes")
    dataset_id: str = Field(..., description="ID of the target dataset")
    timestamp_column: Optional[str] = Field(default=None, description="Mapped timestamp column name, or None if dataset has no timestamp")
    sensor_columns: List[str] = Field(default_factory=list, description="List of mapped numeric sensor columns")
    ignored_columns: List[str] = Field(default_factory=list, description="List of columns excluded from processing")
    detection_settings: DetectionSettings = Field(default_factory=DetectionSettings)
    reconstruction_settings: ReconstructionSettings = Field(default_factory=ReconstructionSettings)
    confidence_policy: ConfidencePolicy = Field(default_factory=ConfidencePolicy)


class PipelineConfigUpdate(BaseModel):
    """Request payload to update an existing pipeline configuration."""
    configuration_name: str = Field(..., min_length=1, max_length=100, description="Human-readable pipeline configuration name")
    description: Optional[str] = Field(default=None, max_length=500, description="Optional configuration notes")
    dataset_id: str = Field(..., description="ID of the target dataset")
    timestamp_column: Optional[str] = Field(default=None, description="Mapped timestamp column name, or None if dataset has no timestamp")
    sensor_columns: List[str] = Field(default_factory=list, description="List of mapped numeric sensor columns")
    ignored_columns: List[str] = Field(default_factory=list, description="List of columns excluded from processing")
    detection_settings: DetectionSettings = Field(default_factory=DetectionSettings)
    reconstruction_settings: ReconstructionSettings = Field(default_factory=ReconstructionSettings)
    confidence_policy: ConfidencePolicy = Field(default_factory=ConfidencePolicy)


class PipelineConfig(BaseModel):
    """Full persisted pipeline configuration model."""
    configuration_id: str
    configuration_name: str
    description: Optional[str] = None
    dataset_id: str
    configuration_version: int = 1
    timestamp_column: Optional[str] = None
    sensor_columns: List[str] = Field(default_factory=list)
    ignored_columns: List[str] = Field(default_factory=list)
    detection_settings: DetectionSettings = Field(default_factory=DetectionSettings)
    reconstruction_settings: ReconstructionSettings = Field(default_factory=ReconstructionSettings)
    confidence_policy: ConfidencePolicy = Field(default_factory=ConfidencePolicy)
    created_at: str
    updated_at: str


class PipelineListResponse(BaseModel):
    """Collection of saved pipeline configurations."""
    pipelines: List[PipelineConfig]
    total: int
