import type { HealthResponse } from '../types/api';

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ||
  'http://127.0.0.1:8000';

export class ApiServiceError extends Error {
  code?: number;
  details?: unknown;

  constructor(message: string, code?: number, details?: unknown) {
    super(message);
    this.name = 'ApiServiceError';
    this.code = code;
    this.details = details;
  }
}

export const apiService = {
  getBaseUrl(): string {
    return API_BASE_URL;
  },

  /**
   * Performs an actual HTTP GET request to /api/health with latency tracking and timeout.
   */
  async checkHealth(timeoutMs: number = 5000): Promise<{ data: HealthResponse; latencyMs: number }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const startTime = performance.now();

    try {
      const response = await fetch(`${API_BASE_URL}/api/health`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        signal: controller.signal,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      if (!response.ok) {
        let errorMsg = `Server responded with HTTP ${response.status}`;
        try {
          const errBody = await response.json();
          if (errBody?.error?.message) {
            errorMsg = errBody.error.message;
          }
        } catch {
          // Ignore JSON parsing error for error body
        }
        throw new ApiServiceError(errorMsg, response.status);
      }

      const data: HealthResponse = await response.json();
      return { data, latencyMs };
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) {
        throw err;
      }

      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new ApiServiceError(
          `Connection timed out after ${timeoutMs}ms. Backend at ${API_BASE_URL} took too long to respond.`,
          408
        );
      }

      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(
        `Failed to connect to backend at ${API_BASE_URL}/api/health. Ensure the FastAPI service is running. (${rawMsg})`
      );
    } finally {
      clearTimeout(timeoutId);
    }
  },
};
