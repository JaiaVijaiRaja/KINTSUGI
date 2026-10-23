/**
 * KINTSUGI Evaluation Center Types
 * Defines benchmark evaluation metrics, detection accuracy, reconstruction error, and audit integrity.
 */

export interface MetricScore {
  name: string;
  symbol: string;
  value: number | null;
  unit?: string;
  description: string;
  targetThreshold?: number;
}

export interface DetectionMetrics {
  precision: number | null;
  recall: number | null;
  f1Score: number | null;
  falsePositiveRate: number | null;
}

export interface ReconstructionMetrics {
  mae: number | null;  // Mean Absolute Error
  rmse: number | null; // Root Mean Squared Error
  mape: number | null; // Mean Absolute Percentage Error
  coverageRatio: number | null; // Proportion of signals successfully repaired vs total corrupted
}

export interface ConfidenceEvaluation {
  expectedCalibrationError: number | null; // ECE
  brierScore: number | null;
  abstentionRate: number | null; // Rate at which system legitimately tagged UNRESOLVED
}

export interface EvaluationSummary {
  id: string;
  benchmarkDatasetName: string;
  evaluatedAt: string;
  detection: DetectionMetrics;
  reconstruction: ReconstructionMetrics;
  confidence: ConfidenceEvaluation;
  auditCompletenessPercent: number | null; // Must be 100% for full audit compliance
  throughputRecordsPerSec: number | null;
}
