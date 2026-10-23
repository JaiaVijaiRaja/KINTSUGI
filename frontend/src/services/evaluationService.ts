import { ApiServiceError } from './api';
import type { EvaluationSummary } from '../types/evaluation';

/**
 * Evaluation Service
 * 
 * Planned Backend Contract (Phase 4):
 * - GET /api/evaluation/benchmarks (list available benchmark suites)
 * - POST /api/evaluation/run (trigger benchmark evaluation job)
 * - GET /api/evaluation/results/{id} (fetch RMSE, MAE, F1, and calibration curves)
 */
export const evaluationService = {
  async getLatestEvaluation(): Promise<EvaluationSummary> {
    throw new ApiServiceError(
      'Evaluation benchmark endpoint (GET /api/evaluation/results) is planned for Phase 4.',
      501
    );
  },
};
