/**
 * KINTSUGI Dataset Types
 * Defines dataset metadata, quality reports, column metrics, and preview models.
 * Exactly matches backend Pydantic schemas in app/schemas/dataset.py.
 */

export interface NumericStats {
  min: number;
  max: number;
  mean: number;
  std: number | null;
  median: number;
  q25: number | null;
  q75: number | null;
}

export interface ColumnSummary {
  name: string;
  detected_type: 'float' | 'integer' | 'string' | 'boolean' | 'datetime';
  is_numeric: boolean;
  missing_count: number;
  missing_percentage: number;
  unique_count: number;
  sample_values: unknown[];
  numeric_stats: NumericStats | null;
}

export interface TimestampCandidate {
  column_name: string;
  parseable_percentage: number;
  sample_format: string | null;
  duplicate_timestamp_count: number;
  duplicate_percentage: number;
  is_monotonic: boolean;
  notes: string | null;
}

export interface DataQualitySummary {
  dataset_id: string;
  total_rows: number;
  total_columns: number;
  duplicate_rows_count: number;
  duplicate_rows_percentage: number;
  total_missing_cells: number;
  missing_cells_percentage: number;
  timestamp_candidates: TimestampCandidate[];
  columns: ColumnSummary[];
  computed_at: string;
}

export interface DatasetMetadata {
  dataset_id: string;
  filename: string;
  file_size_bytes: number;
  row_count: number;
  column_count: number;
  columns: string[];
  uploaded_at: string;
  parsing_status: 'ready' | 'error';
  quality_available: boolean;
}

export interface DatasetDetailResponse {
  metadata: DatasetMetadata;
  quality: DataQualitySummary;
}

export interface DatasetPreviewResponse {
  dataset_id: string;
  columns: string[];
  rows: Record<string, unknown>[];
  total_rows: number;
  preview_rows: number;
  offset: number;
  limit: number;
}

export interface DatasetListResponse {
  datasets: DatasetMetadata[];
  total: number;
}
