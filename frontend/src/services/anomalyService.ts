import { ApiServiceError } from './api';
import type { AnomalyRecord, AnomalyFilter } from '../types/anomaly';
import type { PaginatedResponse } from '../types/api';

/**
 * Anomaly Service
 * 
 * Planned Backend Contract (Phase 3):
 * - GET /api/anomalies (query detected anomalies with filters)
 * - GET /api/anomalies/summary?datasetId={id} (anomaly count by severity/type)
 * - GET /api/anomalies/timeseries?sensorId={id} (time-series points with anomaly flags)
 */
export const anomalyService = {
  async getAnomalies(_filter?: AnomalyFilter): Promise<PaginatedResponse<AnomalyRecord>> {
    throw new ApiServiceError(
      'Anomaly detection query endpoint (GET /api/anomalies) is planned for Phase 3.',
      501
    );
  },
};
