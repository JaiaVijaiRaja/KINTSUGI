/**
 * KINTSUGI Signal Reconstruction & Confidence Types
 * 
 * Non-Negotiable Pipeline Invariants:
 * 1. Original raw measurements are always preserved in an un-altered state.
 * 2. Every proposed repair must be accompanied by an evidence-based confidence score (0 to 100).
 * 3. The system MUST ABSTAIN when evidence is insufficient, tagging the value as UNRESOLVED
 *    rather than fabricating synthetic accuracy.
 */

export type ProcessingStatus =
  | 'MEASURED'    // Original unmodified sensor reading preserved from physical telemetry
  | 'ESTIMATED'   // Candidate signal reconstructed; requires operator review
  | 'CORRECTED'   // High-confidence validated repair approved automatically or by operator
  | 'UNRESOLVED'; // Low-confidence / insufficient or conflicting evidence; system abstains

export type ReconstructionMethod =
  | 'linear_interpolation'
  | 'local_median'
  | 'cross_sensor'
  | 'none';

export type ReviewDecision = 'ACCEPT' | 'REJECT' | 'MODIFY';

export interface ConfidenceBreakdown {
  neighbor_count_score: number;
  method_agreement_score: number;
  temporal_proximity_score: number;
  local_stability_score: number;
  neighbor_cleanliness_score: number;
  cross_sensor_score: number;
  structural_penalty: number;
  raw_total: number;
  normalized_score: number;
  factors_applied: string[];
}

export interface EvidenceReference {
  sensor_column: string;
  source_row_index: number;
  timestamp?: string | null;
  value: number;
  role: string;
  weight: number;
}

export interface ReconstructionRecord {
  result_id: string;
  reconstruction_run_id: string;
  detection_run_id: string;
  anomaly_id?: string | null;
  dataset_id: string;
  configuration_id: string;
  sensor_column: string;
  source_row_index: number;
  timestamp?: string | null;
  original_value?: number | null;
  proposed_value?: number | null;
  final_value?: number | null;
  method: ReconstructionMethod;
  status: ProcessingStatus;
  confidence_score: number; // 0.0 to 100.0
  confidence_breakdown: ConfidenceBreakdown;
  evidence_summary: string;
  evidence_references: EvidenceReference[];
  abstention_reason?: string | null;
  is_reviewed: boolean;
  reviewed_by?: string | null;
  review_decision?: ReviewDecision | null;
  review_comment?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}

export interface ReconstructionSummary {
  total_evaluated: number;
  measured_count: number;
  estimated_count: number;
  corrected_count: number;
  unresolved_count: number;
  average_confidence: number;
  anomalies_reconstructed_count: number;
  by_sensor: Record<string, Record<string, number>>;
  by_method: Record<string, number>;
}

export interface ReconstructionRun {
  reconstruction_run_id: string;
  detection_run_id: string;
  pipeline_id: string;
  dataset_id: string;
  configuration_version: number;
  status: string;
  start_time: string;
  completion_time?: string | null;
  summary: ReconstructionSummary;
  errors: string[];
  warnings: string[];
}

export interface ReconstructionRunResponse {
  run: ReconstructionRun;
  sample_results: ReconstructionRecord[];
}

export interface ReconstructionRunListResponse {
  runs: ReconstructionRun[];
  total: number;
}

export interface ReconstructionResultsResponse {
  reconstruction_run_id: string;
  detection_run_id: string;
  pipeline_id: string;
  dataset_id: string;
  summary: ReconstructionSummary;
  total_results: number;
  results: ReconstructionRecord[];
  limit: number;
  offset: number;
}

export interface ReviewDecisionRequest {
  decision: ReviewDecision;
  modified_value?: number | null;
  reviewer_name?: string;
  review_comment?: string;
}
