/**
 * KINTSUGI Evaluation Center Types (Phase 7)
 * Defines quantitative benchmark metrics, ground-truth manifests, breakdowns, and evaluation run state.
 */

export type FaultType =
  | 'point_spike'
  | 'point_corruption'
  | 'missing_value'
  | 'drift'
  | 'frozen_sensor'
  | 'communication_gap';

export type EvaluationMode = 'mode_a_benchmark' | 'mode_b_existing_run';
export type EvaluationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial_failure';

// Fault Injection Configs
export interface SpikeFaultConfig {
  enabled: boolean;
  rate: number;
  magnitude_factor: number;
  direction: 'positive' | 'negative' | 'both';
}

export interface CorruptionFaultConfig {
  enabled: boolean;
  rate: number;
  scale_multiplier: number;
  fixed_value?: number | null;
}

export interface MissingFaultConfig {
  enabled: boolean;
  rate: number;
}

export interface DriftFaultConfig {
  enabled: boolean;
  interval_length: number;
  slope_factor: number;
  start_row?: number | null;
}

export interface FrozenFaultConfig {
  enabled: boolean;
  interval_length: number;
  frozen_value?: number | null;
  start_row?: number | null;
}

export interface GapFaultConfig {
  enabled: boolean;
  interval_length: number;
  start_row?: number | null;
}

export interface FaultInjectionConfig {
  seed: number;
  sensor_columns: string[];
  spikes: SpikeFaultConfig;
  corruption: CorruptionFaultConfig;
  missing: MissingFaultConfig;
  drift: DriftFaultConfig;
  frozen: FrozenFaultConfig;
  gap: GapFaultConfig;
}

// Injected Ground Truth Manifest
export interface InjectedFaultRecord {
  fault_id: string;
  fault_type: FaultType;
  sensor_column: string;
  source_row_index: number;
  timestamp?: string | null;
  original_value?: number | null;
  corrupted_value?: number | null;
  is_interval: boolean;
  interval_id?: string | null;
  interval_index?: number | null;
  applied: boolean;
  resolution_note?: string | null;
}

export interface FaultManifest {
  manifest_id: string;
  evaluation_id: string;
  source_dataset_id: string;
  benchmark_dataset_id: string;
  seed: number;
  total_injected_points: number;
  fault_counts_by_type: Record<string, number>;
  fault_counts_by_sensor: Record<string, number>;
  overlapping_skipped_count: number;
  injected_faults: InjectedFaultRecord[];
}

// Metrics
export interface ConfusionMatrix {
  true_positives: number;
  false_positives: number;
  true_negatives: number;
  false_negatives: number;
  total_labeled_observations: number;
}

export interface EventLevelMetrics {
  total_interval_events: number;
  detected_interval_events: number;
  event_detection_rate: number | null;
  mean_event_detection_latency_steps: number | null;
  notes: string;
}

export interface DetectionMetrics {
  confusion_matrix: ConfusionMatrix;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  specificity: number | null;
  false_positive_rate: number | null;
  injected_faults_count: number;
  detected_faults_count: number;
  evaluation_unit: string;
  event_level?: EventLevelMetrics | null;
  notes: string[];
}

export interface ReconstructionMetrics {
  mae: number | null;
  rmse: number | null;
  mape: number | null;
  mape_evaluated_count: number;
  total_evaluated_observations: number;
  accepted_corrections_count: number;
  unresolved_count: number;
  proposals_awaiting_review_count: number;
  incorrect_accepted_corrections_count: number;
  reconstruction_coverage: number | null;
  correction_acceptance_rate: number | null;
  readings_improved_count: number;
  readings_worsened_count: number;
  readings_unchanged_count: number;
  error_reduction_percent: number | null;
  has_ground_truth: boolean;
  notes: string[];
}

export interface ConfidenceRangeSummary {
  range_label: string;
  count: number;
  mean_confidence: number;
  mean_mae: number | null;
  mean_rmse: number | null;
  accepted_count: number;
  correct_accepted_count: number;
  incorrect_accepted_count: number;
  accuracy_rate: number | null;
}

export interface CoverageVsErrorPoint {
  confidence_threshold: number;
  coverage_count: number;
  coverage_rate: number;
  mae: number | null;
  rmse: number | null;
}

export interface ConfidenceScatterPoint {
  source_row_index: number;
  sensor_column: string;
  confidence_score: number;
  absolute_error: number | null;
  status: string;
  is_correct?: boolean | null;
}

export interface ConfidenceMetrics {
  status_distribution: Record<string, { count: number; mean_confidence: number; min_confidence: number; max_confidence: number }>;
  confidence_ranges: ConfidenceRangeSummary[];
  coverage_vs_error: CoverageVsErrorPoint[];
  sample_scatter: ConfidenceScatterPoint[];
  is_calibrated_probability: boolean;
  calibration_notes: string;
}

export interface AbstentionMetrics {
  abstention_count: number;
  abstention_rate: number | null;
  correctly_abstained_count: number;
  unnecessarily_abstained_count: number;
  incorrectly_accepted_count: number;
  correctly_accepted_count: number;
  error_rate_among_accepted: number | null;
  coverage_among_eligible_faults: number | null;
  safety_ratio: number | null;
  definitions: Record<string, string>;
}

export interface FaultTypeBreakdown {
  fault_type: string;
  injected_count: number;
  detected_count: number;
  tp: number;
  fp: number;
  fn: number;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  reconstructed_count: number;
  mae: number | null;
  rmse: number | null;
  notes?: string | null;
}

export interface SensorBreakdown {
  sensor_column: string;
  injected_count: number;
  detected_count: number;
  precision: number | null;
  recall: number | null;
  f1_score: number | null;
  mae: number | null;
  rmse: number | null;
  status_counts: Record<string, number>;
}

export interface EvaluationTiming {
  fault_injection_ms: number;
  detection_ms: number;
  reconstruction_ms: number;
  metrics_ms: number;
  total_elapsed_ms: number;
}

export interface DatasetProfile {
  dataset_id: string;
  row_count: number;
  column_count: number;
  sensor_columns: string[];
  has_missing_values: boolean;
  is_constant_signal: Record<string, boolean>;
}

export interface EvaluationRun {
  evaluation_id: string;
  evaluation_mode: EvaluationMode;
  source_dataset_id: string;
  benchmark_dataset_id?: string | null;
  pipeline_id?: string | null;
  detection_run_id?: string | null;
  reconstruction_run_id?: string | null;
  random_seed?: number | null;
  fault_config?: FaultInjectionConfig | null;
  status: EvaluationStatus;
  start_time: string;
  completion_time?: string | null;
  timing: EvaluationTiming;
  dataset_profile: DatasetProfile;
  detection_metrics: DetectionMetrics;
  reconstruction_metrics: ReconstructionMetrics;
  confidence_metrics: ConfidenceMetrics;
  abstention_metrics: AbstentionMetrics;
  fault_breakdowns: FaultTypeBreakdown[];
  sensor_breakdowns: SensorBreakdown[];
  manifest_ref?: string | null;
  errors: string[];
  warnings: string[];
  limitations: string[];
  software_version: string;
}

export interface EvaluationSummaryItem {
  evaluation_id: string;
  evaluation_mode: EvaluationMode;
  source_dataset_id: string;
  benchmark_dataset_id?: string | null;
  pipeline_id?: string | null;
  status: EvaluationStatus;
  created_at: string;
  completed_at?: string | null;
  f1_score: number | null;
  precision: number | null;
  recall: number | null;
  rmse: number | null;
  mae: number | null;
  injected_faults_count: number;
  total_evaluated_observations: number;
  total_elapsed_ms: number;
}

export interface EvaluationListResponse {
  evaluations: EvaluationSummaryItem[];
  total: number;
  limit: number;
  offset: number;
}

export interface EvaluationMetricsResponse {
  evaluation_id: string;
  detection_metrics: DetectionMetrics;
  reconstruction_metrics: ReconstructionMetrics;
  confidence_metrics: ConfidenceMetrics;
  abstention_metrics: AbstentionMetrics;
  metric_definitions: Record<string, string>;
}

export interface EvaluationBreakdownResponse {
  evaluation_id: string;
  fault_breakdowns: FaultTypeBreakdown[];
  sensor_breakdowns: SensorBreakdown[];
}

export interface EvaluationManifestResponse {
  evaluation_id: string;
  manifest: FaultManifest;
}

export interface ConsistencyCheckResult {
  check_name: string;
  passed: boolean;
  details: string;
}

export interface EvaluationValidationResponse {
  evaluation_id: string;
  is_consistent: boolean;
  source_data_intact: boolean;
  source_sha256_verified: boolean;
  checks: ConsistencyCheckResult[];
}

export interface CreateEvaluationRequest {
  evaluation_mode: EvaluationMode;
  dataset_id: string;
  pipeline_id?: string | null;
  detection_run_id?: string | null;
  reconstruction_run_id?: string | null;
  sensor_columns?: string[] | null;
  fault_config?: FaultInjectionConfig | null;
  seed?: number;
}
