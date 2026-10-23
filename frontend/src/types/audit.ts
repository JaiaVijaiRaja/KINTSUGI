import type { ProcessingStatus, ReconstructionMethod } from './reconstruction';

/**
 * KINTSUGI Audit Trail Types
 * Represents immutable append-only ledger entries recording every pipeline decision.
 */

export type AuditActionType =
  | 'RAW_INGESTION'
  | 'ANOMALY_FLAGGED'
  | 'RECONSTRUCTION_PROPOSED'
  | 'ABSTAIN_FLAGGED'
  | 'VALUE_COMMITTED'
  | 'MANUAL_OVERRIDE';

export interface AuditRecord {
  id: string;
  timestamp: string;
  datasetId: string;
  pipelineRunId: string;
  sensorId: string;
  action: AuditActionType;
  rawMeasuredValue: number | null;
  proposedValue: number | null;
  finalValue: number | null;
  method: ReconstructionMethod;
  confidenceScore: number | null;
  status: ProcessingStatus;
  decisionReason: string;
  actor: string; // 'pipeline_auto_engine' or operator identifier
  hashSha256?: string; // Cryptographic lineage digest
}

export interface AuditFilter {
  datasetId?: string;
  pipelineRunId?: string;
  sensorId?: string;
  status?: ProcessingStatus;
  action?: AuditActionType;
  startTime?: string;
  endTime?: string;
}
