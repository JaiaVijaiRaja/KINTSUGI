import { apiService, ApiServiceError } from './api';
import type {
  DatasetDetailResponse,
  DatasetListResponse,
  DatasetMetadata,
  DatasetPreviewResponse,
  DataQualitySummary,
} from '../types/dataset';

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
      // Ignore JSON parse error on non-JSON body
    }
    throw new ApiServiceError(message, res.status);
  }
  return res.json() as Promise<T>;
}

export const datasetService = {
  /**
   * Upload and ingest a CSV file using multipart/form-data.
   */
  async uploadDataset(file: File): Promise<DatasetDetailResponse> {
    const baseUrl = apiService.getBaseUrl();
    const formData = new FormData();
    formData.append('file', file, file.name);

    try {
      const res = await fetch(`${baseUrl}/api/datasets/upload`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });
      return await handleResponse<DatasetDetailResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Upload failed: ${msg}`);
    }
  },

  /**
   * List all cataloged datasets from the backend.
   */
  async listDatasets(): Promise<DatasetListResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/datasets`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<DatasetListResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch datasets: ${msg}`);
    }
  },

  /**
   * Fetch metadata for a specific dataset.
   */
  async getDatasetById(datasetId: string): Promise<DatasetMetadata> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/datasets/${datasetId}`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<DatasetMetadata>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch dataset metadata: ${msg}`);
    }
  },

  /**
   * Fetch bounded row preview for inspection.
   */
  async getDatasetPreview(
    datasetId: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<DatasetPreviewResponse> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(
        `${baseUrl}/api/datasets/${datasetId}/preview?limit=${limit}&offset=${offset}`,
        { headers: { Accept: 'application/json' } }
      );
      return await handleResponse<DatasetPreviewResponse>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch dataset preview: ${msg}`);
    }
  },

  /**
   * Fetch calculated data-quality report.
   */
  async getDatasetQuality(datasetId: string): Promise<DataQualitySummary> {
    const baseUrl = apiService.getBaseUrl();
    try {
      const res = await fetch(`${baseUrl}/api/datasets/${datasetId}/quality`, {
        headers: { Accept: 'application/json' },
      });
      return await handleResponse<DataQualitySummary>(res);
    } catch (err: unknown) {
      if (err instanceof ApiServiceError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      throw new ApiServiceError(`Failed to fetch data quality summary: ${msg}`);
    }
  },
};
