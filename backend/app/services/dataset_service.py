import io
import json
import logging
import math
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import HTTPException, UploadFile, status

from app.core.config import settings
from app.schemas.dataset import (
    ColumnSummary,
    DataQualitySummary,
    DatasetDetailResponse,
    DatasetListResponse,
    DatasetMetadata,
    DatasetPreviewResponse,
    NumericStats,
    TimestampCandidate,
)

logger = logging.getLogger("kintsugi.dataset_service")


def get_storage_path() -> Path:
    """Resolve and ensure the local dataset storage directory exists."""
    base = Path(settings.STORAGE_DIR)
    if not base.is_absolute():
        cwd = Path.cwd()
        if (cwd / "backend").is_dir():
            base = cwd / "backend" / base
        else:
            base = cwd / base
    base.mkdir(parents=True, exist_ok=True)
    return base


def sanitize_filename(filename: Optional[str]) -> str:
    """Sanitize uploaded client filename to prevent path traversal or unsafe characters."""
    if not filename:
        return "unnamed_dataset.csv"
    # Take basename only
    base_name = Path(filename).name
    # Strip dangerous characters
    cleaned = re.sub(r"[^\w\.\-\_]", "_", base_name)
    return cleaned if cleaned else "dataset.csv"


def clean_nan(val: Any) -> Any:
    """Convert numpy/float NaN, inf, -inf to None for JSON serialization."""
    if val is None:
        return None
    if isinstance(val, (float, np.floating)):
        if math.isnan(val) or math.isinf(val):
            return None
    return val


def decode_csv_bytes(content: bytes) -> str:
    """Attempt decoding CSV bytes with standard encodings."""
    encodings = ["utf-8-sig", "utf-8", "latin-1"]
    for enc in encodings:
        try:
            return content.decode(enc)
        except UnicodeDecodeError:
            continue
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Unable to decode CSV file. Only UTF-8 and Latin-1 text encodings are supported.",
    )


def compute_column_summary(col_name: str, series: pd.Series) -> ColumnSummary:
    """Compute type detection, missing values, and descriptive statistics for a single column."""
    total_count = len(series)
    missing_count = int(series.isna().sum())
    missing_pct = round((missing_count / total_count * 100.0), 2) if total_count > 0 else 0.0

    non_null_series = series.dropna()
    unique_count = int(non_null_series.nunique())

    # Sample non-null values for inspection
    sample_values = [clean_nan(v) for v in non_null_series.head(5).tolist()]

    # Check numeric type
    is_numeric = pd.api.types.is_numeric_dtype(series)
    numeric_stats: Optional[NumericStats] = None
    detected_type = "string"

    if pd.api.types.is_bool_dtype(series):
        detected_type = "boolean"
    elif pd.api.types.is_datetime64_any_dtype(series):
        detected_type = "datetime"
    elif is_numeric:
        if pd.api.types.is_integer_dtype(series):
            detected_type = "integer"
        else:
            detected_type = "float"

        if len(non_null_series) > 0:
            std_val = non_null_series.std()
            numeric_stats = NumericStats(
                min=float(non_null_series.min()),
                max=float(non_null_series.max()),
                mean=round(float(non_null_series.mean()), 4),
                std=round(float(std_val), 4) if pd.notna(std_val) else None,
                median=float(non_null_series.median()),
                q25=round(float(non_null_series.quantile(0.25)), 4),
                q75=round(float(non_null_series.quantile(0.75)), 4),
            )
    else:
        # Check if text column can be parsed cleanly as numeric
        try:
            converted = pd.to_numeric(non_null_series, errors="raise")
            is_numeric = True
            detected_type = "integer" if (converted % 1 == 0).all() else "float"
            std_val = converted.std()
            numeric_stats = NumericStats(
                min=float(converted.min()),
                max=float(converted.max()),
                mean=round(float(converted.mean()), 4),
                std=round(float(std_val), 4) if pd.notna(std_val) else None,
                median=float(converted.median()),
                q25=round(float(converted.quantile(0.25)), 4),
                q75=round(float(converted.quantile(0.75)), 4),
            )
        except (ValueError, TypeError, OverflowError):
            detected_type = "string"

    return ColumnSummary(
        name=col_name,
        detected_type=detected_type,
        is_numeric=is_numeric,
        missing_count=missing_count,
        missing_percentage=missing_pct,
        unique_count=unique_count,
        sample_values=sample_values,
        numeric_stats=numeric_stats,
    )


def evaluate_timestamp_candidate(col_name: str, series: pd.Series) -> Optional[TimestampCandidate]:
    """Conservatively evaluate whether a column represents a time/date series."""
    non_null = series.dropna()
    if len(non_null) == 0:
        return None

    col_lower = col_name.lower()
    has_time_name = any(k in col_lower for k in ["time", "date", "timestamp", "datetime", "epoch", "_ts"])

    # Non-negotiable: Purely numeric columns without time-related names are sensor measurements, NOT timestamps
    if pd.api.types.is_numeric_dtype(series) and not has_time_name:
        return None

    # Attempt datetime conversion on a sample first for performance
    sample_size = min(100, len(non_null))
    sample = non_null.head(sample_size)

    try:
        parsed_sample = pd.to_datetime(sample, errors="coerce")
        valid_sample_count = parsed_sample.notna().sum()
        sample_parseable_ratio = valid_sample_count / sample_size
    except Exception:
        sample_parseable_ratio = 0.0

    # Only proceed if name strongly indicates time OR >75% of sample values parse as datetime
    if not has_time_name and sample_parseable_ratio < 0.75:
        return None

    # Parse full series
    try:
        parsed_full = pd.to_datetime(non_null, errors="coerce")
        valid_count = int(parsed_full.notna().sum())
        parseable_pct = round((valid_count / len(non_null) * 100.0), 2)

        if parseable_pct < 50.0:
            return None

        valid_times = parsed_full.dropna()
        dup_count = int(valid_times.duplicated().sum())
        dup_pct = round((dup_count / len(valid_times) * 100.0), 2) if len(valid_times) > 0 else 0.0
        is_monotonic = bool(valid_times.is_monotonic_increasing)

        sample_format = str(sample.iloc[0]) if len(sample) > 0 else None
        notes = (
            "Monotonically increasing uniform or sequential timestamps."
            if is_monotonic
            else "Timestamps are not strictly monotonic; check for out-of-order packets or duplicate timestamps."
        )

        return TimestampCandidate(
            column_name=col_name,
            parseable_percentage=parseable_pct,
            sample_format=sample_format,
            duplicate_timestamp_count=dup_count,
            duplicate_percentage=dup_pct,
            is_monotonic=is_monotonic,
            notes=notes,
        )
    except Exception:
        return None


class DatasetService:
    """Service orchestrating dataset parsing, validation, local storage, and quality metrics."""

    async def ingest_dataset(self, file: UploadFile) -> DatasetDetailResponse:
        """Validate, parse, store CSV file, and compute data quality summary."""
        # 1. Filename validation
        filename = sanitize_filename(file.filename)
        if not filename.lower().endswith(".csv"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid file extension for '{filename}'. Only .csv files are supported.",
            )

        # 2. Read and size validation
        content = await file.read()
        file_size = len(content)

        if file_size == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty (0 bytes).",
            )

        if file_size > settings.MAX_UPLOAD_SIZE_BYTES:
            max_mb = settings.MAX_UPLOAD_SIZE_BYTES / (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"File size ({round(file_size / (1024 * 1024), 2)} MB) exceeds maximum permitted limit of {int(max_mb)} MB.",
            )

        # 3. Text decoding
        decoded_text = decode_csv_bytes(content)

        # 4. Validate raw headers and row consistency using strict csv reader
        import csv
        try:
            reader = csv.reader(io.StringIO(decoded_text), strict=True)
            try:
                raw_headers = next(reader)
            except StopIteration:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV file contains no content or header line.",
                )

            if not raw_headers:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV contains no header columns.",
                )

            # Normalize column names: strip whitespace
            normalized_cols = [str(c).strip() for c in raw_headers]

            # Check for empty column names
            if any(c == "" for c in normalized_cols):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV header row contains empty or whitespace-only column names.",
                )

            # Check for duplicate column names in header
            seen = set()
            duplicates = set()
            for col in normalized_cols:
                if col in seen:
                    duplicates.add(col)
                seen.add(col)

            if duplicates:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"CSV contains duplicate column headers: {sorted(list(duplicates))}",
                )

            # Check row count and column consistency
            expected_col_count = len(normalized_cols)
            data_row_count = 0
            for row_idx, row in enumerate(reader, start=2):
                if not row:
                    continue  # Skip blank lines
                data_row_count += 1
                if len(row) != expected_col_count:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Malformed CSV: row {row_idx} has {len(row)} columns, expected {expected_col_count}.",
                    )

            if data_row_count == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="CSV contains header columns but no data rows (minimum 1 data row required).",
                )

        except csv.Error as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed CSV syntax: {str(e)}",
            )

        # 5. Parse DataFrame with pandas
        try:
            df = pd.read_csv(
                io.StringIO(decoded_text),
                skipinitialspace=True,
                on_bad_lines="error",
            )
            df.columns = normalized_cols
        except HTTPException:
            raise
        except Exception as e:
            logger.warning("CSV parsing error on %s: %s", filename, str(e))
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Malformed CSV syntax or unparseable structure: {str(e)}",
            )

        # Check row and column limits
        if len(df) > settings.MAX_DATASET_ROWS:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Dataset has {len(df)} rows, exceeding maximum limit of {settings.MAX_DATASET_ROWS} rows.",
            )

        if len(df.columns) > settings.MAX_DATASET_COLS:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Dataset has {len(df.columns)} columns, exceeding maximum limit of {settings.MAX_DATASET_COLS} columns.",
            )

        # 6. Generate server-controlled safe dataset ID
        dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        storage_base = get_storage_path()
        dataset_dir = storage_base / dataset_id

        try:
            dataset_dir.mkdir(parents=True, exist_ok=False)

            # Store original raw CSV
            csv_path = dataset_dir / "data.csv"
            with open(csv_path, "wb") as f:
                f.write(content)

            # 7. Compute genuine data quality summary
            total_rows = len(df)
            total_cols = len(df.columns)
            duplicate_rows_count = int(df.duplicated().sum())
            duplicate_rows_pct = round((duplicate_rows_count / total_rows * 100.0), 2) if total_rows > 0 else 0.0

            total_missing_cells = int(df.isna().sum().sum())
            total_cells = total_rows * total_cols
            missing_cells_pct = round((total_missing_cells / total_cells * 100.0), 2) if total_cells > 0 else 0.0

            columns_summary: List[ColumnSummary] = []
            for col in df.columns:
                columns_summary.append(compute_column_summary(col, df[col]))

            # Timestamp candidate detection
            timestamp_candidates: List[TimestampCandidate] = []
            for col in df.columns:
                candidate = evaluate_timestamp_candidate(col, df[col])
                if candidate:
                    timestamp_candidates.append(candidate)

            quality_summary = DataQualitySummary(
                dataset_id=dataset_id,
                total_rows=total_rows,
                total_columns=total_cols,
                duplicate_rows_count=duplicate_rows_count,
                duplicate_rows_percentage=duplicate_rows_pct,
                total_missing_cells=total_missing_cells,
                missing_cells_percentage=missing_cells_pct,
                timestamp_candidates=timestamp_candidates,
                columns=columns_summary,
                computed_at=now_iso,
            )

            # Store quality summary JSON
            quality_path = dataset_dir / "quality.json"
            with open(quality_path, "w", encoding="utf-8") as f:
                f.write(quality_summary.model_dump_json(indent=2))

            # Store metadata JSON
            metadata = DatasetMetadata(
                dataset_id=dataset_id,
                filename=filename,
                file_size_bytes=file_size,
                row_count=total_rows,
                column_count=total_cols,
                columns=list(df.columns),
                uploaded_at=now_iso,
                parsing_status="ready",
                quality_available=True,
            )
            metadata_path = dataset_dir / "metadata.json"
            with open(metadata_path, "w", encoding="utf-8") as f:
                f.write(metadata.model_dump_json(indent=2))

            logger.info("Successfully ingested dataset %s (%s, %d rows)", dataset_id, filename, total_rows)
            return DatasetDetailResponse(metadata=metadata, quality=quality_summary)

        except Exception as e:
            # Clean up incomplete dataset directory on failure
            if dataset_dir.exists():
                shutil.rmtree(dataset_dir, ignore_errors=True)
            logger.exception("Failed during dataset ingestion persistence: %s", str(e))
            if isinstance(e, HTTPException):
                raise e
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to process and store dataset: {str(e)}",
            )

    def list_datasets(self) -> DatasetListResponse:
        """List metadata for all cataloged datasets."""
        storage_base = get_storage_path()
        datasets: List[DatasetMetadata] = []

        if storage_base.exists():
            for item in storage_base.iterdir():
                if item.is_dir() and item.name.startswith("ds_"):
                    meta_path = item / "metadata.json"
                    if meta_path.exists():
                        try:
                            with open(meta_path, "r", encoding="utf-8") as f:
                                data = json.load(f)
                                datasets.append(DatasetMetadata(**data))
                        except Exception as e:
                            logger.warning("Error reading metadata for %s: %s", item.name, str(e))

        # Sort by uploaded_at descending
        datasets.sort(key=lambda d: d.uploaded_at, reverse=True)
        return DatasetListResponse(datasets=datasets, total=len(datasets))

    def get_dataset_metadata(self, dataset_id: str) -> DatasetMetadata:
        """Retrieve metadata for a specific dataset."""
        storage_base = get_storage_path()
        dataset_dir = storage_base / dataset_id
        meta_path = dataset_dir / "metadata.json"

        if not dataset_dir.exists() or not meta_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset with ID '{dataset_id}' not found.",
            )

        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return DatasetMetadata(**data)
        except Exception as e:
            logger.exception("Failed to load metadata for %s: %s", dataset_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted metadata for dataset '{dataset_id}'.",
            )

    def get_dataset_quality(self, dataset_id: str) -> DataQualitySummary:
        """Retrieve calculated data quality summary for a dataset."""
        storage_base = get_storage_path()
        dataset_dir = storage_base / dataset_id
        quality_path = dataset_dir / "quality.json"

        if not dataset_dir.exists() or not quality_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Data quality summary for dataset '{dataset_id}' not found.",
            )

        try:
            with open(quality_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return DataQualitySummary(**data)
        except Exception as e:
            logger.exception("Failed to load quality summary for %s: %s", dataset_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted quality summary for dataset '{dataset_id}'.",
            )

    def get_dataset_preview(
        self, dataset_id: str, limit: int = 50, offset: int = 0
    ) -> DatasetPreviewResponse:
        """Return a bounded preview of actual rows from the stored CSV."""
        storage_base = get_storage_path()
        dataset_dir = storage_base / dataset_id
        csv_path = dataset_dir / "data.csv"
        meta_path = dataset_dir / "metadata.json"

        if not dataset_dir.exists() or not csv_path.exists() or not meta_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset with ID '{dataset_id}' not found.",
            )

        with open(meta_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
            total_rows = meta.get("row_count", 0)

        # Enforce limits
        bounded_limit = min(max(1, limit), settings.MAX_PREVIEW_LIMIT)
        safe_offset = max(0, offset)

        try:
            # Read bounded chunk with pandas
            # If offset > 0, we skip rows: header is row 0, then skiprows=range(1, safe_offset + 1)
            if safe_offset > 0:
                df_chunk = pd.read_csv(
                    csv_path,
                    skiprows=range(1, safe_offset + 1),
                    nrows=bounded_limit,
                    skipinitialspace=True,
                )
            else:
                df_chunk = pd.read_csv(
                    csv_path,
                    nrows=bounded_limit,
                    skipinitialspace=True,
                )

            columns = list(df_chunk.columns)
            # Convert NaN to None for JSON
            cleaned_records = []
            for record in df_chunk.to_dict(orient="records"):
                cleaned_record = {k: clean_nan(v) for k, v in record.items()}
                cleaned_records.append(cleaned_record)

            return DatasetPreviewResponse(
                dataset_id=dataset_id,
                columns=columns,
                rows=cleaned_records,
                total_rows=total_rows,
                preview_rows=len(cleaned_records),
                offset=safe_offset,
                limit=bounded_limit,
            )
        except Exception as e:
            logger.exception("Failed to read preview for %s: %s", dataset_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate dataset preview: {str(e)}",
            )


dataset_service = DatasetService()
