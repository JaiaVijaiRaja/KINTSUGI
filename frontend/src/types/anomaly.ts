/**
 * KINTSUGI Anomaly Types & Schemas
 * Typed definitions matching backend Phase 5 models for detection runs and anomaly records.
 */

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type ConsensusType = 'SINGLE_DETECTOR' | 'MULTI_DETECTOR' | 'NORMAL' | 'UNASSESSED';
export type DetectionRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'partial_failure';

export interface DetectorResultDetail {
  detector_name: string;
  flagged: boolean;
  score: number | null;
  reason: string;
  threshold?: number | null;
  baseline?: number | null;
  dispersion?: number | null;
}

export interface AnomalyRecord {
  anomaly_id: string;
  run_id: string;
  dataset_id: string;
  configuration_id: string;
  sensor_column: string;
  source_row_index: number;
  timestamp?: string | null;
  original_value: number | null;
  detector_name: string;
  detector_score: number | null;
  detection_reason: string;
  severity: AnomalySeverity;
  flagged_status: string;
  consensus: ConsensusType;
  detectors_flagged: string[];
  detector_details: Record<string, DetectorResultDetail>;
}

export interface RunSummary {
  total_rows_analyzed: number;
  total_anomalies_detected: number;
  anomalies_by_sensor: Record<string, number>;
  anomalies_by_detector: Record<string, number>;
  anomalies_by_severity: Record<string, number>;
  multi_detector_consensus_count: number;
  unusable_rows_count: number;
}

export interface DetectionRun {
  run_id: string;
  dataset_id: string;
  configuration_id: string;
  configuration_version: number;
  status: DetectionRunStatus;
  start_time: string;
  completion_time?: string | null;
  detector_methods: string[];
  summary: RunSummary;
  errors: string[];
  warnings: string[];
}

export interface DetectionRunResponse {
  run: DetectionRun;
  sample_anomalies: AnomalyRecord[];
}

export interface DetectionRunResultsResponse {
  run_id: string;
  dataset_id: string;
  configuration_id: string;
  summary: RunSummary;
  total_anomalies: number;
  anomalies: AnomalyRecord[];
  limit: number;
  offset: number;
}

export interface AnomalyListResponse {
  anomalies: AnomalyRecord[];
  total: number;
  limit: number;
  offset: number;
}

export interface AnomalyQueryParams {
  dataset_id?: string;
  run_id?: string;
  sensor_column?: string;
  detector_name?: string;
  severity?: string;
  limit?: number;
  offset?: number;
}
