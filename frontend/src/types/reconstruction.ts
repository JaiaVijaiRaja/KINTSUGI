/**
 * KINTSUGI Signal Reconstruction & Confidence Types
 * 
 * Non-Negotiable Pipeline Invariants:
 * 1. Original raw measurements are always preserved in an un-altered state.
 * 2. Every proposed repair must be accompanied by an evidence-based confidence score.
 * 3. The system MUST ABSTAIN when evidence is insufficient, tagging the value as UNRESOLVED
 *    rather than fabricating synthetic accuracy.
 */

export type ProcessingStatus =
  | 'MEASURED'    // Original unmodified sensor reading preserved from physical telemetry
  | 'ESTIMATED'   // Signal reconstructed through contextual or multivariate imputation
  | 'CORRECTED'   // High-confidence validated repair approved for downstream consumers
  | 'UNRESOLVED'; // Low-confidence / insufficient contextual evidence; system abstained from guessing

export type ReconstructionMethod =
  | 'NONE'
  | 'TEMPORAL_SPLINE'
  | 'MULTIVARIATE_REGRESSION'
  | 'ATTENTION_IMPUTATION'
  | 'KALMAN_SMOOTHER';

export interface ReconstructionRecord {
  id: string;
  datasetId: string;
  pipelineRunId: string;
  sensorId: string;
  timestamp: string;
  rawMeasuredValue: number | null; // Null if packet was lost/missing entirely
  proposedValue: number | null;
  finalValue: number | null;
  status: ProcessingStatus;
  reconstructionMethod: ReconstructionMethod;
  confidenceScore: number; // 0.00 to 1.00
  uncertaintyMargin?: number;
  abstainReason?: string; // Reason if status is UNRESOLVED
  explanation: string;
}

export interface ReconstructionSummary {
  datasetId: string;
  pipelineRunId: string;
  totalPointsEvaluated: number;
  measuredCount: number;
  estimatedCount: number;
  correctedCount: number;
  unresolvedCount: number;
  averageConfidence: number;
}
