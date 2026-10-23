import { apiService, ApiServiceError } from './api';
import type {
  AnomalyListResponse,
  AnomalyQueryParams,
  AnomalyRecord,
  DetectionRun,
  DetectionRunResponse,
  DetectionRunResultsResponse,
} from '../types/anomaly';

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

export const anomalyService = {
  /**
   * Execute an anomaly detection run using the validated pipeline configuration.
   * Runs actual statistical MAD and Isolation Forest algorithms on stored sensor data.
   */
  async runDetection(pipelineId: string): Promise<DetectionRunResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines/${encodeURIComponent(pipelineId)}/run`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      });
      return await handleResponse<DetectionRunResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to trigger detection run: ${String(err)}`);
    }
  },

  /**
   * Retrieve execution status, summary counts, and diagnostic warnings for a specific run.
   */
  async getRunStatus(pipelineId: string, runId: string): Promise<DetectionRun> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<DetectionRun>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch run status: ${String(err)}`);
    }
  },

  /**
   * Retrieve persisted anomaly records for a specific completed detection run.
   */
  async getRunResults(
    pipelineId: string,
    runId: string,
    limit: number = 100,
    offset: number = 0
  ): Promise<DetectionRunResultsResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      const res = await fetch(
        `${baseUrl}/api/pipelines/${encodeURIComponent(pipelineId)}/runs/${encodeURIComponent(runId)}/results?${params}`,
        {
          method: 'GET',
          headers: {
            Accept: 'application/json',
          },
        }
      );
      return await handleResponse<DetectionRunResultsResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch run results: ${String(err)}`);
    }
  },

  /**
   * Query and filter anomaly records across runs by dataset, sensor, detector, or severity.
   */
  async getAnomalies(params?: AnomalyQueryParams): Promise<AnomalyListResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const qp = new URLSearchParams();
      if (params?.dataset_id) qp.set('dataset_id', params.dataset_id);
      if (params?.run_id) qp.set('run_id', params.run_id);
      if (params?.sensor_column) qp.set('sensor_column', params.sensor_column);
      if (params?.detector_name) qp.set('detector_name', params.detector_name);
      if (params?.severity) qp.set('severity', params.severity);
      if (params?.limit !== undefined) qp.set('limit', String(params.limit));
      if (params?.offset !== undefined) qp.set('offset', String(params.offset));

      const res = await fetch(`${baseUrl}/api/anomalies?${qp.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      return await handleResponse<AnomalyListResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to query anomalies: ${String(err)}`);
    }
  },

  /**
   * Retrieve full details for a single anomaly record.
   */
  async getAnomalyById(anomalyId: string): Promise<AnomalyRecord> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/anomalies/${encodeURIComponent(anomalyId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });
      return await handleResponse<AnomalyRecord>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      throw new ApiServiceError(`Failed to fetch anomaly '${anomalyId}': ${String(err)}`);
    }
  },
};
