import json
import logging
import math
import os
import shutil
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.anomaly import (
    AnomalyListResponse,
    AnomalyRecord,
    DetectionRun,
    DetectionRunResultsResponse,
    DetectionRunStatus,
    RunSummary,
)
from app.services.dataset_service import dataset_service, get_storage_path
from app.services.detectors.aggregation import aggregate_observation_anomaly
from app.services.detectors.isolation_forest import detect_isolation_forest
from app.services.detectors.statistical import detect_statistical_mad
from app.services.pipeline_service import pipeline_service

logger = logging.getLogger("kintsugi.detection_service")


def get_runs_storage_path() -> Path:
    """Resolve and ensure the local detection runs storage directory exists."""
    base = Path(settings.RUNS_STORAGE_DIR)
    if not base.is_absolute():
        cwd = Path.cwd()
        if (cwd / "backend").is_dir():
            base = cwd / "backend" / base
        else:
            base = cwd / base
    base.mkdir(parents=True, exist_ok=True)
    return base


class DetectionService:
    """Service orchestrating real industrial sensor anomaly detection runs and persistence."""

    def execute_detection_run(self, pipeline_id: str) -> DetectionRun:
        """
        Execute an end-to-end anomaly detection run using the validated pipeline configuration.
        Reads actual stored dataset CSV, executes configured detectors, aggregates results,
        and atomically persists the run metadata and anomaly records.
        """
        # 1. Validate and retrieve pipeline configuration
        config = pipeline_service.get_pipeline_config(pipeline_id)

        # 2. Validate and retrieve dataset metadata
        meta = dataset_service.get_dataset_metadata(config.dataset_id)

        # 3. Resolve and load actual stored CSV file
        dataset_storage = get_storage_path()
        csv_path = dataset_storage / config.dataset_id / "data.csv"
        if not csv_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Source CSV file for dataset '{config.dataset_id}' not found.",
            )

        try:
            df = pd.read_csv(csv_path)
        except Exception as e:
            logger.exception("Failed to read dataset CSV %s: %s", csv_path, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read dataset CSV: {str(e)}",
            )

        # 4. Verify configured columns exist in the loaded dataframe
        df_columns = set(df.columns)
        for col in config.sensor_columns:
            if col not in df_columns:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Configured sensor column '{col}' does not exist in dataset '{meta.filename}'.",
                )

        if config.timestamp_column and config.timestamp_column not in df_columns:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Configured timestamp column '{config.timestamp_column}' does not exist in dataset '{meta.filename}'.",
            )

        # 5. Determine active detector methods
        stat_cfg = config.detection_settings.statistical
        iso_cfg = config.detection_settings.isolation_forest

        detector_methods: List[str] = []
        if stat_cfg.enabled:
            detector_methods.append("statistical_mad")
        if iso_cfg.enabled:
            detector_methods.append("isolation_forest")

        if not detector_methods:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Pipeline configuration has all anomaly detection methods disabled.",
            )

        run_id = f"run_{uuid.uuid4().hex[:12]}"
        start_time = datetime.now(timezone.utc).isoformat()
        errors: List[str] = []
        warnings: List[str] = []

        logger.info(
            "Starting detection run %s for pipeline '%s' on dataset '%s' (%d rows, %d sensors)",
            run_id,
            pipeline_id,
            config.dataset_id,
            len(df),
            len(config.sensor_columns),
        )

        # 6. Execute Statistical Detector (per sensor column)
        stat_results_by_sensor: Dict[str, List[Any]] = {}
        if stat_cfg.enabled:
            for sensor_col in config.sensor_columns:
                try:
                    stat_res = detect_statistical_mad(
                        series=df[sensor_col],
                        window_size=stat_cfg.window_size,
                        mad_threshold=stat_cfg.mad_threshold,
                        min_observations=stat_cfg.min_observations,
                    )
                    stat_results_by_sensor[sensor_col] = stat_res
                except Exception as e:
                    logger.exception("Statistical detector failed on sensor %s: %s", sensor_col, str(e))
                    errors.append(f"Statistical detector failed for sensor '{sensor_col}': {str(e)}")

        # 7. Execute Isolation Forest (multivariate across configured sensors)
        iso_results: Optional[List[Any]] = None
        if iso_cfg.enabled:
            try:
                iso_res, iso_warns = detect_isolation_forest(
                    df=df,
                    sensor_columns=config.sensor_columns,
                    contamination=iso_cfg.contamination,
                    random_seed=iso_cfg.random_seed,
                    min_observations=iso_cfg.min_observations,
                )
                iso_results = iso_res
                warnings.extend(iso_warns)
            except Exception as e:
                logger.exception("Isolation Forest detector failed: %s", str(e))
                errors.append(f"Isolation Forest detector failed: {str(e)}")

        # 8. Determine Execution Status
        if len(errors) == len(detector_methods):
            run_status: DetectionRunStatus = "failed"
        elif len(errors) > 0:
            run_status = "partial_failure"
        else:
            run_status = "completed"

        # 9. Aggregate results per observation into AnomalyRecord entries
        anomalies: List[AnomalyRecord] = []
        n_rows = len(df)
        ts_series = df[config.timestamp_column] if (config.timestamp_column and config.timestamp_column in df.columns) else None

        unusable_rows = 0
        sensor_matrix = df[config.sensor_columns].to_numpy(dtype=float, na_value=np.nan)
        for r in range(n_rows):
            if not np.all(np.isfinite(sensor_matrix[r])):
                unusable_rows += 1

        for i in range(n_rows):
            ts_val = None
            if ts_series is not None and pd.notna(ts_series.iloc[i]):
                ts_val = str(ts_series.iloc[i])

            iso_res_for_row = iso_results[i] if (iso_results is not None and i < len(iso_results)) else None

            for sensor_col in config.sensor_columns:
                raw_val = df[sensor_col].iloc[i]
                orig_val = float(raw_val) if (pd.notna(raw_val) and np.isfinite(raw_val)) else None

                stat_res_for_sensor = None
                if sensor_col in stat_results_by_sensor and i < len(stat_results_by_sensor[sensor_col]):
                    stat_res_for_sensor = stat_results_by_sensor[sensor_col][i]

                anomaly_rec = aggregate_observation_anomaly(
                    run_id=run_id,
                    dataset_id=config.dataset_id,
                    configuration_id=config.configuration_id,
                    sensor_column=sensor_col,
                    source_row_index=i,
                    timestamp_val=ts_val,
                    original_value=orig_val,
                    stat_result=stat_res_for_sensor,
                    iso_result=iso_res_for_row,
                )

                if anomaly_rec is not None:
                    anomalies.append(anomaly_rec)

        # 10. Compute Run Summary
        anomalies_by_sensor = dict(Counter(a.sensor_column for a in anomalies))
        anomalies_by_detector = dict(Counter(d for a in anomalies for d in a.detectors_flagged))
        anomalies_by_severity = dict(Counter(a.severity for a in anomalies))
        consensus_count = sum(1 for a in anomalies if a.consensus == "MULTI_DETECTOR")

        summary = RunSummary(
            total_rows_analyzed=n_rows,
            total_anomalies_detected=len(anomalies),
            anomalies_by_sensor=anomalies_by_sensor,
            anomalies_by_detector=anomalies_by_detector,
            anomalies_by_severity=anomalies_by_severity,
            multi_detector_consensus_count=consensus_count,
            unusable_rows_count=unusable_rows,
        )

        completion_time = datetime.now(timezone.utc).isoformat()
        run = DetectionRun(
            run_id=run_id,
            dataset_id=config.dataset_id,
            configuration_id=config.configuration_id,
            configuration_version=config.configuration_version,
            status=run_status,
            start_time=start_time,
            completion_time=completion_time,
            detector_methods=detector_methods,
            summary=summary,
            errors=errors,
            warnings=warnings,
        )

        # 11. Atomic Persistence in storage/runs/{run_id}/
        runs_base = get_runs_storage_path()
        run_dir = runs_base / run_id
        run_dir.mkdir(parents=True, exist_ok=True)

        run_tmp = run_dir / "run.tmp"
        run_file = run_dir / "run.json"
        anom_tmp = run_dir / "anomalies.tmp"
        anom_file = run_dir / "anomalies.json"

        try:
            with open(run_tmp, "w", encoding="utf-8") as f:
                f.write(run.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(run_tmp, run_file)

            with open(anom_tmp, "w", encoding="utf-8") as f:
                anom_json = json.dumps([a.model_dump() for a in anomalies], indent=2)
                f.write(anom_json)
                f.flush()
                os.fsync(f.fileno())
            os.replace(anom_tmp, anom_file)

            logger.info("Successfully persisted detection run %s (%d anomalies)", run_id, len(anomalies))
            return run
        except Exception as e:
            logger.exception("Failed to persist run results %s: %s", run_id, str(e))
            if run_dir.exists():
                shutil.rmtree(run_dir, ignore_errors=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist detection run results: {str(e)}",
            )

    def get_detection_run(self, run_id: str) -> DetectionRun:
        """Retrieve detection run metadata and summary by run_id."""
        runs_base = get_runs_storage_path()
        run_file = runs_base / run_id / "run.json"

        if not run_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Detection run with ID '{run_id}' not found.",
            )

        try:
            with open(run_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return DetectionRun(**data)
        except Exception as e:
            logger.exception("Corrupted run file %s: %s", run_file, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted metadata for detection run '{run_id}'.",
            )

    def get_detection_run_results(
        self, run_id: str, limit: int = 100, offset: int = 0
    ) -> DetectionRunResultsResponse:
        """Retrieve paginated anomaly records for a specific detection run."""
        run = self.get_detection_run(run_id)

        runs_base = get_runs_storage_path()
        anom_file = runs_base / run_id / "anomalies.json"

        if not anom_file.exists():
            return DetectionRunResultsResponse(
                run_id=run.run_id,
                dataset_id=run.dataset_id,
                configuration_id=run.configuration_id,
                summary=run.summary,
                total_anomalies=0,
                anomalies=[],
                limit=limit,
                offset=offset,
            )

        try:
            with open(anom_file, "r", encoding="utf-8") as f:
                raw_list = json.load(f)
                records = [AnomalyRecord(**r) for r in raw_list]
        except Exception as e:
            logger.exception("Corrupted anomalies file %s: %s", anom_file, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read anomaly records for run '{run_id}'.",
            )

        bounded_limit = min(max(1, limit), 1000)
        bounded_offset = max(0, offset)
        sliced = records[bounded_offset : bounded_offset + bounded_limit]

        return DetectionRunResultsResponse(
            run_id=run.run_id,
            dataset_id=run.dataset_id,
            configuration_id=run.configuration_id,
            summary=run.summary,
            total_anomalies=len(records),
            anomalies=sliced,
            limit=bounded_limit,
            offset=bounded_offset,
        )

    def list_anomalies(
        self,
        dataset_id: Optional[str] = None,
        run_id: Optional[str] = None,
        sensor_column: Optional[str] = None,
        detector_name: Optional[str] = None,
        severity: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AnomalyListResponse:
        """
        Query and filter detected anomaly records across persisted runs.
        Supports filtering by dataset, run, sensor channel, detector algorithm, and severity.
        """
        runs_base = get_runs_storage_path()
        records: List[AnomalyRecord] = []

        target_runs: List[Path] = []
        if run_id:
            specific_dir = runs_base / run_id
            if specific_dir.is_dir():
                target_runs.append(specific_dir)
        elif runs_base.exists():
            # Sort runs by directory name or mtime desc
            for item in sorted(runs_base.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
                if item.is_dir() and item.name.startswith("run_"):
                    target_runs.append(item)

        for r_dir in target_runs:
            anom_file = r_dir / "anomalies.json"
            if anom_file.exists():
                try:
                    with open(anom_file, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        for item in data:
                            rec = AnomalyRecord(**item)
                            # Apply filters
                            if dataset_id and rec.dataset_id != dataset_id:
                                continue
                            if sensor_column and rec.sensor_column != sensor_column:
                                continue
                            if detector_name:
                                if detector_name not in rec.detectors_flagged and rec.detector_name != detector_name:
                                    continue
                            if severity and rec.severity != severity.upper():
                                continue
                            records.append(rec)
                except Exception as e:
                    logger.warning("Error reading anomalies in %s: %s", r_dir.name, str(e))

        bounded_limit = min(max(1, limit), 1000)
        bounded_offset = max(0, offset)
        sliced = records[bounded_offset : bounded_offset + bounded_limit]

        return AnomalyListResponse(
            anomalies=sliced,
            total=len(records),
            limit=bounded_limit,
            offset=bounded_offset,
        )

    def get_anomaly_by_id(self, anomaly_id: str) -> AnomalyRecord:
        """Lookup details for a specific individual anomaly record."""
        runs_base = get_runs_storage_path()
        if runs_base.exists():
            for r_dir in runs_base.iterdir():
                if r_dir.is_dir() and r_dir.name.startswith("run_"):
                    anom_file = r_dir / "anomalies.json"
                    if anom_file.exists():
                        try:
                            with open(anom_file, "r", encoding="utf-8") as f:
                                data = json.load(f)
                                for item in data:
                                    if item.get("anomaly_id") == anomaly_id:
                                        return AnomalyRecord(**item)
                        except Exception:
                            continue

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Anomaly record with ID '{anomaly_id}' not found.",
        )


detection_service = DetectionService()
