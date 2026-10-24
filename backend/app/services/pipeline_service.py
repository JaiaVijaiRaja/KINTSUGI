import json
import logging
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.pipeline import (
    ConfidencePolicy,
    DetectionSettings,
    PipelineConfig,
    PipelineConfigCreate,
    PipelineConfigUpdate,
    PipelineListResponse,
    PipelineValidationResponse,
    ReconstructionSettings,
    ValidationIssue,
)
from app.services.dataset_service import dataset_service

logger = logging.getLogger("kintsugi.pipeline_service")


def get_pipeline_storage_path() -> Path:
    """Resolve and ensure the local pipeline configuration storage directory exists."""
    base = Path(settings.PIPELINE_STORAGE_DIR)
    if not base.is_absolute():
        cwd = Path.cwd()
        if (cwd / "backend").is_dir():
            base = cwd / "backend" / base
        else:
            base = cwd / base
    base.mkdir(parents=True, exist_ok=True)
    return base


class PipelineService:
    """Service for validating, saving, listing, and updating pipeline configurations."""

    def validate_pipeline_config(
        self, config_data: PipelineConfigCreate
    ) -> PipelineValidationResponse:
        """
        Validate a submitted pipeline configuration against the actual dataset.
        Does NOT persist the configuration and does NOT execute any pipeline.
        """
        dataset_id = config_data.dataset_id

        # 1. Verify target dataset exists and retrieve metadata & quality audit
        meta = dataset_service.get_dataset_metadata(dataset_id)
        quality = dataset_service.get_dataset_quality(dataset_id)

        errors: List[ValidationIssue] = []
        warnings: List[ValidationIssue] = []

        dataset_columns = set(meta.columns)
        column_quality_map = {col.name: col for col in quality.columns}

        # 2. Validate Timestamp Column
        if config_data.timestamp_column:
            ts_col = config_data.timestamp_column
            if ts_col not in dataset_columns:
                errors.append(
                    ValidationIssue(
                        field="timestamp_column",
                        message=f"Column '{ts_col}' does not exist in dataset '{meta.filename}'.",
                        severity="error",
                    )
                )
            else:
                col_q = column_quality_map.get(ts_col)
                if col_q and col_q.missing_count > 0:
                    warnings.append(
                        ValidationIssue(
                            field="timestamp_column",
                            message=(
                                f"Timestamp column '{ts_col}' contains {col_q.missing_count} "
                                f"missing values ({col_q.missing_percentage:.1f}%)."
                            ),
                            severity="warning",
                        )
                    )

                # Check timestamp candidate evaluations
                matched_cand = next(
                    (c for c in quality.timestamp_candidates if c.column_name == ts_col),
                    None,
                )
                if matched_cand:
                    if matched_cand.parseable_percentage < 100.0:
                        warnings.append(
                            ValidationIssue(
                                field="timestamp_column",
                                message=(
                                    f"Timestamp column '{ts_col}' is only {matched_cand.parseable_percentage:.1f}% "
                                    f"parseable as valid datetime."
                                ),
                                severity="warning",
                            )
                        )
                    if matched_cand.duplicate_timestamp_count > 0:
                        warnings.append(
                            ValidationIssue(
                                field="timestamp_column",
                                message=(
                                    f"Timestamp column '{ts_col}' contains {matched_cand.duplicate_timestamp_count} "
                                    f"duplicate timestamps ({matched_cand.duplicate_percentage:.1f}%). "
                                    f"Chronological ordering may be ambiguous."
                                ),
                                severity="warning",
                            )
                        )
                    if not matched_cand.is_monotonic:
                        warnings.append(
                            ValidationIssue(
                                field="timestamp_column",
                                message=f"Timestamp column '{ts_col}' does not follow strict monotonic sequence progression.",
                                severity="warning",
                            )
                        )
                else:
                    # Column exists but was not detected as a candidate timestamp
                    warnings.append(
                        ValidationIssue(
                            field="timestamp_column",
                            message=(
                                f"Column '{ts_col}' was not detected as a candidate datetime series "
                                f"during dataset quality auditing."
                            ),
                            severity="warning",
                        )
                    )
        else:
            warnings.append(
                ValidationIssue(
                    field="timestamp_column",
                    message="No timestamp column selected. Time-based rolling window analysis and chronological ordering will be unavailable.",
                    severity="warning",
                )
            )

        # 3. Validate Sensor Columns
        if not config_data.sensor_columns or len(config_data.sensor_columns) == 0:
            errors.append(
                ValidationIssue(
                    field="sensor_columns",
                    message="At least one sensor column must be mapped.",
                    severity="error",
                )
            )
        else:
            # Check duplicate sensor-column assignments
            seen_sensors = set()
            dup_sensors = set()
            for s in config_data.sensor_columns:
                if s in seen_sensors:
                    dup_sensors.add(s)
                seen_sensors.add(s)
            if dup_sensors:
                errors.append(
                    ValidationIssue(
                        field="sensor_columns",
                        message=f"Duplicate sensor-column assignment: {', '.join(sorted(dup_sensors))}.",
                        severity="error",
                    )
                )

            # Check existence and type compatibility for each sensor
            for s in config_data.sensor_columns:
                if s not in dataset_columns:
                    errors.append(
                        ValidationIssue(
                            field="sensor_columns",
                            message=f"Sensor column '{s}' does not exist in dataset '{meta.filename}'.",
                            severity="error",
                        )
                    )
                else:
                    col_q = column_quality_map.get(s)
                    if col_q:
                        if not col_q.is_numeric:
                            errors.append(
                                ValidationIssue(
                                    field="sensor_columns",
                                    message=(
                                        f"Sensor column '{s}' has detected type '{col_q.detected_type}', "
                                        f"which is non-numeric. Sensors must be numeric measurements."
                                    ),
                                    severity="error",
                                )
                            )
                        elif col_q.missing_count > 0:
                            warnings.append(
                                ValidationIssue(
                                    field="sensor_columns",
                                    message=(
                                        f"Sensor column '{s}' contains {col_q.missing_count} missing values "
                                        f"({col_q.missing_percentage:.1f}%). Gaps will be subject to reconstruction policy."
                                    ),
                                    severity="warning",
                                )
                            )

        # 4. Validate Ignored Columns
        for ign in config_data.ignored_columns:
            if ign not in dataset_columns:
                errors.append(
                    ValidationIssue(
                        field="ignored_columns",
                        message=f"Ignored column '{ign}' does not exist in dataset '{meta.filename}'.",
                        severity="error",
                    )
                )

        # 5. Check Conflicting Column Roles
        sensor_set = set(config_data.sensor_columns)
        ignored_set = set(config_data.ignored_columns)

        if config_data.timestamp_column:
            if config_data.timestamp_column in sensor_set:
                errors.append(
                    ValidationIssue(
                        field="timestamp_column",
                        message=f"Column '{config_data.timestamp_column}' cannot be mapped as both timestamp and sensor.",
                        severity="error",
                    )
                )
            if config_data.timestamp_column in ignored_set:
                errors.append(
                    ValidationIssue(
                        field="timestamp_column",
                        message=f"Column '{config_data.timestamp_column}' cannot be mapped as both timestamp and ignored.",
                        severity="error",
                    )
                )

        conflicting_sensor_ignored = sensor_set.intersection(ignored_set)
        if conflicting_sensor_ignored:
            errors.append(
                ValidationIssue(
                    field="sensor_columns",
                    message=(
                        f"Columns assigned simultaneously to conflicting roles (sensor and ignored): "
                        f"{', '.join(sorted(conflicting_sensor_ignored))}."
                    ),
                    severity="error",
                )
            )

        # 6. Validate Detection Settings
        det = config_data.detection_settings
        if not det.statistical.enabled and not det.isolation_forest.enabled:
            warnings.append(
                ValidationIssue(
                    field="detection_settings",
                    message="Both statistical and Isolation Forest anomaly detectors are disabled. No anomalies will be detected during execution.",
                    severity="warning",
                )
            )

        if det.statistical.enabled:
            if det.statistical.min_observations > meta.row_count:
                errors.append(
                    ValidationIssue(
                        field="detection_settings.statistical.min_observations",
                        message=(
                            f"Statistical min observations ({det.statistical.min_observations}) "
                            f"exceeds total dataset rows ({meta.row_count})."
                        ),
                        severity="error",
                    )
                )
            elif det.statistical.window_size > meta.row_count:
                warnings.append(
                    ValidationIssue(
                        field="detection_settings.statistical.window_size",
                        message=(
                            f"Statistical rolling window size ({det.statistical.window_size}) "
                            f"exceeds total dataset rows ({meta.row_count}). Window will be truncated to available rows."
                        ),
                        severity="warning",
                    )
                )

        if det.isolation_forest.enabled:
            if det.isolation_forest.min_observations > meta.row_count:
                warnings.append(
                    ValidationIssue(
                        field="detection_settings.isolation_forest.min_observations",
                        message=(
                            f"Isolation Forest min observations ({det.isolation_forest.min_observations}) "
                            f"exceeds total dataset rows ({meta.row_count}). Multi-tree fitting may be constrained."
                        ),
                        severity="warning",
                    )
                )

        # 7. Validate Reconstruction Settings
        rec = config_data.reconstruction_settings
        if not rec.preserve_original_readings:
            errors.append(
                ValidationIssue(
                    field="reconstruction_settings.preserve_original_readings",
                    message="Preservation of original sensor readings is a non-negotiable architectural invariant in KINTSUGI. 'preserve_original_readings' must be True.",
                    severity="error",
                )
            )

        if rec.require_cross_sensor_validation and len(sensor_set) < 2:
            warnings.append(
                ValidationIssue(
                    field="reconstruction_settings.require_cross_sensor_validation",
                    message="Cross-sensor validation is enabled, but only 1 sensor column is configured. Cross-channel correlation will be unavailable.",
                    severity="warning",
                )
            )

        # 8. Validate Confidence Policy
        conf = config_data.confidence_policy
        if conf.review_threshold == 0.0:
            warnings.append(
                ValidationIssue(
                    field="confidence_policy.review_threshold",
                    message="Review threshold is 0.0. All candidate repairs will be approved without confidence verification.",
                    severity="warning",
                )
            )
        elif conf.review_threshold == 1.0:
            warnings.append(
                ValidationIssue(
                    field="confidence_policy.review_threshold",
                    message="Review threshold is 1.0. System will strictly abstain on all repairs unless confidence is 100%.",
                    severity="warning",
                )
            )

        if conf.min_evidence_sensors > len(sensor_set):
            warnings.append(
                ValidationIssue(
                    field="confidence_policy.min_evidence_sensors",
                    message=(
                        f"Minimum evidence sensors ({conf.min_evidence_sensors}) exceeds total "
                        f"configured sensors ({len(sensor_set)}). Multi-sensor quorum cannot be achieved."
                    ),
                    severity="warning",
                )
            )

        return PipelineValidationResponse(
            is_valid=(len(errors) == 0),
            errors=errors,
            warnings=warnings,
            dataset_id=dataset_id,
        )

    def create_pipeline_config(
        self, config_data: PipelineConfigCreate
    ) -> PipelineConfig:
        """Create, validate, and persist a new pipeline configuration."""
        validation = self.validate_pipeline_config(config_data)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Configuration validation failed.",
                    "errors": [e.model_dump() for e in validation.errors],
                    "warnings": [w.model_dump() for w in validation.warnings],
                },
            )

        storage_base = get_pipeline_storage_path()
        config_id = f"pipe_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()

        pipeline = PipelineConfig(
            configuration_id=config_id,
            configuration_name=config_data.configuration_name.strip(),
            description=config_data.description,
            dataset_id=config_data.dataset_id,
            configuration_version=1,
            timestamp_column=config_data.timestamp_column,
            sensor_columns=config_data.sensor_columns,
            ignored_columns=config_data.ignored_columns,
            detection_settings=config_data.detection_settings,
            reconstruction_settings=config_data.reconstruction_settings,
            confidence_policy=config_data.confidence_policy,
            created_at=now_iso,
            updated_at=now_iso,
        )

        file_path = storage_base / f"{config_id}.json"
        temp_path = storage_base / f"{config_id}.tmp"

        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(pipeline.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, file_path)
            logger.info("Created pipeline configuration %s (%s)", config_id, pipeline.configuration_name)

            try:
                from app.services.audit_service import audit_service
                from app.schemas.audit import AuditEventType
                audit_service.record_event(
                    event_type=AuditEventType.PIPELINE_CREATED,
                    dataset_id=pipeline.dataset_id,
                    pipeline_id=config_id,
                    pipeline_version="1",
                    decision_reason=f"Pipeline configuration '{pipeline.configuration_name}' created",
                    validation_outcomes={"sensor_columns": pipeline.sensor_columns},
                    processing_outcome="CREATED",
                )
            except Exception as audit_err:
                logger.warning("Failed to record audit event for pipeline creation: %s", str(audit_err))

            return pipeline
        except Exception as e:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            logger.exception("Failed to write pipeline config %s: %s", config_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist pipeline configuration: {str(e)}",
            )

    def list_pipeline_configs(self) -> PipelineListResponse:
        """List all saved pipeline configurations from storage."""
        storage_base = get_pipeline_storage_path()
        pipelines: List[PipelineConfig] = []

        if storage_base.exists():
            for item in storage_base.iterdir():
                if item.is_file() and item.name.startswith("pipe_") and item.name.endswith(".json"):
                    try:
                        with open(item, "r", encoding="utf-8") as f:
                            data = json.load(f)
                            pipelines.append(PipelineConfig(**data))
                    except Exception as e:
                        logger.warning("Error reading pipeline configuration %s: %s", item.name, str(e))

        # Sort by updated_at descending
        pipelines.sort(key=lambda p: p.updated_at, reverse=True)
        return PipelineListResponse(pipelines=pipelines, total=len(pipelines))

    def get_pipeline_config(self, pipeline_id: str) -> PipelineConfig:
        """Retrieve a specific pipeline configuration by ID."""
        storage_base = get_pipeline_storage_path()
        file_path = storage_base / f"{pipeline_id}.json"

        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline configuration with ID '{pipeline_id}' not found.",
            )

        try:
            with open(file_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return PipelineConfig(**data)
        except Exception as e:
            logger.exception("Failed to load pipeline configuration %s: %s", pipeline_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Corrupted pipeline configuration file for ID '{pipeline_id}'.",
            )

    def update_pipeline_config(
        self, pipeline_id: str, update_data: PipelineConfigUpdate
    ) -> PipelineConfig:
        """Update an existing configuration with version increment and validation."""
        storage_base = get_pipeline_storage_path()
        file_path = storage_base / f"{pipeline_id}.json"

        if not file_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Pipeline configuration with ID '{pipeline_id}' not found.",
            )

        existing = self.get_pipeline_config(pipeline_id)

        # Validate updated configuration against target dataset
        create_repr = PipelineConfigCreate(
            configuration_name=update_data.configuration_name,
            description=update_data.description,
            dataset_id=update_data.dataset_id,
            timestamp_column=update_data.timestamp_column,
            sensor_columns=update_data.sensor_columns,
            ignored_columns=update_data.ignored_columns,
            detection_settings=update_data.detection_settings,
            reconstruction_settings=update_data.reconstruction_settings,
            confidence_policy=update_data.confidence_policy,
        )
        validation = self.validate_pipeline_config(create_repr)
        if not validation.is_valid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={
                    "message": "Configuration validation failed.",
                    "errors": [e.model_dump() for e in validation.errors],
                    "warnings": [w.model_dump() for w in validation.warnings],
                },
            )

        now_iso = datetime.now(timezone.utc).isoformat()
        updated_pipeline = PipelineConfig(
            configuration_id=existing.configuration_id,
            configuration_name=update_data.configuration_name.strip(),
            description=update_data.description,
            dataset_id=update_data.dataset_id,
            configuration_version=existing.configuration_version + 1,
            timestamp_column=update_data.timestamp_column,
            sensor_columns=update_data.sensor_columns,
            ignored_columns=update_data.ignored_columns,
            detection_settings=update_data.detection_settings,
            reconstruction_settings=update_data.reconstruction_settings,
            confidence_policy=update_data.confidence_policy,
            created_at=existing.created_at,
            updated_at=now_iso,
        )

        temp_path = storage_base / f"{pipeline_id}.tmp"
        try:
            with open(temp_path, "w", encoding="utf-8") as f:
                f.write(updated_pipeline.model_dump_json(indent=2))
                f.flush()
                os.fsync(f.fileno())
            os.replace(temp_path, file_path)
            logger.info(
                "Updated pipeline configuration %s to version %d",
                pipeline_id,
                updated_pipeline.configuration_version,
            )

            try:
                from app.services.audit_service import audit_service
                from app.schemas.audit import AuditEventType
                audit_service.record_event(
                    event_type=AuditEventType.PIPELINE_UPDATED,
                    dataset_id=updated_pipeline.dataset_id,
                    pipeline_id=pipeline_id,
                    pipeline_version=str(updated_pipeline.configuration_version),
                    decision_reason=f"Pipeline configuration '{updated_pipeline.configuration_name}' updated to version {updated_pipeline.configuration_version}",
                    validation_outcomes={"sensor_columns": updated_pipeline.sensor_columns},
                    processing_outcome="UPDATED",
                )
            except Exception as audit_err:
                logger.warning("Failed to record audit event for pipeline update: %s", str(audit_err))

            return updated_pipeline
        except Exception as e:
            if temp_path.exists():
                try:
                    temp_path.unlink()
                except Exception:
                    pass
            logger.exception("Failed to update pipeline config %s: %s", pipeline_id, str(e))
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist updated pipeline configuration: {str(e)}",
            )


pipeline_service = PipelineService()
