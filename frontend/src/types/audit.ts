/**
 * TypeScript types and interfaces for KINTSUGI Audit Trail and Explainability Engine (Phase 8).
 */

export type AuditEventType =
  // Dataset events
  | 'DATASET_UPLOADED'
  | 'DATASET_VALIDATED'
  | 'DATASET_VALIDATION_FAILED'
  // Pipeline events
  | 'PIPELINE_CREATED'
  | 'PIPELINE_UPDATED'
  | 'PIPELINE_VALIDATED'
  // Detection events
  | 'DETECTION_RUN_STARTED'
  | 'DETECTION_RUN_COMPLETED'
  | 'DETECTION_RUN_FAILED'
  | 'ANOMALY_DETECTED'
  // Reconstruction events
  | 'RECONSTRUCTION_RUN_STARTED'
  | 'RECONSTRUCTION_RUN_COMPLETED'
  | 'RECONSTRUCTION_RUN_FAILED'
  | 'VALUE_PROPOSED'
  | 'CORRECTION_ACCEPTED'
  | 'CORRECTION_REJECTED'
  | 'RECONSTRUCTION_UNRESOLVED'
  // Review events
  | 'REVIEW_REQUESTED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'REVIEW_COMMENT_ADDED'
  // Evaluation events
  | 'EVALUATION_STARTED'
  | 'EVALUATION_COMPLETED'
  | 'EVALUATION_FAILED'
  // System events
  | 'OPERATION_RETRIED'
  | 'OPERATION_PARTIALLY_COMPLETED';

export interface AuditEvent {
  event_id: string;
  event_type: AuditEventType;
  schema_version: string;
  sequence_number: number;
  timestamp: string;
  dataset_id?: string | null;
  source_row_index?: number | null;
  sensor_column?: string | null;
  pipeline_id?: string | null;
  pipeline_version?: number | null;
  detection_run_id?: string | null;
  anomaly_id?: string | null;
  reconstruction_run_id?: string | null;
  reconstruction_result_id?: string | null;
  evaluation_run_id?: string | null;
  previous_event_id?: string | null;
  original_value?: number | null;
  proposed_value?: number | null;
  final_value?: number | null;
  previous_status?: string | null;
  new_status?: string | null;
  detection_method?: string | null;
  reconstruction_method?: string | null;
  confidence_score?: number | null;
  confidence_breakdown?: Record<string, number> | null;
  evidence_references?: Record<string, unknown> | null;
  decision_reason?: string | null;
  validation_outcomes?: Record<string, unknown> | null;
  processing_outcome?: string | null;
  error_details?: string | null;
  metadata?: Record<string, unknown> | null;
  previous_hash: string;
  event_hash: string;
}

export interface DetectionExplanation {
  detector_name: string;
  detector_scores: Record<string, number>;
  thresholds: Record<string, unknown>;
  observation_index: number;
  sensor_column: string;
  original_value?: number | null;
  neighbor_observations: Array<{
    row_index: number;
    value?: number | null;
    offset: number;
  }>;
  consensus: string;
  agreement_summary: string;
  flagged_reason: string;
}

export interface ReconstructionExplanation {
  original_value?: number | null;
  proposed_value?: number | null;
  final_value?: number | null;
  reconstruction_method: string;
  supporting_observation_indices: number[];
  supporting_values: number[];
  valid_neighbors_count: number;
  confidence_score: number;
  confidence_breakdown: Record<string, number>;
  cross_sensor_validation?: Record<string, unknown> | null;
  policy_outcome: string;
  decision_reason: string;
}

export interface EvaluationExplanation {
  evaluation_mode: string;
  ground_truth_source: string;
  manifest_ref?: string | null;
  metric_definitions: Record<string, string>;
  eligible_observations_count: number;
  results_summary: Record<string, unknown>;
  unavailable_metrics: string[];
  unavailable_reasons: Record<string, string>;
}

export interface CausalTraceStep {
  step_index: number;
  stage: string;
  event_id?: string | null;
  title: string;
  timestamp?: string | null;
  status?: string | null;
  details: Record<string, unknown>;
}

export interface CausalTraceResponse {
  reconstruction_result_id: string;
  anomaly_id?: string | null;
  source_row_index: number;
  sensor_column: string;
  dataset_id: string;
  pipeline_id: string;
  detection_run_id: string;
  reconstruction_run_id: string;
  raw_value?: number | null;
  proposed_value?: number | null;
  final_value?: number | null;
  final_status: string;
  confidence_score: number;
  detection_explanation?: DetectionExplanation | null;
  reconstruction_explanation?: ReconstructionExplanation | null;
  evaluation_explanation?: EvaluationExplanation | null;
  trace_steps: CausalTraceStep[];
  events: AuditEvent[];
}

export interface ObservationHistoryResponse {
  dataset_id: string;
  source_row_index: number;
  row_values: Record<string, unknown>;
  events: AuditEvent[];
  anomalies: Array<Record<string, unknown>>;
  reconstructions: Array<Record<string, unknown>>;
}

export interface HashChainVerificationResponse {
  is_valid: boolean;
  total_events_checked: number;
  genesis_hash: string;
  latest_hash: string;
  errors: string[];
  verified_at: string;
  limitations: string[];
}

export interface AuditEventListResponse {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditFilterParams {
  dataset_id?: string;
  pipeline_id?: string;
  event_type?: string;
  sensor_column?: string;
  run_id?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}
