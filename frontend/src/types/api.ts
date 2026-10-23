/**
 * Types for API responses, errors, and connection states.
 */

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
  timestamp: string;
}

export interface ApiErrorDetail {
  code: number;
  message: string;
  details?: unknown;
  path?: string;
}

export interface ApiErrorResponse {
  error: ApiErrorDetail;
}

export type ConnectionStatus = 'loading' | 'connected' | 'disconnected' | 'error';

export interface ConnectionState {
  status: ConnectionStatus;
  data: HealthResponse | null;
  error: string | null;
  latencyMs: number | null;
  lastChecked: Date | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
