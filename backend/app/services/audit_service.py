"""Service orchestrating append-only audit ledger persistence, hash-chain integrity, and causal explainability."""

import csv
import io
import json
import logging
import os
import shutil
import threading
import uuid
from datetime import datetime, timezone
from hashlib import sha256
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd
from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.audit import (
    AuditEvent,
    AuditEventListResponse,
    AuditEventType,
    CausalTraceResponse,
    CausalTraceStep,
    DetectionExplanation,
    EvaluationExplanation,
    HashChainVerificationResponse,
    ObservationHistoryResponse,
    ReconstructionExplanation,
)
from app.services.dataset_service import dataset_service, get_storage_path
from app.services.detection_service import detection_service, get_runs_storage_path
from app.services.pipeline_service import pipeline_service
from app.services.reconstruction_service import (
    get_reconstruction_storage_path,
    reconstruction_service,
)

logger = logging.getLogger("kintsugi.audit_service")

GENESIS_HASH = "0" * 64


def get_audit_storage_path() -> Path:
    """Resolve and ensure the local audit storage directory exists."""
    base = Path(settings.AUDIT_STORAGE_DIR)
    if not base.is_absolute():
        cwd = Path.cwd()
        if (cwd / "backend").is_dir():
            base = cwd / "backend" / base
        else:
            base = cwd / base
    base.mkdir(parents=True, exist_ok=True)
    return base


def sanitize_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure no secrets, passwords, or credentials exist in audit payloads."""
    forbidden_keys = {"password", "secret", "token", "credential", "auth_header", "private_key"}
    clean: Dict[str, Any] = {}
    for k, v in payload.items():
        if any(fk in k.lower() for fk in forbidden_keys):
            continue
        if isinstance(v, dict):
            clean[k] = sanitize_payload(v)
        else:
            clean[k] = v
    return clean


def canonicalize_for_hash(event_dict: Dict[str, Any]) -> str:
    """
    Produce a deterministic, canonical JSON representation for hashing.
    Omits 'event_hash' and sorts all dictionary keys.
    """
    dict_to_hash = {k: v for k, v in event_dict.items() if k != "event_hash"}
    return json.dumps(dict_to_hash, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


class AuditService:
    """
    Append-only audit service with SHA-256 hash-chaining, observation causal tracing,
    and structured algorithmic explainability.
    """

    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Initialize audit storage and bootstrap existing historical runs if ledger is empty."""
        if self._initialized:
            return
        with self._lock:
            if self._initialized:
                return
            self._initialized = True
            storage = get_audit_storage_path()
            events_file = storage / "events.jsonl"
            if not events_file.exists() or events_file.stat().st_size == 0:
                events_file.touch(exist_ok=True)
                self._bootstrap_historical_records()

    def _get_latest_state(self) -> Tuple[int, str]:
        """Read the last sequence number and latest hash from the append-only ledger."""
        storage = get_audit_storage_path()
        events_file = storage / "events.jsonl"
        if not events_file.exists():
            return 0, GENESIS_HASH

        last_seq = 0
        last_hash = GENESIS_HASH

        with open(events_file, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    data = json.loads(line_str)
                    last_seq = data.get("sequence_number", last_seq)
                    last_hash = data.get("event_hash", last_hash)
                except Exception:
                    continue

        return last_seq, last_hash

    def record_event(
        self,
        event_type: AuditEventType,
        *,
        dataset_id: Optional[str] = None,
        source_row_index: Optional[int] = None,
        sensor_column: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        pipeline_version: Optional[int] = None,
        detection_run_id: Optional[str] = None,
        anomaly_id: Optional[str] = None,
        reconstruction_run_id: Optional[str] = None,
        reconstruction_result_id: Optional[str] = None,
        evaluation_run_id: Optional[str] = None,
        previous_event_id: Optional[str] = None,
        original_value: Optional[float] = None,
        proposed_value: Optional[float] = None,
        final_value: Optional[float] = None,
        previous_status: Optional[str] = None,
        new_status: Optional[str] = None,
        detection_method: Optional[str] = None,
        reconstruction_method: Optional[str] = None,
        confidence_score: Optional[float] = None,
        confidence_breakdown: Optional[Dict[str, float]] = None,
        evidence_references: Optional[Dict[str, Any]] = None,
        decision_reason: Optional[str] = None,
        validation_outcomes: Optional[Dict[str, Any]] = None,
        processing_outcome: Optional[str] = None,
        error_details: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        custom_timestamp: Optional[str] = None,
    ) -> AuditEvent:
        """
        Atomically append an audit event to the hash chain ledger.
        Normal application code cannot update or delete existing events.
        """
        self._ensure_initialized()
        with self._lock:
            last_seq, last_hash = self._get_latest_state()
            seq_num = last_seq + 1
            event_id = f"evt_{uuid.uuid4().hex[:12]}"
            ts = custom_timestamp or datetime.now(timezone.utc).isoformat()

            raw_dict = {
                "event_id": event_id,
                "event_type": event_type.value if hasattr(event_type, "value") else str(event_type),
                "schema_version": "1.0.0",
                "sequence_number": seq_num,
                "timestamp": ts,
                "dataset_id": dataset_id,
                "source_row_index": source_row_index,
                "sensor_column": sensor_column,
                "pipeline_id": pipeline_id,
                "pipeline_version": pipeline_version,
                "detection_run_id": detection_run_id,
                "anomaly_id": anomaly_id,
                "reconstruction_run_id": reconstruction_run_id,
                "reconstruction_result_id": reconstruction_result_id,
                "evaluation_run_id": evaluation_run_id,
                "previous_event_id": previous_event_id,
                "original_value": original_value,
                "proposed_value": proposed_value,
                "final_value": final_value,
                "previous_status": previous_status,
                "new_status": new_status,
                "detection_method": detection_method,
                "reconstruction_method": reconstruction_method,
                "confidence_score": confidence_score,
                "confidence_breakdown": confidence_breakdown,
                "evidence_references": evidence_references,
                "decision_reason": decision_reason,
                "validation_outcomes": validation_outcomes,
                "processing_outcome": processing_outcome,
                "error_details": error_details,
                "metadata": sanitize_payload(metadata or {}),
                "previous_hash": last_hash,
            }

            canonical_str = canonicalize_for_hash(raw_dict)
            content_to_digest = f"{canonical_str}{last_hash}".encode("utf-8")
            event_hash = sha256(content_to_digest).hexdigest()
            raw_dict["event_hash"] = event_hash

            event = AuditEvent(**raw_dict)

            storage = get_audit_storage_path()
            events_file = storage / "events.jsonl"
            with open(events_file, "a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")
                f.flush()
                os.fsync(f.fileno())

            return event

    def list_events(
        self,
        dataset_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        event_type: Optional[str] = None,
        sensor_column: Optional[str] = None,
        run_id: Optional[str] = None,
        status: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> AuditEventListResponse:
        """Query persisted audit events with filtering and pagination."""
        self._ensure_initialized()
        storage = get_audit_storage_path()
        events_file = storage / "events.jsonl"
        if not events_file.exists():
            return AuditEventListResponse(events=[], total=0, limit=limit, offset=offset)

        filtered: List[AuditEvent] = []

        with open(events_file, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    data = json.loads(line_str)
                except Exception:
                    continue

                if dataset_id and data.get("dataset_id") != dataset_id:
                    continue
                if pipeline_id and data.get("pipeline_id") != pipeline_id:
                    continue
                if event_type and data.get("event_type") != event_type:
                    continue
                if sensor_column and data.get("sensor_column") != sensor_column:
                    continue
                if run_id:
                    if (
                        data.get("detection_run_id") != run_id
                        and data.get("reconstruction_run_id") != run_id
                        and data.get("evaluation_run_id") != run_id
                    ):
                        continue
                if status and data.get("new_status") != status and data.get("processing_outcome") != status:
                    continue
                if start_time and data.get("timestamp", "") < start_time:
                    continue
                if end_time and data.get("timestamp", "") > end_time:
                    continue

                filtered.append(AuditEvent(**data))

        # Reverse chronological ordering (latest events first)
        filtered.reverse()
        total = len(filtered)
        paginated = filtered[offset : offset + limit]

        return AuditEventListResponse(events=paginated, total=total, limit=limit, offset=offset)

    def get_event(self, event_id: str) -> AuditEvent:
        """Retrieve a specific audit event by unique event identifier."""
        self._ensure_initialized()
        storage = get_audit_storage_path()
        events_file = storage / "events.jsonl"
        if not events_file.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Audit event with ID '{event_id}' not found.",
            )

        with open(events_file, "r", encoding="utf-8") as f:
            for line in f:
                line_str = line.strip()
                if not line_str:
                    continue
                try:
                    data = json.loads(line_str)
                    if data.get("event_id") == event_id:
                        return AuditEvent(**data)
                except Exception:
                    continue

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Audit event with ID '{event_id}' not found.",
        )

    def get_run_events(self, run_id: str, limit: int = 200, offset: int = 0) -> AuditEventListResponse:
        """Retrieve all audit events associated with a detection, reconstruction, or evaluation run."""
        return self.list_events(run_id=run_id, limit=limit, offset=offset)

    def get_observation_history(self, dataset_id: str, row_id: int) -> ObservationHistoryResponse:
        """
        Assemble the complete chronological audit history for a specific source observation.
        Includes original raw values from CSV, anomaly occurrences, and reconstruction records.
        """
        self._ensure_initialized()
        meta = dataset_service.get_dataset_metadata(dataset_id)

        # 1. Read row values directly from original CSV
        dataset_storage = get_storage_path()
        csv_path = dataset_storage / dataset_id / "data.csv"
        row_values: Dict[str, Any] = {}
        if csv_path.exists():
            try:
                df = pd.read_csv(csv_path)
                if 0 <= row_id < len(df):
                    row_series = df.iloc[row_id]
                    for col in df.columns:
                        val = row_series[col]
                        if pd.isna(val):
                            row_values[col] = None
                        elif isinstance(val, (int, np.integer)):
                            row_values[col] = int(val)
                        elif isinstance(val, (float, np.floating)):
                            row_values[col] = float(val) if np.isfinite(val) else None
                        else:
                            row_values[col] = str(val)
            except Exception as e:
                logger.warning("Failed to read row %d from %s: %s", row_id, csv_path, str(e))

        # 2. Collect audit events for this specific dataset and row index
        storage = get_audit_storage_path()
        events_file = storage / "events.jsonl"
        matched_events: List[AuditEvent] = []
        if events_file.exists():
            with open(events_file, "r", encoding="utf-8") as f:
                for line in f:
                    line_str = line.strip()
                    if not line_str:
                        continue
                    try:
                        data = json.loads(line_str)
                        if data.get("dataset_id") == dataset_id and data.get("source_row_index") == row_id:
                            matched_events.append(AuditEvent(**data))
                    except Exception:
                        continue

        # 3. Find any anomaly records across all detection runs for this row
        anomalies: List[Dict[str, Any]] = []
        runs_base = get_runs_storage_path()
        if runs_base.exists():
            for r_dir in runs_base.iterdir():
                if r_dir.is_dir() and r_dir.name.startswith("run_"):
                    anom_file = r_dir / "anomalies.json"
                    run_file = r_dir / "run.json"
                    if anom_file.exists() and run_file.exists():
                        try:
                            with open(run_file, "r", encoding="utf-8") as rf:
                                run_meta = json.load(rf)
                            if run_meta.get("dataset_id") != dataset_id:
                                continue
                            with open(anom_file, "r", encoding="utf-8") as af:
                                anom_list = json.load(af)
                            for a in anom_list:
                                if a.get("source_row_index") == row_id:
                                    anomalies.append(a)
                        except Exception:
                            continue

        # 4. Find any reconstruction records across all reconstruction runs for this row
        reconstructions: List[Dict[str, Any]] = []
        rec_storage = get_reconstruction_storage_path()
        if rec_storage.exists():
            for r_dir in rec_storage.iterdir():
                if r_dir.is_dir() and r_dir.name.startswith("rec_run_"):
                    results_file = r_dir / "results.json"
                    run_file = r_dir / "run.json"
                    if results_file.exists() and run_file.exists():
                        try:
                            with open(run_file, "r", encoding="utf-8") as rf:
                                run_meta = json.load(rf)
                            if run_meta.get("dataset_id") != dataset_id:
                                continue
                            with open(results_file, "r", encoding="utf-8") as resf:
                                res_list = json.load(resf)
                            for r in res_list:
                                if r.get("source_row_index") == row_id:
                                    reconstructions.append(r)
                        except Exception:
                            continue

        return ObservationHistoryResponse(
            dataset_id=dataset_id,
            source_row_index=row_id,
            row_values=row_values,
            events=matched_events,
            anomalies=anomalies,
            reconstructions=reconstructions,
        )

    def get_causal_trace(self, reconstruction_result_id: str) -> CausalTraceResponse:
        """
        Assemble the complete causal provenance trace for a reconstruction result:
        Original observation -> Detection run -> Anomaly record -> Reconstruction proposal
        -> Confidence & Cross-sensor audit -> Final policy decision -> Benchmark comparison.
        """
        self._ensure_initialized()

        # 1. Retrieve the target reconstruction record
        rec_record = reconstruction_service.get_result_by_id(reconstruction_result_id)
        rec_run = reconstruction_service.get_reconstruction_run(rec_record.reconstruction_run_id)

        # 2. Retrieve the associated detection run and anomaly record
        det_run = detection_service.get_detection_run(rec_record.detection_run_id)
        det_results = detection_service.get_detection_run_results(rec_record.detection_run_id, limit=50000)

        anomaly_record = None
        for a in det_results.anomalies:
            if (
                a.source_row_index == rec_record.source_row_index
                and a.sensor_column == rec_record.sensor_column
            ):
                anomaly_record = a
                break

        # 3. Retrieve pipeline configuration
        pipeline_cfg = pipeline_service.get_pipeline_config(rec_run.pipeline_id)

        # 4. Retrieve original raw dataset row
        dataset_storage = get_storage_path()
        csv_path = dataset_storage / rec_run.dataset_id / "data.csv"
        raw_val = rec_record.original_value
        row_timestamp: Optional[str] = rec_record.timestamp

        # 5. Build Detection Explanation
        det_explanation: Optional[DetectionExplanation] = None
        if anomaly_record is not None:
            detector_scores: Dict[str, float] = {}
            if hasattr(anomaly_record, "detector_details") and anomaly_record.detector_details:
                for d_name, d_detail in anomaly_record.detector_details.items():
                    if getattr(d_detail, "score", None) is not None:
                        detector_scores[d_name] = d_detail.score
            elif getattr(anomaly_record, "detector_score", None) is not None:
                detector_scores[anomaly_record.detector_name] = anomaly_record.detector_score

            flagged_msg = (
                f"Flagged by {', '.join(anomaly_record.detectors_flagged)} with "
                f"severity '{anomaly_record.severity}' and consensus '{anomaly_record.consensus}'."
            )

            neighbor_obs: List[Dict[str, Any]] = []
            if csv_path.exists():
                try:
                    df = pd.read_csv(csv_path)
                    r_idx = rec_record.source_row_index
                    for offset in [-2, -1, 1, 2]:
                        target_r = r_idx + offset
                        if 0 <= target_r < len(df):
                            val = df[rec_record.sensor_column].iloc[target_r]
                            neighbor_obs.append(
                                {
                                    "row_index": target_r,
                                    "value": float(val) if (pd.notna(val) and np.isfinite(val)) else None,
                                    "offset": offset,
                                }
                            )
                except Exception:
                    pass

            det_explanation = DetectionExplanation(
                detector_name=anomaly_record.detectors_flagged[0] if anomaly_record.detectors_flagged else "unknown",
                detector_scores=detector_scores,
                thresholds={
                    "mad_threshold": getattr(pipeline_cfg.detection_settings.statistical, "mad_threshold", 3.5),
                    "isolation_forest_contamination": getattr(pipeline_cfg.detection_settings.isolation_forest, "contamination", 0.05),
                },
                observation_index=rec_record.source_row_index,
                sensor_column=rec_record.sensor_column,
                original_value=raw_val,
                neighbor_observations=neighbor_obs,
                consensus=anomaly_record.consensus,
                agreement_summary=(
                    f"Consensus: {anomaly_record.consensus}. Flagged detectors: {', '.join(anomaly_record.detectors_flagged)}"
                ),
                flagged_reason=flagged_msg,
            )

        # 6. Build Reconstruction Explanation
        breakdown_dict: Dict[str, float] = {}
        if rec_record.confidence_breakdown:
            cb = rec_record.confidence_breakdown
            breakdown_dict = {
                "neighbor_count_score": getattr(cb, "neighbor_count_score", 0.0),
                "method_agreement_score": getattr(cb, "method_agreement_score", 0.0),
                "temporal_proximity_score": getattr(cb, "temporal_proximity_score", 0.0),
                "local_variance_score": getattr(cb, "local_variance_score", 0.0),
                "neighbor_cleanliness_score": getattr(cb, "neighbor_cleanliness_score", 0.0),
                "cross_sensor_score": getattr(cb, "cross_sensor_score", 0.0),
                "total_score": getattr(cb, "total_score", 0.0),
            }

        supporting_indices = [e.source_row_index for e in (rec_record.evidence_references or [])]
        supporting_vals = [e.value for e in (rec_record.evidence_references or [])]

        rec_explanation = ReconstructionExplanation(
            original_value=rec_record.original_value,
            proposed_value=rec_record.proposed_value,
            final_value=rec_record.final_value,
            reconstruction_method=rec_record.method,
            supporting_observation_indices=supporting_indices,
            supporting_values=supporting_vals,
            valid_neighbors_count=len(supporting_indices),
            confidence_score=rec_record.confidence_score,
            confidence_breakdown=breakdown_dict,
            cross_sensor_validation={
                "cross_sensor_score": getattr(rec_record.confidence_breakdown, "cross_sensor_score", 0.0)
            } if rec_record.confidence_breakdown else None,
            policy_outcome=rec_record.status,
            decision_reason=rec_record.abstention_reason
            or f"Confidence score {rec_record.confidence_score:.1f} resulted in status {rec_record.status}.",
        )

        # 7. Check for benchmark / evaluation explanation
        eval_explanation: Optional[EvaluationExplanation] = None
        eval_storage = Path(settings.EVALUATION_STORAGE_DIR)
        if not eval_storage.is_absolute():
            cwd = Path.cwd()
            eval_storage = cwd / "backend" / eval_storage if (cwd / "backend").is_dir() else cwd / eval_storage
        if eval_storage.exists():
            for e_dir in eval_storage.iterdir():
                if e_dir.is_dir() and e_dir.name.startswith("eval_"):
                    e_file = e_dir / "evaluation.json"
                    if e_file.exists():
                        try:
                            with open(e_file, "r", encoding="utf-8") as ef:
                                e_data = json.load(ef)
                            if (
                                e_data.get("reconstruction_run_id") == rec_record.reconstruction_run_id
                                or e_data.get("detection_run_id") == rec_record.detection_run_id
                            ):
                                eval_explanation = EvaluationExplanation(
                                    evaluation_mode=e_data.get("evaluation_mode", "mode_a_benchmark"),
                                    ground_truth_source=e_data.get("source_dataset_id", "source_dataset"),
                                    manifest_ref=e_data.get("manifest_ref"),
                                    metric_definitions={
                                        "precision": "TP / (TP + FP)",
                                        "recall": "TP / (TP + FN)",
                                        "mae": "Mean absolute error on accepted repairs",
                                    },
                                    eligible_observations_count=e_data.get("dataset_profile", {}).get("row_count", 0),
                                    results_summary={
                                        "detection_f1": e_data.get("detection_metrics", {}).get("f1_score"),
                                        "reconstruction_mae": e_data.get("reconstruction_metrics", {}).get("mae"),
                                    },
                                    unavailable_metrics=[],
                                    unavailable_reasons={},
                                )
                                break
                        except Exception:
                            continue

        # 8. Build Causal Trace Steps
        steps: List[CausalTraceStep] = []
        step_idx = 1

        # Step 1: Raw Observation
        steps.append(
            CausalTraceStep(
                step_index=step_idx,
                stage="OBSERVATION",
                title=f"Source Measurement Captured ({rec_record.sensor_column})",
                timestamp=row_timestamp,
                status="MEASURED",
                details={
                    "dataset_id": rec_run.dataset_id,
                    "row_index": rec_record.source_row_index,
                    "raw_value": rec_record.original_value,
                    "sensor": rec_record.sensor_column,
                },
            )
        )
        step_idx += 1

        # Step 2: Detection Execution
        steps.append(
            CausalTraceStep(
                step_index=step_idx,
                stage="DETECTION",
                title=f"Anomaly Detector Evaluation ({det_run.run_id})",
                timestamp=det_run.completion_time,
                status=det_run.status,
                details={
                    "pipeline_id": rec_run.pipeline_id,
                    "configuration_version": rec_run.configuration_version,
                    "active_detectors": det_run.detector_methods,
                },
            )
        )
        step_idx += 1

        # Step 3: Anomaly Detected
        if anomaly_record is not None:
            steps.append(
                CausalTraceStep(
                    step_index=step_idx,
                    stage="ANOMALY",
                    title=f"Observation Flagged as Anomaly ({anomaly_record.consensus})",
                    timestamp=anomaly_record.timestamp,
                    status=anomaly_record.severity,
                    details={
                        "detectors_flagged": anomaly_record.detectors_flagged,
                        "severity": anomaly_record.severity,
                        "consensus": anomaly_record.consensus,
                        "original_value": anomaly_record.original_value,
                    },
                )
            )
            step_idx += 1

        # Step 4: Reconstruction Proposal
        steps.append(
            CausalTraceStep(
                step_index=step_idx,
                stage="RECONSTRUCTION_PROPOSAL",
                title=f"Algorithmic Repair Proposed ({rec_record.method})",
                timestamp=rec_run.start_time,
                status=rec_record.status,
                details={
                    "method": rec_record.method,
                    "proposed_value": rec_record.proposed_value,
                    "neighbors_used": len(rec_record.evidence_references or []),
                },
            )
        )
        step_idx += 1

        # Step 5: Confidence & Policy Evaluation
        steps.append(
            CausalTraceStep(
                step_index=step_idx,
                stage="POLICY_EVALUATION",
                title=f"Confidence Audit & Policy Commit ({rec_record.confidence_score:.1f}/100)",
                timestamp=rec_run.completion_time,
                status=rec_record.status,
                details={
                    "confidence_score": rec_record.confidence_score,
                    "final_value": rec_record.final_value,
                    "policy_decision": rec_record.status,
                    "abstention_reason": rec_record.abstention_reason,
                },
            )
        )
        step_idx += 1

        # Step 6: Review Decision (if reviewed)
        if rec_record.is_reviewed:
            steps.append(
                CausalTraceStep(
                    step_index=step_idx,
                    stage="REVIEW",
                    title=f"Human Operator Review ({rec_record.review_decision})",
                    timestamp=rec_record.reviewed_at,
                    status=rec_record.status,
                    details={
                        "reviewer": rec_record.reviewed_by,
                        "decision": rec_record.review_decision,
                        "comment": rec_record.review_comment,
                        "final_committed_value": rec_record.final_value,
                    },
                )
            )
            step_idx += 1

        # Step 7: Benchmark Comparison (if evaluated)
        if eval_explanation is not None:
            steps.append(
                CausalTraceStep(
                    step_index=step_idx,
                    stage="EVALUATION",
                    title="Controlled Benchmark Validation Recorded",
                    timestamp=None,
                    status="VALIDATED",
                    details={
                        "evaluation_mode": eval_explanation.evaluation_mode,
                        "ground_truth_source": eval_explanation.ground_truth_source,
                    },
                )
            )

        # 9. Fetch all related audit events for this reconstruction record
        matched_events = self.list_events(
            run_id=rec_record.reconstruction_run_id,
            sensor_column=rec_record.sensor_column,
            limit=100,
        ).events

        return CausalTraceResponse(
            reconstruction_result_id=reconstruction_result_id,
            anomaly_id=anomaly_record.anomaly_id if anomaly_record else None,
            source_row_index=rec_record.source_row_index,
            sensor_column=rec_record.sensor_column,
            dataset_id=rec_run.dataset_id,
            pipeline_id=rec_run.pipeline_id,
            detection_run_id=rec_record.detection_run_id,
            reconstruction_run_id=rec_record.reconstruction_run_id,
            raw_value=rec_record.original_value,
            proposed_value=rec_record.proposed_value,
            final_value=rec_record.final_value,
            final_status=rec_record.status,
            confidence_score=rec_record.confidence_score,
            detection_explanation=det_explanation,
            reconstruction_explanation=rec_explanation,
            evaluation_explanation=eval_explanation,
            trace_steps=steps,
            events=matched_events,
        )

    def verify_hash_chain(self) -> HashChainVerificationResponse:
        """
        Verify the sequential cryptographic SHA-256 hash chain of all audit events in storage.
        Detects missing, modified, inserted, or reordered entries.
        """
        self._ensure_initialized()
        storage = get_audit_storage_path()
        events_file = storage / "events.jsonl"
        now_ts = datetime.now(timezone.utc).isoformat()

        limitations = [
            "Hash chains detect post-hoc alterations within normal application access.",
            "Local file storage cannot prevent an administrator with direct filesystem write access from recomputing the entire chain.",
            "This cryptographic verification checks internal ledger consistency, not legal compliance or hardware-enforced immutability.",
        ]

        if not events_file.exists():
            return HashChainVerificationResponse(
                is_valid=True,
                total_events_checked=0,
                genesis_hash=GENESIS_HASH,
                latest_hash=GENESIS_HASH,
                errors=[],
                verified_at=now_ts,
                limitations=limitations,
            )

        expected_prev_hash = GENESIS_HASH
        expected_seq = 1
        checked_count = 0
        latest_hash = GENESIS_HASH
        errors: List[str] = []

        with open(events_file, "r", encoding="utf-8") as f:
            for line_idx, line in enumerate(f, start=1):
                line_str = line.strip()
                if not line_str:
                    continue

                try:
                    data = json.loads(line_str)
                except Exception as e:
                    errors.append(f"Line {line_idx}: Failed to parse JSON record: {str(e)}")
                    break

                checked_count += 1
                seq = data.get("sequence_number")
                if seq != expected_seq:
                    errors.append(
                        f"Sequence gap at line {line_idx}: Expected sequence {expected_seq}, found {seq}."
                    )

                prev_hash = data.get("previous_hash")
                if prev_hash != expected_prev_hash:
                    errors.append(
                        f"Hash chain broken at event '{data.get('event_id')}' (line {line_idx}): "
                        f"Expected previous_hash '{expected_prev_hash[:16]}...', found '{prev_hash[:16] if prev_hash else 'None'}...'."
                    )

                stored_hash = data.get("event_hash")
                canonical_str = canonicalize_for_hash(data)
                content_to_digest = f"{canonical_str}{prev_hash}".encode("utf-8")
                computed_hash = sha256(content_to_digest).hexdigest()

                if computed_hash != stored_hash:
                    errors.append(
                        f"Digest mismatch at event '{data.get('event_id')}' (line {line_idx}): "
                        f"Payload has been modified. Stored hash '{stored_hash[:16]}...', recomputed '{computed_hash[:16]}...'."
                    )

                expected_prev_hash = stored_hash
                latest_hash = stored_hash
                expected_seq += 1

        is_valid = len(errors) == 0

        return HashChainVerificationResponse(
            is_valid=is_valid,
            total_events_checked=checked_count,
            genesis_hash=GENESIS_HASH,
            latest_hash=latest_hash,
            errors=errors,
            verified_at=now_ts,
            limitations=limitations,
        )

    def export_events(
        self,
        format_type: str = "jsonl",
        dataset_id: Optional[str] = None,
        pipeline_id: Optional[str] = None,
        event_type: Optional[str] = None,
        sensor_column: Optional[str] = None,
        run_id: Optional[str] = None,
        status: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 1000,
    ) -> Tuple[str, str]:
        """
        Export filtered audit records safely.
        Returns (content_string, media_type).
        """
        bounded_limit = max(1, min(limit, 10000))
        res = self.list_events(
            dataset_id=dataset_id,
            pipeline_id=pipeline_id,
            event_type=event_type,
            sensor_column=sensor_column,
            run_id=run_id,
            status=status,
            start_time=start_time,
            end_time=end_time,
            limit=bounded_limit,
            offset=0,
        )

        if format_type.lower() == "csv":
            output = io.StringIO()
            fieldnames = [
                "sequence_number",
                "timestamp",
                "event_id",
                "event_type",
                "dataset_id",
                "source_row_index",
                "sensor_column",
                "pipeline_id",
                "detection_run_id",
                "reconstruction_run_id",
                "original_value",
                "proposed_value",
                "final_value",
                "previous_status",
                "new_status",
                "confidence_score",
                "decision_reason",
                "previous_hash",
                "event_hash",
            ]
            writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
            writer.writeheader()
            for evt in res.events:
                writer.writerow(evt.model_dump())
            return output.getvalue(), "text/csv"

        # Default JSONL
        lines = [evt.model_dump_json() for evt in res.events]
        return "\n".join(lines), "application/x-ndjson"

    def _bootstrap_historical_records(self) -> None:
        """
        On first startup, scan existing datasets, pipelines, detection runs, and reconstruction runs
        to build an initial consistent ledger for all prior operations.
        """
        try:
            # 1. Existing datasets
            datasets = dataset_service.list_datasets().datasets
            for ds in datasets:
                self.record_event(
                    AuditEventType.DATASET_UPLOADED,
                    dataset_id=ds.dataset_id,
                    decision_reason=f"Uploaded source telemetry dataset '{ds.filename}' ({ds.row_count} rows, {ds.column_count} columns).",
                    custom_timestamp=ds.uploaded_at,
                    metadata={"filename": ds.filename, "row_count": ds.row_count, "column_count": ds.column_count},
                )
                self.record_event(
                    AuditEventType.DATASET_VALIDATED,
                    dataset_id=ds.dataset_id,
                    decision_reason=f"Data quality audit completed for dataset '{ds.dataset_id}'.",
                    custom_timestamp=ds.uploaded_at,
                )

            # 2. Existing pipelines
            pipelines = pipeline_service.list_pipeline_configs().pipelines
            for p in pipelines:
                self.record_event(
                    AuditEventType.PIPELINE_CREATED,
                    pipeline_id=p.configuration_id,
                    dataset_id=p.dataset_id,
                    pipeline_version=p.configuration_version,
                    decision_reason=f"Created pipeline configuration '{p.configuration_name}'.",
                    custom_timestamp=p.created_at,
                )

            # 3. Existing detection runs
            runs_base = get_runs_storage_path()
            if runs_base.exists():
                for r_dir in sorted(runs_base.iterdir()):
                    if r_dir.is_dir() and r_dir.name.startswith("run_"):
                        run_file = r_dir / "run.json"
                        anom_file = r_dir / "anomalies.json"
                        if run_file.exists():
                            with open(run_file, "r", encoding="utf-8") as rf:
                                r_meta = json.load(rf)
                            run_id = r_meta.get("run_id")
                            self.record_event(
                                AuditEventType.DETECTION_RUN_STARTED,
                                detection_run_id=run_id,
                                pipeline_id=r_meta.get("configuration_id"),
                                dataset_id=r_meta.get("dataset_id"),
                                custom_timestamp=r_meta.get("start_time"),
                                decision_reason="Started detector execution.",
                            )

                            if anom_file.exists():
                                with open(anom_file, "r", encoding="utf-8") as af:
                                    anoms = json.load(af)
                                for a in anoms:
                                    self.record_event(
                                        AuditEventType.ANOMALY_DETECTED,
                                        detection_run_id=run_id,
                                        anomaly_id=a.get("anomaly_id"),
                                        dataset_id=r_meta.get("dataset_id"),
                                        pipeline_id=r_meta.get("configuration_id"),
                                        source_row_index=a.get("source_row_index"),
                                        sensor_column=a.get("sensor_column"),
                                        original_value=a.get("original_value"),
                                        new_status="ANOMALY",
                                        decision_reason=f"Flagged by {', '.join(a.get('detectors_flagged', []))} with {a.get('consensus')} consensus.",
                                        custom_timestamp=a.get("timestamp"),
                                    )

                            self.record_event(
                                AuditEventType.DETECTION_RUN_COMPLETED,
                                detection_run_id=run_id,
                                pipeline_id=r_meta.get("configuration_id"),
                                dataset_id=r_meta.get("dataset_id"),
                                processing_outcome=r_meta.get("status"),
                                custom_timestamp=r_meta.get("completion_time"),
                                decision_reason=f"Detection run completed with {r_meta.get('summary', {}).get('total_anomalies_detected', 0)} anomalies.",
                            )

            # 4. Existing reconstruction runs
            rec_storage = get_reconstruction_storage_path()
            if rec_storage.exists():
                for r_dir in sorted(rec_storage.iterdir()):
                    if r_dir.is_dir() and r_dir.name.startswith("rec_run_"):
                        run_file = r_dir / "run.json"
                        res_file = r_dir / "results.json"
                        if run_file.exists():
                            with open(run_file, "r", encoding="utf-8") as rf:
                                r_meta = json.load(rf)
                            rec_id = r_meta.get("reconstruction_run_id")
                            self.record_event(
                                AuditEventType.RECONSTRUCTION_RUN_STARTED,
                                reconstruction_run_id=rec_id,
                                detection_run_id=r_meta.get("detection_run_id"),
                                pipeline_id=r_meta.get("pipeline_id"),
                                dataset_id=r_meta.get("dataset_id"),
                                custom_timestamp=r_meta.get("start_time"),
                                decision_reason="Started reconstruction execution.",
                            )

                            if res_file.exists():
                                with open(res_file, "r", encoding="utf-8") as rf2:
                                    results = json.load(rf2)
                                for rec in results:
                                    status_val = rec.get("status")
                                    evt_type = (
                                        AuditEventType.CORRECTION_ACCEPTED
                                        if status_val == "CORRECTED"
                                        else AuditEventType.RECONSTRUCTION_UNRESOLVED
                                        if status_val == "UNRESOLVED"
                                        else AuditEventType.VALUE_PROPOSED
                                    )
                                    self.record_event(
                                        evt_type,
                                        reconstruction_run_id=rec_id,
                                        reconstruction_result_id=rec.get("result_id"),
                                        detection_run_id=r_meta.get("detection_run_id"),
                                        pipeline_id=r_meta.get("pipeline_id"),
                                        dataset_id=r_meta.get("dataset_id"),
                                        source_row_index=rec.get("source_row_index"),
                                        sensor_column=rec.get("sensor_column"),
                                        original_value=rec.get("original_value"),
                                        proposed_value=rec.get("proposed_value"),
                                        final_value=rec.get("final_value"),
                                        new_status=status_val,
                                        reconstruction_method=rec.get("method"),
                                        confidence_score=rec.get("confidence_score"),
                                        decision_reason=rec.get("abstention_reason")
                                        or f"Reconstruction committed with status {status_val}.",
                                        custom_timestamp=r_meta.get("completion_time"),
                                    )

                                    if rec.get("is_reviewed"):
                                        rev_evt = (
                                            AuditEventType.REVIEW_APPROVED
                                            if rec.get("review_decision") == "ACCEPT"
                                            else AuditEventType.REVIEW_REJECTED
                                            if rec.get("review_decision") == "REJECT"
                                            else AuditEventType.REVIEW_COMMENT_ADDED
                                        )
                                        self.record_event(
                                            rev_evt,
                                            reconstruction_run_id=rec_id,
                                            reconstruction_result_id=rec.get("result_id"),
                                            decision_reason=f"Operator '{rec.get('reviewed_by')}' submitted {rec.get('review_decision')}: {rec.get('review_comment')}",
                                            custom_timestamp=rec.get("reviewed_at"),
                                        )

                            self.record_event(
                                AuditEventType.RECONSTRUCTION_RUN_COMPLETED,
                                reconstruction_run_id=rec_id,
                                detection_run_id=r_meta.get("detection_run_id"),
                                pipeline_id=r_meta.get("pipeline_id"),
                                dataset_id=r_meta.get("dataset_id"),
                                processing_outcome="completed",
                                custom_timestamp=r_meta.get("completion_time"),
                                decision_reason="Reconstruction run completed.",
                            )
        except Exception as e:
            logger.warning("Historical bootstrap encountered non-fatal error: %s", str(e))


audit_service = AuditService()
