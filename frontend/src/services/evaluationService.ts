import { apiService, ApiServiceError } from './api';
import type {
  CreateEvaluationRequest,
  EvaluationBreakdownResponse,
  EvaluationListResponse,
  EvaluationManifestResponse,
  EvaluationMetricsResponse,
  EvaluationRun,
  EvaluationValidationResponse,
} from '../types/evaluation';

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

export const evaluationService = {
  /**
   * Create and execute a new evaluation run.
   * Supports Mode A (controlled fault-injection benchmark) and Mode B (existing run inspection).
   */
  async executeEvaluation(request: CreateEvaluationRequest): Promise<EvaluationRun> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(request),
    });
    return handleResponse<EvaluationRun>(res);
  },

  /**
   * List historical persisted evaluation runs with pagination and optional filtering.
   */
  async listEvaluations(
    datasetId?: string,
    mode?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<EvaluationListResponse> {
    const baseUrl = apiService.getBaseUrl();
    const params = new URLSearchParams();
    if (datasetId) params.append('dataset_id', datasetId);
    if (mode) params.append('mode', mode);
    params.append('limit', limit.toString());
    params.append('offset', offset.toString());

    const res = await fetch(`${baseUrl}/api/evaluations?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationListResponse>(res);
  },

  /**
   * Retrieve full details of an evaluation run.
   */
  async getEvaluation(evaluationId: string): Promise<EvaluationRun> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(evaluationId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationRun>(res);
  },

  /**
   * Retrieve quantitative metrics and formal definitions.
   */
  async getEvaluationMetrics(evaluationId: string): Promise<EvaluationMetricsResponse> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(evaluationId)}/metrics`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationMetricsResponse>(res);
  },

  /**
   * Retrieve per-sensor and per-fault breakdowns.
   */
  async getEvaluationBreakdown(evaluationId: string): Promise<EvaluationBreakdownResponse> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(evaluationId)}/breakdown`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationBreakdownResponse>(res);
  },

  /**
   * Retrieve machine-readable ground truth manifest.
   */
  async getEvaluationManifest(evaluationId: string): Promise<EvaluationManifestResponse> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(evaluationId)}/manifest`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationManifestResponse>(res);
  },

  /**
   * Execute non-destructive consistency checks on an evaluation run.
   */
  async validateEvaluation(evaluationId: string): Promise<EvaluationValidationResponse> {
    const baseUrl = apiService.getBaseUrl();
    const res = await fetch(`${baseUrl}/api/evaluations/${encodeURIComponent(evaluationId)}/validate`, {
      method: 'POST',
      headers: { Accept: 'application/json' },
    });
    return handleResponse<EvaluationValidationResponse>(res);
  },
};
