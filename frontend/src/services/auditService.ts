/**
 * API client service for KINTSUGI Audit Trail and Explainability Engine (Phase 8).
 */

import { apiService } from './api';
import type {
  AuditEvent,
  AuditEventListResponse,
  AuditFilterParams,
  CausalTraceResponse,
  HashChainVerificationResponse,
  ObservationHistoryResponse,
} from '../types/audit';

function getApiBase(): string {
  return `${apiService.getBaseUrl()}/api/audit`;
}

async function handleAuditResponse<T>(res: Response, fallbackMsg: string): Promise<T> {
  if (!res.ok) {
    let msg = fallbackMsg;
    try {
      const err = await res.json();
      if (err?.error?.message) {
        msg = err.error.message;
      } else if (err?.detail) {
        msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      }
    } catch {
      // non-JSON
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const auditService = {
  /**
   * List audit ledger events with optional filtering and pagination.
   */
  async listEvents(params: AuditFilterParams = {}): Promise<AuditEventListResponse> {
    const query = new URLSearchParams();
    if (params.dataset_id) query.set('dataset_id', params.dataset_id);
    if (params.pipeline_id) query.set('pipeline_id', params.pipeline_id);
    if (params.event_type) query.set('event_type', params.event_type);
    if (params.sensor_column) query.set('sensor_column', params.sensor_column);
    if (params.run_id) query.set('run_id', params.run_id);
    if (params.status) query.set('status', params.status);
    if (params.start_time) query.set('start_time', params.start_time);
    if (params.end_time) query.set('end_time', params.end_time);
    if (params.limit !== undefined) query.set('limit', params.limit.toString());
    if (params.offset !== undefined) query.set('offset', params.offset.toString());

    const queryString = query.toString();
    const url = queryString ? `${getApiBase()}/events?${queryString}` : `${getApiBase()}/events`;

    const res = await fetch(url);
    return handleAuditResponse<AuditEventListResponse>(
      res,
      `Failed to fetch audit events (HTTP ${res.status})`
    );
  },

  /**
   * Retrieve a specific audit event by event ID.
   */
  async getEvent(eventId: string): Promise<AuditEvent> {
    const res = await fetch(`${getApiBase()}/events/${encodeURIComponent(eventId)}`);
    return handleAuditResponse<AuditEvent>(
      res,
      `Failed to fetch audit event ${eventId} (HTTP ${res.status})`
    );
  },

  /**
   * Assemble chronological lifecycle history and raw values for a dataset row index.
   */
  async getObservationHistory(
    datasetId: string,
    rowId: number
  ): Promise<ObservationHistoryResponse> {
    const res = await fetch(
      `${getApiBase()}/observations/${encodeURIComponent(datasetId)}/${rowId}`
    );
    return handleAuditResponse<ObservationHistoryResponse>(
      res,
      `Failed to fetch history for row ${rowId} (HTTP ${res.status})`
    );
  },

  /**
   * Assemble end-to-end causal trace for a reconstruction result ID.
   */
  async getCausalTrace(reconstructionResultId: string): Promise<CausalTraceResponse> {
    const res = await fetch(
      `${getApiBase()}/traces/${encodeURIComponent(reconstructionResultId)}`
    );
    return handleAuditResponse<CausalTraceResponse>(
      res,
      `Failed to fetch causal trace for ${reconstructionResultId} (HTTP ${res.status})`
    );
  },

  /**
   * Retrieve audit events associated with a specific run.
   */
  async getRunEvents(
    runId: string,
    limit: number = 200,
    offset: number = 0
  ): Promise<AuditEventListResponse> {
    const res = await fetch(
      `${getApiBase()}/runs/${encodeURIComponent(runId)}?limit=${limit}&offset=${offset}`
    );
    return handleAuditResponse<AuditEventListResponse>(
      res,
      `Failed to fetch run audit events (HTTP ${res.status})`
    );
  },

  /**
   * Verify cryptographic SHA-256 hash-chain integrity.
   */
  async verifyHashChain(): Promise<HashChainVerificationResponse> {
    const res = await fetch(`${getApiBase()}/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    return handleAuditResponse<HashChainVerificationResponse>(
      res,
      `Failed to verify hash chain (HTTP ${res.status})`
    );
  },

  /**
   * Get direct download URL for exporting audit ledger.
   */
  getExportUrl(params: AuditFilterParams = {}, format: 'jsonl' | 'csv' = 'jsonl'): string {
    const query = new URLSearchParams();
    query.set('format', format);
    if (params.dataset_id) query.set('dataset_id', params.dataset_id);
    if (params.pipeline_id) query.set('pipeline_id', params.pipeline_id);
    if (params.event_type) query.set('event_type', params.event_type);
    if (params.sensor_column) query.set('sensor_column', params.sensor_column);
    if (params.run_id) query.set('run_id', params.run_id);
    if (params.status) query.set('status', params.status);
    if (params.start_time) query.set('start_time', params.start_time);
    if (params.end_time) query.set('end_time', params.end_time);
    if (params.limit) query.set('limit', params.limit.toString());

    return `${getApiBase()}/export?${query.toString()}`;
  },

  /**
   * Trigger direct browser download of the export.
   */
  async downloadExport(
    params: AuditFilterParams = {},
    format: 'jsonl' | 'csv' = 'jsonl'
  ): Promise<void> {
    const url = this.getExportUrl(params, format);
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `Failed to export audit records (HTTP ${res.status})`;
      try {
        const err = await res.json();
        if (err?.error?.message) {
          msg = err.error.message;
        } else if (err?.detail) {
          msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
        }
      } catch {
        // non-JSON
      }
      throw new Error(msg);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    let filename = `kintsugi_audit_export.${format}`;
    if (disposition && disposition.includes('filename=')) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) filename = match[1];
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  },
};
