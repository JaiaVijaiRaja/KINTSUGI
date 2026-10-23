import { ApiServiceError } from './api';
import type { ReconstructionRecord, ReconstructionSummary } from '../types/reconstruction';
import type { PaginatedResponse } from '../types/api';

/**
 * Reconstruction Service
 * 
 * Planned Backend Contract (Phase 3 & 4):
 * - GET /api/reconstruction/records (list repair decisions and status tags)
 * - GET /api/reconstruction/summary?pipelineRunId={id} (counts of MEASURED, ESTIMATED, CORRECTED, UNRESOLVED)
 * - POST /api/reconstruction/override (manual operator override with mandatory reason logging)
 */
export const reconstructionService = {
  async getReconstructionRecords(
    _pipelineRunId?: string
  ): Promise<PaginatedResponse<ReconstructionRecord>> {
    throw new ApiServiceError(
      'Reconstruction ledger endpoint (GET /api/reconstruction/records) is planned for Phase 3/4.',
      501
    );
  },

  async getSummary(_pipelineRunId: string): Promise<ReconstructionSummary> {
    throw new ApiServiceError(
      'Reconstruction summary endpoint (GET /api/reconstruction/summary) is planned for Phase 3/4.',
      501
    );
  },
};
