import { apiService, ApiServiceError } from './api';

export interface DemoScenarioInfo {
  demo_id: string;
  title: string;
  scenario_type: string;
  description: string;
  dataset_file: string;
  row_count: number;
  sensor_columns: string[];
  timestamp_column: string;
  fault_scenarios: Array<{
    target: string;
    row_index: number;
    fault: string;
    expected_status: string;
    reason: string;
  }>;
  expected_outcomes: Record<string, unknown>;
}

export interface ErrorValidationResponse {
  error_type: string;
  status_code: number;
  user_message: string;
  technical_code: string;
  data_preserved: boolean;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Server responded with HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        message = errBody.error.message;
      } else if (errBody?.detail) {
        message = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      // Non-JSON
    }
    throw new ApiServiceError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export const demoService = {
  /**
   * List documented demonstration scenarios (Demo 1 & Demo 2).
   */
  async listDemos(): Promise<DemoScenarioInfo[]> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/demos`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<DemoScenarioInfo[]>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch demo catalog: ${msg}`);
    }
  },

  /**
   * Get single demonstration scenario info.
   */
  async getDemo(demoId: string): Promise<DemoScenarioInfo> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/demos/${encodeURIComponent(demoId)}`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<DemoScenarioInfo>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch demo details: ${msg}`);
    }
  },

  /**
   * Get reference ground truth manifest for evaluation.
   */
  async getDemoManifest(demoId: string): Promise<Record<string, unknown>> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/demos/${encodeURIComponent(demoId)}/manifest`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<Record<string, unknown>>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch demo ground truth: ${msg}`);
    }
  },

  /**
   * Simulate a backend validation error to demonstrate safe error recovery.
   */
  async simulateError(errorType: string): Promise<ErrorValidationResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/demos/simulate-error`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ error_type: errorType }),
      });
      return await handleResponse<ErrorValidationResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to simulate error: ${msg}`);
    }
  },
};
