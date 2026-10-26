import { apiService, ApiServiceError } from './api';
import type {
  ReconstructionRecord,
  ReconstructionResultsResponse,
  ReconstructionRun,
  ReconstructionRunListResponse,
  ReconstructionRunResponse,
  ReviewDecisionRequest,
} from '../types/reconstruction';

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Server responded with HTTP ${res.status}`;
    let details: unknown = undefined;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
        details = errBody.error.details;
      } else if (errBody?.detail) {
        if (typeof errBody.detail === 'string') {
          message = errBody.detail;
        } else if (typeof errBody.detail === 'object' && errBody.detail.message) {
          message = errBody.detail.message;
          details = errBody.detail;
        } else {
          message = JSON.stringify(errBody.detail);
          details = errBody.detail;
        }
      }
    } catch {
      // Non-JSON error body
    }
    throw new ApiServiceError(message, res.status, details);
  }
  return res.json() as Promise<T>;
}

export const reconstructionService = {
  /**
   * Execute confidence-aware signal reconstruction for a completed anomaly detection run.
   * Examines flagged observations, calculates evidence-based confidence, and records audit trail.
   */
  async executeReconstruction(
    pipelineId: string,
    detectionRunId: string
  ): Promise<ReconstructionRunResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(detectionRunId)}/reconstruct`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<ReconstructionRunResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to trigger reconstruction: ${String(err)}`);
    }
  },

  /**
   * List historical reconstruction runs, optionally filtered by pipeline or detection run.
   */
  async listRuns(
    pipelineId?: string,
    detectionRunId?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ReconstructionRunListResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const qp = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (pipelineId) qp.set('pipeline_id', pipelineId);
      if (detectionRunId) qp.set('detection_run_id', detectionRunId);

      const res = await fetch(`${baseUrl}/api/reconstruction/runs?${qp.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      return await handleResponse<ReconstructionRunListResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to list reconstruction runs: ${String(err)}`);
    }
  },

  /**
   * Retrieve metadata, execution state, and summary metrics for a specific reconstruction run.
   */
  async getRun(reconstructionRunId: string): Promise<ReconstructionRun> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/reconstruction/runs/${encodeURIComponent(reconstructionRunId)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<ReconstructionRun>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch reconstruction run: ${String(err)}`);
    }
  },

  /**
   * Retrieve paginated reconstruction records with filtering by sensor channel and status.
   */
  async getResults(
    reconstructionRunId: string,
    sensorColumn?: string,
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<ReconstructionResultsResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const qp = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (sensorColumn && sensorColumn !== 'ALL') qp.set('sensor_column', sensorColumn);
      if (status && status !== 'ALL') qp.set('status', status);

      const res = await fetch(
        `${baseUrl}/api/reconstruction/runs/${encodeURIComponent(reconstructionRunId)}/results?${qp.toString()}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<ReconstructionResultsResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch reconstruction results: ${String(err)}`);
    }
  },

  /**
   * Retrieve single reconstruction record with full evidence references and confidence factor breakdown.
   */
  async getResultById(resultId: string): Promise<ReconstructionRecord> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/reconstruction/results/${encodeURIComponent(resultId)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<ReconstructionRecord>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch reconstruction record: ${String(err)}`);
    }
  },

  /**
   * Record an explicit operator review decision (ACCEPT, REJECT, or MODIFY).
   */
  async reviewResult(
    resultId: string,
    payload: ReviewDecisionRequest
  ): Promise<ReconstructionRecord> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/reconstruction/results/${encodeURIComponent(resultId)}/review`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(payload),
        }
      );
      return await handleResponse<ReconstructionRecord>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to record review decision: ${String(err)}`);
    }
  },

  /**
   * Trigger direct browser download of the reconstructed dataset export.
   */
  async downloadExport(
    reconstructionRunId: string,
    format: 'csv' | 'json' = 'csv'
  ): Promise<void> {
    const baseUrl = apiService.getBaseUrl();
    const url = `${baseUrl}/api/reconstruction/runs/${encodeURIComponent(reconstructionRunId)}/export?format=${format}`;
    const res = await fetch(url);
    if (!res.ok) {
      let msg = `Failed to export reconstructed dataset (HTTP ${res.status})`;
      try {
        const err = await res.json();
        if (err?.error?.message) msg = err.error.message;
        else if (err?.detail) msg = typeof err.detail === 'string' ? err.detail : JSON.stringify(err.detail);
      } catch {
        // non-JSON
      }
      throw new ApiServiceError(msg, res.status);
    }

    const blob = await res.blob();
    const disposition = res.headers.get('Content-Disposition');
    let filename = `kintsugi_reconstruction_${reconstructionRunId}.${format}`;
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

