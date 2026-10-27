/**
 * KINTSUGI Pipeline Types
 * Defines configuration, channel mappings, detection settings, reconstruction policies,
 * confidence evaluation, and validation interfaces matching backend Pydantic models.
 */

export interface StatisticalDetectorSettings {
  enabled: boolean;
  window_size: number;
  mad_threshold: number;
  min_observations: number;
}

export interface IsolationForestSettings {
  enabled: boolean;
  contamination: number;
  random_seed: number;
  min_observations: number;
}

export interface DetectionSettings {
  statistical: StatisticalDetectorSettings;
  isolation_forest: IsolationForestSettings;
}

export interface ReconstructionSettings {
  allow_linear_interpolation: boolean;
  max_gap_size: number;
  require_cross_sensor_validation: boolean;
  preserve_original_readings: boolean;
  allow_automatic_correction: boolean;
  fallback_behavior: 'abstain_unresolved' | 'flag_only';
}

export interface ConfidencePolicy {
  review_threshold: number;
  human_review_required: boolean;
  min_evidence_sensors: number;
  unjustified_behavior: 'abstain_unresolved' | 'retain_raw';
}

export interface ValidationIssue {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface PipelineValidationResponse {
  is_valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  dataset_id: string;
}

export interface PipelineConfigCreate {
  configuration_name: string;
  description?: string;
  dataset_id: string;
  timestamp_column?: string | null;
  sensor_columns: string[];
  ignored_columns: string[];
  detection_settings: DetectionSettings;
  reconstruction_settings: ReconstructionSettings;
  confidence_policy: ConfidencePolicy;
}

export interface PipelineConfigUpdate {
  configuration_name: string;
  description?: string;
  dataset_id: string;
  timestamp_column?: string | null;
  sensor_columns: string[];
  ignored_columns: string[];
  detection_settings: DetectionSettings;
  reconstruction_settings: ReconstructionSettings;
  confidence_policy: ConfidencePolicy;
}

export interface PipelineConfig {
  configuration_id: string;
  configuration_name: string;
  description?: string;
  dataset_id: string;
  configuration_version: number;
  timestamp_column?: string | null;
  sensor_columns: string[];
  ignored_columns: string[];
  detection_settings: DetectionSettings;
  reconstruction_settings: ReconstructionSettings;
  confidence_policy: ConfidencePolicy;
  created_at: string;
  updated_at: string;
}

export interface PipelineListResponse {
  pipelines: PipelineConfig[];
  total: number;
}

// Stage execution models
export type PipelineStage =
  | 'ingestion'
  | 'anomaly_audit'
  | 'reconstruction'
  | 'confidence_scoring'
  | 'audit_ledger';

export type PipelineRunStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'aborted';

export interface PipelineRun {
  id: string;
  pipelineId: string;
  datasetId: string;
  datasetName: string;
  status: PipelineRunStatus;
  startedAt: string;
  completedAt?: string;
  totalRecordsProcessed: number;
  anomaliesDetectedCount: number;
  valuesRepairedCount: number;
  unresolvedCount: number;
  errorMessage?: string;
}
