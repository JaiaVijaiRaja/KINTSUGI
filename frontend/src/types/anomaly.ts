/**
 * KINTSUGI Anomaly Types
 * Defines anomaly records, types, severities, and query filters.
 */

export type AnomalyType =
  | 'SPIKE'
  | 'PACKET_LOSS'
  | 'FROZEN_SIGNAL'
  | 'OUT_OF_BOUNDS'
  | 'STATISTICAL_DRIFT'
  | 'RATE_OF_CHANGE_EXCEEDED';

export type AnomalySeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface AnomalyRecord {
  id: string;
  datasetId: string;
  pipelineRunId: string;
  sensorId: string;
  timestamp: string;
  measuredValue: number;
  anomalyType: AnomalyType;
  severity: AnomalySeverity;
  score: number; // 0.0 - 1.0 anomaly outlier score
  detectionRule: string;
  isFlaggedForReconstruction: boolean;
}

export interface AnomalyFilter {
  datasetId?: string;
  sensorId?: string;
  severity?: AnomalySeverity;
  anomalyType?: AnomalyType;
  startTime?: string;
  endTime?: string;
}
