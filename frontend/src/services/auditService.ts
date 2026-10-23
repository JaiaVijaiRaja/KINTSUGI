import { ApiServiceError } from './api';
import type { AuditRecord, AuditFilter } from '../types/audit';
import type { PaginatedResponse } from '../types/api';

/**
 * Audit Service
 * 
 * Planned Backend Contract (Phase 4):
 * - GET /api/audit/records (query immutable audit ledger)
 * - GET /api/audit/verify/{recordId} (cryptographic hash integrity verification)
 * - GET /api/audit/export (export ledger as signed JSONL / Parquet)
 */
export const auditService = {
  async getAuditRecords(_filter?: AuditFilter): Promise<PaginatedResponse<AuditRecord>> {
    throw new ApiServiceError(
      'Audit ledger endpoint (GET /api/audit/records) is planned for Phase 4.',
      501
    );
  },
};
