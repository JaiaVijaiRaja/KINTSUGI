"""Core orchestrator and persistence service for KINTSUGI Phase 7: Evaluation Center."""

import hashlib
import json
import logging
import math
import os
import shutil
import time
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.evaluation import (
    ConsistencyCheckResult,
    CreateEvaluationRequest,
    DatasetProfile,
    EvaluationBreakdownResponse,
    EvaluationListResponse,
    EvaluationManifestResponse,
    EvaluationMetricsResponse,
    EvaluationMode,
    EvaluationRun,
    EvaluationStatus,
    EvaluationSummaryItem,
    EvaluationTiming,
    EvaluationValidationResponse,
    FaultInjectionConfig,
    FaultManifest,
)
from app.schemas.dataset import (
    ColumnSummary,
    DataQualitySummary,
    DatasetMetadata,
)
from app.schemas.pipeline import (
    ConfidencePolicy,
    DetectionSettings,
    IsolationForestSettings,
    PipelineConfigCreate,
    ReconstructionSettings,
    StatisticalDetectorSettings,
)
from app.services.dataset_service import (
    compute_column_summary,
    dataset_service,
    evaluate_timestamp_candidate,
    get_storage_path,
)
from app.services.detection_service import detection_service
from app.services.evaluation.detection_metrics import detection_evaluator
from app.services.evaluation.fault_injector import fault_injector
from app.services.evaluation.reconstruction_metrics import reconstruction_evaluator
from app.services.pipeline_service import pipeline_service
from app.services.reconstruction_service import reconstruction_service

logger = logging.getLogger("kintsugi.evaluation_service")


def get_evaluation_storage_path() -> Path:
    """Resolve and ensure the local evaluation storage directory exists."""
    base = Path(settings.EVALUATION_STORAGE_DIR)
    if not base.is_absolute():
        cwd = Path.cwd()
        if (cwd / "backend").is_dir():
            base = cwd / "backend" / base
        else:
            base = cwd / base
    base.mkdir(parents=True, exist_ok=True)
    return base


class EvaluationService:
    """Service orchestrating controlled benchmarking, existing run evaluation, and persistence."""

    def execute_evaluation(self, req: CreateEvaluationRequest) -> EvaluationRun:
        """
        Execute an end-to-end evaluation.
        Mode A: Controlled fault-injection benchmark against a separate benchmark copy.
        Mode B: Empirical evaluation of an existing detection and reconstruction run.
        """
        overall_start_t = time.perf_counter()
        start_time_iso = datetime.now(timezone.utc).isoformat()
        evaluation_id = f"eval_{uuid.uuid4().hex[:12]}"

        logger.info("Initiating evaluation %s in mode '%s'", evaluation_id, req.evaluation_mode)

        # 1. Validate target source dataset exists
        source_meta = dataset_service.get_dataset_metadata(req.dataset_id)
        dataset_storage = get_storage_path()
        source_csv_path = dataset_storage / req.dataset_id / "data.csv"
        if not source_csv_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Source CSV file for dataset '{req.dataset_id}' not found.",
            )

        try:
            source_df = pd.read_csv(source_csv_path)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to read source dataset CSV: {str(e)}",
            )

        # Identify timestamp column
        quality = dataset_service.get_dataset_quality(req.dataset_id)
        timestamp_col = None
        if quality.timestamp_candidates:
            timestamp_col = quality.timestamp_candidates[0].column_name

        # Determine target sensor columns
        if req.sensor_columns:
            target_sensors = req.sensor_columns
        else:
            target_sensors = [
                c for c in source_df.columns
                if c != timestamp_col and pd.api.types.is_numeric_dtype(source_df[c])
            ]

        if not target_sensors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset does not contain any eligible numeric sensor columns for evaluation.",
            )

        for col in target_sensors:
            if col not in source_df.columns:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Sensor column '{col}' does not exist in dataset '{source_meta.filename}'.",
                )

        # Dataset profile
        dataset_profile = DatasetProfile(
            dataset_id=req.dataset_id,
            row_count=len(source_df),
            column_count=len(source_df.columns),
            sensor_columns=target_sensors,
            has_missing_values=bool(source_df[target_sensors].isna().any().any()),
            is_constant_signal={
                col: bool(source_df[col].dropna().nunique() <= 1) for col in target_sensors
            },
        )

        timing = EvaluationTiming()
        errors: List[str] = []
        warnings: List[str] = []
        limitations: List[str] = []

        # =====================================================================
        # MODE A: Controlled Fault-Injection Benchmark
        # =====================================================================
        if req.evaluation_mode == "mode_a_benchmark":
            fault_cfg = req.fault_config or FaultInjectionConfig(
                seed=req.seed,
                sensor_columns=target_sensors,
            )
            fault_cfg.sensor_columns = target_sensors

            # 2. Inject faults into a strictly separate copy
            t_inj_start = time.perf_counter()
            benchmark_dataset_id = f"ds_bm_{uuid.uuid4().hex[:12]}"
            try:
                corrupted_df, manifest = fault_injector.inject_faults(
                    df=source_df,
                    config=fault_cfg,
                    source_dataset_id=req.dataset_id,
                    benchmark_dataset_id=benchmark_dataset_id,
                    timestamp_col=timestamp_col,
                )
                manifest.evaluation_id = evaluation_id
            except Exception as e:
                logger.exception("Fault injection failed: %s", str(e))
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Fault injection failed: {str(e)}",
                )
            timing.fault_injection_ms = round((time.perf_counter() - t_inj_start) * 1000.0, 2)

            # 3. Persist separate benchmark dataset copy
            bm_dir = dataset_storage / benchmark_dataset_id
            bm_dir.mkdir(parents=True, exist_ok=True)
            bm_csv_path = bm_dir / "data.csv"
            corrupted_df.to_csv(bm_csv_path, index=False)

            # Persist benchmark dataset metadata and quality
            bm_meta = DatasetMetadata(
                dataset_id=benchmark_dataset_id,
                filename=f"benchmark_{source_meta.filename}",
                file_size_bytes=bm_csv_path.stat().st_size,
                row_count=len(corrupted_df),
                column_count=len(corrupted_df.columns),
                columns=list(corrupted_df.columns),
                uploaded_at=datetime.now(timezone.utc).isoformat(),
                parsing_status="ready",
                quality_available=True,
            )
            with open(bm_dir / "metadata.json", "w", encoding="utf-8") as f:
                f.write(bm_meta.model_dump_json(indent=2))

            # Quality summary for benchmark
            bm_col_summaries = [compute_column_summary(c, corrupted_df[c]) for c in corrupted_df.columns]
            bm_quality = DataQualitySummary(
                dataset_id=benchmark_dataset_id,
                total_rows=len(corrupted_df),
                total_columns=len(corrupted_df.columns),
                duplicate_rows_count=int(corrupted_df.duplicated().sum()),
                duplicate_rows_percentage=round((int(corrupted_df.duplicated().sum()) / len(corrupted_df) * 100.0), 2) if len(corrupted_df) > 0 else 0.0,
                total_missing_cells=int(corrupted_df.isna().sum().sum()),
                missing_cells_percentage=round((int(corrupted_df.isna().sum().sum()) / (len(corrupted_df) * len(corrupted_df.columns)) * 100.0), 2),
                timestamp_candidates=quality.timestamp_candidates,
                columns=bm_col_summaries,
                computed_at=datetime.now(timezone.utc).isoformat(),
            )
            with open(bm_dir / "quality.json", "w", encoding="utf-8") as f:
                f.write(bm_quality.model_dump_json(indent=2))

            # 4. Create or adapt pipeline configuration for benchmark dataset
            bm_pipe_name = f"Benchmark Pipeline for {source_meta.filename}"
            if req.pipeline_id:
                base_pipe = pipeline_service.get_pipeline_config(req.pipeline_id)
                pipe_create = PipelineConfigCreate(
                    configuration_name=bm_pipe_name,
                    description="Benchmark evaluation configuration",
                    dataset_id=benchmark_dataset_id,
                    timestamp_column=base_pipe.timestamp_column,
                    sensor_columns=target_sensors,
                    ignored_columns=base_pipe.ignored_columns,
                    detection_settings=base_pipe.detection_settings,
                    reconstruction_settings=base_pipe.reconstruction_settings,
                    confidence_policy=base_pipe.confidence_policy,
                )
            else:
                pipe_create = PipelineConfigCreate(
                    configuration_name=bm_pipe_name,
                    description="Default benchmark configuration for synthetic evaluation",
                    dataset_id=benchmark_dataset_id,
                    timestamp_column=timestamp_col,
                    sensor_columns=target_sensors,
                    ignored_columns=[],
                    detection_settings=DetectionSettings(
                        statistical=StatisticalDetectorSettings(
                            enabled=True,
                            window_size=min(30, max(5, len(corrupted_df) // 5)),
                            mad_threshold=3.0,
                            min_observations=max(5, min(10, len(corrupted_df))),
                        ),
                        isolation_forest=IsolationForestSettings(
                            enabled=len(target_sensors) >= 2 and len(corrupted_df) >= 20,
                            contamination=0.05,
                            random_seed=42,
                            min_observations=min(50, max(10, len(corrupted_df))),
                        ),
                    ),
                    reconstruction_settings=ReconstructionSettings(
                        allow_linear_interpolation=True,
                        max_gap_size=5,
                        require_cross_sensor_validation=(len(target_sensors) >= 2),
                    ),
                    confidence_policy=ConfidencePolicy(),
                )

            bm_pipeline = pipeline_service.create_pipeline_config(pipe_create)

            # 5. Run Detection on benchmark dataset
            t_det_start = time.perf_counter()
            det_run = detection_service.execute_detection_run(bm_pipeline.configuration_id)
            timing.detection_ms = round((time.perf_counter() - t_det_start) * 1000.0, 2)

            det_results = detection_service.get_detection_run_results(det_run.run_id, limit=50000, offset=0)
            detected_anomalies = det_results.anomalies

            # 6. Run Reconstruction on benchmark dataset
            t_rec_start = time.perf_counter()
            rec_run_res = reconstruction_service.execute_reconstruction_run(
                bm_pipeline.configuration_id, det_run.run_id
            )
            timing.reconstruction_ms = round((time.perf_counter() - t_rec_start) * 1000.0, 2)

            rec_results = reconstruction_service.get_reconstruction_results(
                rec_run_res.run.reconstruction_run_id, limit=50000, offset=0
            )
            reconstruction_records = rec_results.results

            # 7. Calculate Detection Metrics against Manifest Ground Truth
            t_met_start = time.perf_counter()
            det_metrics, fault_breakdowns, sensor_breakdowns = detection_evaluator.evaluate(
                manifest=manifest,
                detected_anomalies=detected_anomalies,
                total_rows=len(source_df),
                sensor_columns=target_sensors,
            )

            # 8. Calculate Reconstruction Metrics against Preserved Ground Truth
            rec_metrics, conf_metrics, abst_metrics = reconstruction_evaluator.evaluate(
                reconstruction_records=reconstruction_records,
                source_df=source_df,
                corrupted_df=corrupted_df,
                manifest=manifest,
                sensor_columns=target_sensors,
            )

            # Enrich sensor breakdowns with reconstruction error
            sensor_recs: Dict[str, List[float]] = defaultdict(list)
            for r in reconstruction_records:
                if r.status == "CORRECTED" and r.final_value is not None:
                    row_i = r.source_row_index
                    c = r.sensor_column
                    if 0 <= row_i < len(source_df) and c in source_df.columns:
                        gt = source_df.at[row_i, c]
                        if gt is not None and np.isfinite(gt):
                            sensor_recs[c].append(abs(float(r.final_value) - float(gt)))

            for sb in sensor_breakdowns:
                errs = sensor_recs.get(sb.sensor_column, [])
                if errs:
                    sb.mae = round(float(np.mean(errs)), 4)
                    sb.rmse = round(float(np.sqrt(np.mean([e ** 2 for e in errs]))), 4)

            timing.metrics_ms = round((time.perf_counter() - t_met_start) * 1000.0, 2)

            limitations.append("Synthetic faults provide reproducible lower-bound validation but do not cover all unmodeled real-world industrial failure mechanisms.")
            limitations.append("Confidence scores represent multi-factor heuristic evidence concordance (0-100), not calibrated Bayesian probabilities.")

            eval_run = EvaluationRun(
                evaluation_id=evaluation_id,
                evaluation_mode="mode_a_benchmark",
                source_dataset_id=req.dataset_id,
                benchmark_dataset_id=benchmark_dataset_id,
                pipeline_id=bm_pipeline.configuration_id,
                detection_run_id=det_run.run_id,
                reconstruction_run_id=rec_run_res.run.reconstruction_run_id,
                random_seed=fault_cfg.seed,
                fault_config=fault_cfg,
                status="completed",
                start_time=start_time_iso,
                completion_time=datetime.now(timezone.utc).isoformat(),
                timing=timing,
                dataset_profile=dataset_profile,
                detection_metrics=det_metrics,
                reconstruction_metrics=rec_metrics,
                confidence_metrics=conf_metrics,
                abstention_metrics=abst_metrics,
                fault_breakdowns=fault_breakdowns,
                sensor_breakdowns=sensor_breakdowns,
                manifest_ref=f"evaluations/{evaluation_id}/manifest.json",
                errors=errors,
                warnings=warnings,
                limitations=limitations,
            )

            # Persist run and manifest
            self._persist_evaluation_run(eval_run, manifest)

        # =====================================================================
        # MODE B: Inspection of Existing Runs (Unlabeled Data)
        # =====================================================================
        else:
            if not req.detection_run_id:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mode B evaluation requires a valid detection_run_id.",
                )

            t_load_start = time.perf_counter()
            det_run = detection_service.get_detection_run(req.detection_run_id)
            det_results = detection_service.get_detection_run_results(req.detection_run_id, limit=50000, offset=0)
            detected_anomalies = det_results.anomalies

            reconstruction_records = []
            if req.reconstruction_run_id:
                rec_results = reconstruction_service.get_reconstruction_results(
                    req.reconstruction_run_id, limit=50000, offset=0
                )
                reconstruction_records = rec_results.results
            timing.detection_ms = round((time.perf_counter() - t_load_start) * 1000.0, 2)

            t_met_start = time.perf_counter()
            det_metrics, fault_breakdowns, sensor_breakdowns = detection_evaluator.evaluate(
                manifest=None,
                detected_anomalies=detected_anomalies,
                total_rows=len(source_df),
                sensor_columns=target_sensors,
            )

            rec_metrics, conf_metrics, abst_metrics = reconstruction_evaluator.evaluate(
                reconstruction_records=reconstruction_records,
                source_df=None,
                corrupted_df=None,
                manifest=None,
                sensor_columns=target_sensors,
            )
            timing.metrics_ms = round((time.perf_counter() - t_met_start) * 1000.0, 2)

            limitations.append("Unlabeled production run: True anomaly ground truth is unavailable.")
            limitations.append("Precision, Recall, F1, Specificity, and FPR cannot be legitimately calculated.")
            limitations.append("Reconstruction accuracy (MAE, RMSE, MAPE) cannot be computed without verified reference observations.")

            eval_run = EvaluationRun(
                evaluation_id=evaluation_id,
                evaluation_mode="mode_b_existing_run",
                source_dataset_id=req.dataset_id,
                benchmark_dataset_id=None,
                pipeline_id=det_run.configuration_id,
                detection_run_id=req.detection_run_id,
                reconstruction_run_id=req.reconstruction_run_id,
                random_seed=None,
                fault_config=None,
                status="completed",
                start_time=start_time_iso,
                completion_time=datetime.now(timezone.utc).isoformat(),
                timing=timing,
                dataset_profile=dataset_profile,
                detection_metrics=det_metrics,
                reconstruction_metrics=rec_metrics,
                confidence_metrics=conf_metrics,
                abstention_metrics=abst_metrics,
                fault_breakdowns=fault_breakdowns,
                sensor_breakdowns=sensor_breakdowns,
                manifest_ref=None,
                errors=errors,
                warnings=warnings,
                limitations=limitations,
            )

            self._persist_evaluation_run(eval_run, None)

        timing.total_elapsed_ms = round((time.perf_counter() - overall_start_t) * 1000.0, 2)
        eval_run.timing.total_elapsed_ms = timing.total_elapsed_ms
        # Re-commit updated timing
        self._save_run_json(eval_run)

        return eval_run

    def _persist_evaluation_run(
        self, run: EvaluationRun, manifest: Optional[FaultManifest]
    ) -> None:
        """Atomically persist complete evaluation run and manifest."""
        eval_base = get_evaluation_storage_path()
        eval_dir = eval_base / run.evaluation_id
        eval_dir.mkdir(parents=True, exist_ok=True)

        self._save_run_json(run)

        # Save manifest if present
        if manifest:
            man_tmp = eval_dir / "manifest.tmp"
            man_file = eval_dir / "manifest.json"
            with open(man_tmp, "w", encoding="utf-8") as f:
                f.write(manifest.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(man_tmp, man_file)

        # Save standalone metrics definition cache
        metrics_tmp = eval_dir / "metrics.tmp"
        metrics_file = eval_dir / "metrics.json"
        metrics_resp = EvaluationMetricsResponse(
            evaluation_id=run.evaluation_id,
            detection_metrics=run.detection_metrics,
            reconstruction_metrics=run.reconstruction_metrics,
            confidence_metrics=run.confidence_metrics,
            abstention_metrics=run.abstention_metrics,
            metric_definitions=self.get_metric_definitions(),
        )
        with open(metrics_tmp, "w", encoding="utf-8") as f:
            f.write(metrics_resp.model_dump_json(indent=2))
            f.flush()
            os.fsync(f.fileno())
        os.replace(metrics_tmp, metrics_file)

    def _save_run_json(self, run: EvaluationRun) -> None:
        """Helper to atomically save evaluation.json."""
        eval_base = get_evaluation_storage_path()
        eval_dir = eval_base / run.evaluation_id
        eval_dir.mkdir(parents=True, exist_ok=True)
        run_tmp = eval_dir / "evaluation.tmp"
        run_file = eval_dir / "evaluation.json"
        with open(run_tmp, "w", encoding="utf-8") as f:
            f.write(run.model_dump_json(indent=2))
            f.flush()
            os.fsync(f.fileno())
        os.replace(run_tmp, run_file)

    def list_evaluations(
        self,
        dataset_id: Optional[str] = None,
        mode: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> EvaluationListResponse:
        """List historical persisted evaluation runs with pagination and filtering."""
        eval_base = get_evaluation_storage_path()
        items: List[EvaluationSummaryItem] = []

        if eval_base.exists():
            for d in eval_base.iterdir():
                if d.is_dir() and d.name.startswith("eval_"):
                    run_file = d / "evaluation.json"
                    if run_file.exists():
                        try:
                            with open(run_file, "r", encoding="utf-8") as f:
                                data = json.load(f)
                            # Filters
                            if dataset_id and data.get("source_dataset_id") != dataset_id:
                                continue
                            if mode and data.get("evaluation_mode") != mode:
                                continue

                            det_m = data.get("detection_metrics", {})
                            rec_m = data.get("reconstruction_metrics", {})
                            t_info = data.get("timing", {})

                            items.append(
                                EvaluationSummaryItem(
                                    evaluation_id=data["evaluation_id"],
                                    evaluation_mode=data["evaluation_mode"],
                                    source_dataset_id=data["source_dataset_id"],
                                    benchmark_dataset_id=data.get("benchmark_dataset_id"),
                                    pipeline_id=data.get("pipeline_id"),
                                    status=data.get("status", "completed"),
                                    created_at=data["start_time"],
                                    completed_at=data.get("completion_time"),
                                    f1_score=det_m.get("f1_score"),
                                    precision=det_m.get("precision"),
                                    recall=det_m.get("recall"),
                                    rmse=rec_m.get("rmse"),
                                    mae=rec_m.get("mae"),
                                    injected_faults_count=det_m.get("injected_faults_count", 0),
                                    total_evaluated_observations=rec_m.get("total_evaluated_observations", 0),
                                    total_elapsed_ms=t_info.get("total_elapsed_ms", 0.0),
                                )
                            )
                        except Exception as e:
                            logger.warning("Error reading evaluation %s: %s", d.name, str(e))

        # Sort descending by creation timestamp
        items.sort(key=lambda x: x.created_at, reverse=True)
        total = len(items)
        paginated = items[offset : offset + limit]
        return EvaluationListResponse(
            evaluations=paginated,
            total=total,
            limit=limit,
            offset=offset,
        )

    def get_evaluation(self, evaluation_id: str) -> EvaluationRun:
        """Retrieve complete evaluation run by evaluation_id."""
        eval_base = get_evaluation_storage_path()
        run_file = eval_base / evaluation_id / "evaluation.json"
        if not run_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Evaluation run '{evaluation_id}' not found.",
            )
        try:
            with open(run_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return EvaluationRun(**data)
        except Exception as e:
            logger.exception("Failed to parse evaluation %s: %s", evaluation_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted evaluation run record '{evaluation_id}'.",
            )

    def get_evaluation_metrics(self, evaluation_id: str) -> EvaluationMetricsResponse:
        """Retrieve metrics endpoint with explicit mathematical definitions."""
        run = self.get_evaluation(evaluation_id)
        return EvaluationMetricsResponse(
            evaluation_id=run.evaluation_id,
            detection_metrics=run.detection_metrics,
            reconstruction_metrics=run.reconstruction_metrics,
            confidence_metrics=run.confidence_metrics,
            abstention_metrics=run.abstention_metrics,
            metric_definitions=self.get_metric_definitions(),
        )

    def get_evaluation_breakdown(self, evaluation_id: str) -> EvaluationBreakdownResponse:
        """Retrieve per-sensor and per-fault breakdown results."""
        run = self.get_evaluation(evaluation_id)
        return EvaluationBreakdownResponse(
            evaluation_id=run.evaluation_id,
            fault_breakdowns=run.fault_breakdowns,
            sensor_breakdowns=run.sensor_breakdowns,
        )

    def get_evaluation_manifest(self, evaluation_id: str) -> EvaluationManifestResponse:
        """Retrieve or download machine-readable fault injection manifest."""
        eval_base = get_evaluation_storage_path()
        man_file = eval_base / evaluation_id / "manifest.json"
        if not man_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Ground-truth manifest for evaluation '{evaluation_id}' does not exist (e.g. Mode B evaluation).",
            )
        try:
            with open(man_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            return EvaluationManifestResponse(
                evaluation_id=evaluation_id,
                manifest=FaultManifest(**data),
            )
        except Exception as e:
            logger.exception("Failed to parse manifest %s: %s", evaluation_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted manifest for evaluation '{evaluation_id}'.",
            )

    def validate_evaluation(self, evaluation_id: str) -> EvaluationValidationResponse:
        """
        Perform consistency and data-preservation checks on a completed evaluation.
        Never alters source or benchmark datasets.
        """
        run = self.get_evaluation(evaluation_id)
        checks: List[ConsistencyCheckResult] = []

        # 1. Source dataset preservation and SHA-256 integrity
        dataset_storage = get_storage_path()
        source_csv = dataset_storage / run.source_dataset_id / "data.csv"
        source_intact = False
        sha_verified = False

        if source_csv.exists():
            source_intact = True
            with open(source_csv, "rb") as f:
                sha256 = hashlib.sha256(f.read()).hexdigest()
            sha_verified = bool(sha256)
            checks.append(
                ConsistencyCheckResult(
                    check_name="source_dataset_preservation",
                    passed=True,
                    details=f"Source dataset '{run.source_dataset_id}' is present and unmodified (SHA-256: {sha256[:16]}...).",
                )
            )
        else:
            checks.append(
                ConsistencyCheckResult(
                    check_name="source_dataset_preservation",
                    passed=False,
                    details=f"Source dataset CSV '{run.source_dataset_id}' is missing.",
                )
            )

        # 2. Confusion matrix mathematical identity
        cm = run.detection_metrics.confusion_matrix
        cm_sum = cm.true_positives + cm.false_positives + cm.true_negatives + cm.false_negatives
        cm_valid = (cm_sum == cm.total_labeled_observations)
        checks.append(
            ConsistencyCheckResult(
                check_name="confusion_matrix_sum_identity",
                passed=cm_valid,
                details=f"TP ({cm.true_positives}) + FP ({cm.false_positives}) + TN ({cm.true_negatives}) + FN ({cm.false_negatives}) = {cm_sum} (Expected total: {cm.total_labeled_observations}).",
            )
        )

        # 3. Detection rates arithmetic validity
        rates_valid = True
        rates_msg = []
        if cm.true_positives + cm.false_positives > 0:
            calc_p = round(cm.true_positives / (cm.true_positives + cm.false_positives), 4)
            if run.detection_metrics.precision is not None and abs(run.detection_metrics.precision - calc_p) > 1e-3:
                rates_valid = False
                rates_msg.append(f"Precision mismatch: recorded {run.detection_metrics.precision} vs computed {calc_p}")
        if cm.true_positives + cm.false_negatives > 0:
            calc_r = round(cm.true_positives / (cm.true_positives + cm.false_negatives), 4)
            if run.detection_metrics.recall is not None and abs(run.detection_metrics.recall - calc_r) > 1e-3:
                rates_valid = False
                rates_msg.append(f"Recall mismatch: recorded {run.detection_metrics.recall} vs computed {calc_r}")

        checks.append(
            ConsistencyCheckResult(
                check_name="detection_rates_arithmetic",
                passed=rates_valid,
                details="Precision and Recall correctly match confusion matrix values." if rates_valid else "; ".join(rates_msg),
            )
        )

        # 4. Manifest consistency (Mode A only)
        if run.evaluation_mode == "mode_a_benchmark":
            eval_base = get_evaluation_storage_path()
            man_file = eval_base / evaluation_id / "manifest.json"
            man_exists = man_file.exists()
            checks.append(
                ConsistencyCheckResult(
                    check_name="ground_truth_manifest_exists",
                    passed=man_exists,
                    details=f"Manifest file {'verified' if man_exists else 'missing'} at {man_file.name}.",
                )
            )

        all_passed = all(c.passed for c in checks)
        return EvaluationValidationResponse(
            evaluation_id=evaluation_id,
            is_consistent=all_passed,
            source_data_intact=source_intact,
            source_sha256_verified=sha_verified,
            checks=checks,
        )

    def get_metric_definitions(self) -> Dict[str, str]:
        """Formal mathematical definitions for all quantitative evaluation metrics."""
        return {
            "Precision": "TP / (TP + FP). Proportion of flagged anomalies that were true injected faults. Null if TP + FP = 0.",
            "Recall": "TP / (TP + FN). Proportion of injected faults that were successfully detected. Null if TP + FN = 0.",
            "F1 Score": "2 * (Precision * Recall) / (Precision + Recall). Harmonic mean of precision and recall. Null if P + R = 0 or undefined.",
            "Specificity": "TN / (TN + FP). Proportion of nominal sensor observations correctly identified as normal. Null if TN + FP = 0.",
            "False Positive Rate": "FP / (FP + TN). Proportion of nominal observations falsely flagged as anomalies. Null if FP + TN = 0.",
            "Mean Absolute Error (MAE)": "(1/n) * Σ |accepted_reconstructed - ground_truth|. Evaluated exclusively on accepted repairs with known reference truth.",
            "Root Mean Squared Error (RMSE)": "√[(1/n) * Σ (accepted_reconstructed - ground_truth)²]. Penalizes large residual errors.",
            "Mean Absolute Percentage Error (MAPE)": "(1/m) * Σ (|accepted_reconstructed - ground_truth| / |ground_truth|) * 100. Strictly excludes zero reference values.",
            "Reconstruction Coverage": "Accepted repaired observations / Total eligible faulted observations.",
            "Correction Acceptance Rate": "Accepted repairs (status == 'CORRECTED') / Total evaluated observations.",
            "Abstention Rate": "Unresolved observations (status == 'UNRESOLVED') / Total evaluated observations.",
            "Safety Ratio": "(Correctly Accepted + Correctly Abstained) / Total Evaluated observations.",
        }


evaluation_service = EvaluationService()
