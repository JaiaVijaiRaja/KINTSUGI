import { apiService, ApiServiceError } from './api';
import type {
  PipelineConfig,
  PipelineConfigCreate,
  PipelineConfigUpdate,
  PipelineListResponse,
  PipelineRun,
  PipelineValidationResponse,
} from '../types/pipeline';
import type { DetectionRun } from '../types/anomaly';
import type { PaginatedResponse } from '../types/api';

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
      // Non-JSON response body
    }
    throw new ApiServiceError(message, res.status, details);
  }
  return res.json() as Promise<T>;
}

export const pipelineService = {
  /**
   * Validate a pipeline configuration against actual dataset schema and quality metrics.
   * Does NOT save the configuration or execute a pipeline.
   */
  async validateConfig(
    config: PipelineConfigCreate
  ): Promise<PipelineValidationResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(config),
      });
      return await handleResponse<PipelineValidationResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Validation request failed: ${msg}`);
    }
  },

  /**
   * Create and persist a validated pipeline configuration.
   */
  async createConfig(config: PipelineConfigCreate): Promise<PipelineConfig> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(config),
      });
      return await handleResponse<PipelineConfig>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to save configuration: ${msg}`);
    }
  },

  /**
   * List all saved pipeline configurations from persistent storage.
   */
  async listConfigs(): Promise<PipelineListResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<PipelineListResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to list configurations: ${msg}`);
    }
  },

  /**
   * Retrieve a specific saved pipeline configuration by ID.
   */
  async getConfigById(pipelineId: string): Promise<PipelineConfig> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines/${pipelineId}`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<PipelineConfig>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch configuration: ${msg}`);
    }
  },

  /**
   * Update an existing configuration with version increment.
   */
  async updateConfig(
    pipelineId: string,
    config: PipelineConfigUpdate
  ): Promise<PipelineConfig> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/pipelines/${pipelineId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(config),
      });
      return await handleResponse<PipelineConfig>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to update configuration: ${msg}`);
    }
  },

  /**
   * Execution endpoint (runs managed through anomalyService).
   */
  async executePipeline(_configId: string): Promise<PipelineRun> {
    throw new ApiServiceError(
      'Direct pipeline execution is managed via the Anomaly Explorer.',
      501
    );
  },

  async listRuns(): Promise<PaginatedResponse<PipelineRun>> {
    throw new ApiServiceError(
      'Pipeline runs are managed via the Anomaly Explorer.',
      501
    );
  },

  /**
   * List historical detection runs executed under a specific pipeline.
   */
  async listPipelineRuns(
    pipelineId: string
  ): Promise<{ runs: DetectionRun[]; total: number }> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/pipelines/${encodeURIComponent(pipelineId)}/runs`,
        {
          headers: { Accept: 'application/json' },
        }
      );
      return await handleResponse<{ runs: DetectionRun[]; total: number }>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to list detection runs: ${msg}`);
    }
  },
};
