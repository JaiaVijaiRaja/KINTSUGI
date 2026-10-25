# KINTSUGI — Authoritative API Contract Specification

**Document Version:** 1.0.0 (Production / Demo Freeze)  
**Base URL:** `http://127.0.0.1:8000/api`  
**API Prefix:** `/api`  
**Standard Response Encoding:** `application/json; charset=utf-8`  
**Authentication:** Trusted local / single-tenant network boundary (no credentials required for demo)  

---

## 1. Global Invariants and Enums

### 1.1 Observation Processing Statuses
Every telemetry observation is categorized under one of four non-overlapping statuses:
* **`MEASURED`**: Physical sensor observation unaltered and active.
* **`ESTIMATED`**: Candidate reconstruction generated but awaiting approval under manual review policy.
* **`CORRECTED`**: Justified reconstruction approved and committed.
* **`UNRESOLVED`**: Pipeline explicitly declined to reconstruct due to insufficient or conflicting evidence.

### 1.2 Anomaly Severity Levels
* **`LOW`**, **`MEDIUM`**, **`HIGH`**, **`CRITICAL`**

### 1.3 Detector Consensus Types
* **`SINGLE_DETECTOR`**: Outlier flagged by exactly one detector method.
* **`MULTI_DETECTOR`**: Outlier corroborated by multiple independent detectors (e.g., Rolling MAD + Isolation Forest).
* **`NORMAL`**: Observation deemed inlier by all active detectors.
* **`UNASSESSED`**: Insufficient warm-up window or non-finite values prevented detector evaluation.

### 1.4 Reconstruction Methods
* **`linear_interpolation`**: Temporal bracketed interpolation between valid, non-anomalous anchors.
* **`local_median`**: Spatial/local quorum median among clean surrounding observations.
* **`cross_sensor`**: Multivariate regression corroboration against physically correlated companion channels.
* **`none`**: System abstained from reconstruction.

### 1.5 Standard Error Envelope
All error responses return HTTP 4xx or 5xx with a standardized body:
```json
{
  "detail": "Human-readable description of validation failure or rejected state"
}
```

---

## 2. Health & Operational Diagnostics

### `GET /api/health`
Probes service liveness, storage accessibility, and subsystem readiness.
* **Request:** None
* **Response (HTTP 200 OK):**
```json
{
  "status": "healthy",
  "project_name": "KINTSUGI Pipeline API",
  "environment": "development",
  "version": "0.1.0",
  "timestamp": "2026-10-25T16:00:00.000000Z",
  "storage_accessible": true
}
```

---

## 3. Dataset Ingestion & Profiling

### `POST /api/datasets/upload`
Uploads a raw CSV sensor telemetry file. Original bytes are stored immutably with SHA-256 digest computation.
* **Content-Type:** `multipart/form-data`
* **Form Field:** `file` (Binary CSV, up to 50 MB, max 500,000 rows, max 200 columns)
* **Response (HTTP 201 Created):**
```json
{
  "dataset_id": "ds_a1b2c3d4e5f6",
  "filename": "turbine_telemetry_demo.csv",
  "file_size_bytes": 3455,
  "row_count": 60,
  "column_count": 5,
  "columns": ["timestamp", "temperature_bearing_c", "vibration_drive_end_g", "ambient_temp_c", "pressure_feed_bar"],
  "uploaded_at": "2026-10-25T16:00:00.000000Z",
  "parsing_status": "ready",
  "quality_available": true
}
```

### `GET /api/datasets`
Lists all ingested datasets sorted by upload time (descending).
* **Response (HTTP 200 OK):**
```json
{
  "datasets": [ /* Array of DatasetMetadata */ ],
  "total": 1
}
```

### `GET /api/datasets/{dataset_id}`
Returns metadata for a specific dataset.
* **Response (HTTP 200 OK):** `DatasetMetadata` object.

### `GET /api/datasets/{dataset_id}/quality`
Returns automated data quality summary, missing cells, duplicate timestamps, and column statistics.
* **Response (HTTP 200 OK):**
```json
{
  "dataset_id": "ds_a1b2c3d4e5f6",
  "total_rows": 60,
  "total_columns": 5,
  "duplicate_rows_count": 0,
  "duplicate_rows_percentage": 0.0,
  "total_missing_cells": 3,
  "missing_cells_percentage": 1.0,
  "timestamp_candidates": [
    {
      "column_name": "timestamp",
      "parseable_percentage": 100.0,
      "sample_format": "%Y-%m-%dT%H:%M:%S",
      "duplicate_timestamp_count": 0,
      "duplicate_percentage": 0.0,
      "is_monotonic": true,
      "notes": null
    }
  ],
  "columns": [
    {
      "name": "temperature_bearing_c",
      "detected_type": "float",
      "is_numeric": true,
      "missing_count": 0,
      "missing_percentage": 0.0,
      "unique_count": 58,
      "sample_values": [52.1, 52.4, 52.2],
      "numeric_stats": {
        "min": 51.8,
        "max": 92.5,
        "mean": 53.12,
        "std": 5.12,
        "median": 52.3,
        "q25": 52.0,
        "q75": 52.7
      }
    }
  ],
  "computed_at": "2026-10-25T16:00:00.000000Z"
}
```

### `GET /api/datasets/{dataset_id}/preview`
Returns paginated preview rows.
* **Query Params:** `offset` (default 0), `limit` (default 50, max 500)
* **Response (HTTP 200 OK):**
```json
{
  "dataset_id": "ds_a1b2c3d4e5f6",
  "columns": ["timestamp", "temperature_bearing_c", ...],
  "rows": [ { "timestamp": "2026-01-01T00:00:00", ... } ],
  "total_rows": 60,
  "preview_rows": 50,
  "offset": 0,
  "limit": 50
}
```

---

## 4. Pipeline Configuration & Validation

### `POST /api/pipelines/validate`
Validates a candidate pipeline configuration against dataset schema without saving.
* **Request:** `PipelineConfigCreate` payload
* **Response (HTTP 200 OK):**
```json
{
  "is_valid": true,
  "errors": [],
  "warnings": [],
  "dataset_id": "ds_a1b2c3d4e5f6"
}
```

### `POST /api/pipelines`
Persists a validated pipeline configuration.
* **Request (HTTP 201 Created):**
```json
{
  "configuration_name": "Gas Turbine Stage 1 Calibration",
  "description": "Rolling MAD + Isolation Forest for bearing thermals",
  "dataset_id": "ds_a1b2c3d4e5f6",
  "timestamp_column": "timestamp",
  "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g"],
  "detection_settings": {
    "statistical": { "enabled": true, "window_size": 15, "mad_threshold": 3.0, "min_observations": 10 },
    "isolation_forest": { "enabled": true, "contamination": 0.05, "random_seed": 42, "min_observations": 50 }
  },
  "reconstruction_settings": {
    "allow_linear_interpolation": true,
    "max_gap_size": 5,
    "require_cross_sensor_validation": true,
    "preserve_original_readings": true,
    "allow_automatic_correction": true,
    "fallback_behavior": "abstain_unresolved"
  },
  "confidence_policy": {
    "review_threshold": 0.70,
    "human_review_required": false,
    "min_evidence_sensors": 1,
    "unjustified_behavior": "abstain_unresolved"
  }
}
```
* **Response:** Saved `PipelineConfig` including `configuration_id: "pipe_..."` and `configuration_version: 1`.

### `GET /api/pipelines`
Lists all saved pipeline configurations.
* **Response (HTTP 200 OK):** `{ "pipelines": [ ... ], "total": N }`

### `GET /api/pipelines/{pipeline_id}`
Retrieves a specific configuration.

### `GET /api/pipelines/{pipeline_id}/runs`
Lists all detection runs executed for the specified pipeline.
* **Response (HTTP 200 OK):** `{ "runs": [ ... ], "total": N }`

---

## 5. Anomaly Detection Engine

### `POST /api/anomalies/runs`
Executes real detection on the pipeline's configured dataset.
* **Request:** `{ "pipeline_id": "pipe_..." }`
* **Response (HTTP 201 Created):**
```json
{
  "run_id": "det_run_1a2b3c4d",
  "dataset_id": "ds_a1b2c3d4e5f6",
  "configuration_id": "pipe_...",
  "configuration_version": 1,
  "status": "completed",
  "start_time": "2026-10-25T16:00:00.000000Z",
  "completion_time": "2026-10-25T16:00:00.025000Z",
  "detector_methods": ["statistical", "isolation_forest"],
  "summary": {
    "total_rows_analyzed": 60,
    "total_anomalies_detected": 4,
    "anomalies_by_sensor": { "temperature_bearing_c": 2, "vibration_drive_end_g": 2 },
    "anomalies_by_detector": { "statistical": 3, "isolation_forest": 4 },
    "anomalies_by_severity": { "CRITICAL": 1, "HIGH": 2, "MEDIUM": 1, "LOW": 0 },
    "multi_detector_consensus_count": 3,
    "unusable_rows_count": 0
  },
  "errors": [],
  "warnings": []
}
```

### `GET /api/anomalies/runs/{run_id}`
Returns metadata and summary for a single detection run.

### `GET /api/anomalies/runs/{run_id}/results`
Returns paginated individual anomaly records.
* **Query Params:** `sensor_column`, `severity`, `consensus`, `limit` (default 50), `offset` (default 0)
* **Response (HTTP 200 OK):**
```json
{
  "run_id": "det_run_1a2b3c4d",
  "total_anomalies": 4,
  "anomalies": [
    {
      "anomaly_id": "anom_7f8e9d",
      "run_id": "det_run_1a2b3c4d",
      "dataset_id": "ds_a1b2c3d4e5f6",
      "configuration_id": "pipe_...",
      "sensor_column": "temperature_bearing_c",
      "source_row_index": 12,
      "timestamp": "2026-01-01T00:12:00",
      "original_value": 92.5,
      "detector_name": "ensemble",
      "detector_score": 4.82,
      "detection_reason": "Rolling MAD residual (4.82 MAD) exceeds 3.0 threshold; confirmed by Isolation Forest",
      "severity": "CRITICAL",
      "flagged_status": "FLAGGED",
      "consensus": "MULTI_DETECTOR",
      "detectors_flagged": ["statistical", "isolation_forest"],
      "detector_details": {
        "statistical": { "detector_name": "statistical", "flagged": true, "score": 4.82, "threshold": 3.0, "baseline": 52.3, "dispersion": 0.4 },
        "isolation_forest": { "detector_name": "isolation_forest", "flagged": true, "score": -0.18, "threshold": 0.0 }
      }
    }
  ],
  "limit": 50,
  "offset": 0
}
```

---

## 6. Reconstruction Engine & Operator Review

### `POST /api/pipelines/{pipeline_id}/runs/{detection_run_id}/reconstruct`
Triggers evidence-based signal repair and abstention evaluation for all flagged anomalies in a detection run.
* **Response (HTTP 200 OK):**
```json
{
  "run": {
    "reconstruction_run_id": "rec_run_9z8y7x",
    "detection_run_id": "det_run_1a2b3c4d",
    "pipeline_id": "pipe_...",
    "dataset_id": "ds_a1b2c3d4e5f6",
    "configuration_version": 1,
    "status": "completed",
    "start_time": "2026-10-25T16:00:00.000000Z",
    "completion_time": "2026-10-25T16:00:00.050000Z",
    "summary": {
      "total_evaluated": 4,
      "measured_count": 0,
      "estimated_count": 0,
      "corrected_count": 3,
      "unresolved_count": 1,
      "average_confidence": 76.5,
      "anomalies_reconstructed_count": 3,
      "by_sensor": { "temperature_bearing_c": { "CORRECTED": 2, "UNRESOLVED": 0 } },
      "by_method": { "linear_interpolation": 3 }
    },
    "errors": [],
    "warnings": []
  },
  "sample_results": [ /* First 5 ReconstructionRecord objects */ ]
}
```

### `GET /api/reconstruction/runs`
Lists historical reconstruction runs.
* **Query Params:** `pipeline_id`, `detection_run_id`, `limit` (default 50), `offset` (default 0)
* **Response (HTTP 200 OK):** `{ "runs": [ ... ], "total": N }`

### `GET /api/reconstruction/runs/{reconstruction_run_id}`
Returns metadata and summary for a single reconstruction run.

### `GET /api/reconstruction/runs/{reconstruction_run_id}/results`
Returns paginated individual reconstruction records.
* **Query Params:** `sensor_column`, `status`, `limit` (default 50), `offset` (default 0)
* **Response (HTTP 200 OK):**
```json
{
  "reconstruction_run_id": "rec_run_9z8y7x",
  "detection_run_id": "det_run_1a2b3c4d",
  "pipeline_id": "pipe_...",
  "dataset_id": "ds_a1b2c3d4e5f6",
  "summary": { /* ReconstructionSummary */ },
  "total_results": 4,
  "results": [
    {
      "result_id": "rec_res_3c4d5e",
      "reconstruction_run_id": "rec_run_9z8y7x",
      "detection_run_id": "det_run_1a2b3c4d",
      "anomaly_id": "anom_7f8e9d",
      "dataset_id": "ds_a1b2c3d4e5f6",
      "configuration_id": "pipe_...",
      "sensor_column": "temperature_bearing_c",
      "source_row_index": 12,
      "timestamp": "2026-01-01T00:12:00",
      "original_value": 92.5,
      "proposed_value": 52.35,
      "final_value": 52.35,
      "method": "linear_interpolation",
      "status": "CORRECTED",
      "confidence_score": 88.0,
      "confidence_breakdown": {
        "neighbor_count_score": 25.0,
        "method_agreement_score": 20.0,
        "temporal_proximity_score": 18.0,
        "local_variance_score": 15.0,
        "neighbor_cleanliness_score": 10.0,
        "cross_sensor_score": 0.0,
        "total_score": 88.0,
        "penalty_reasons": []
      },
      "evidence_summary": "Interpolated from valid bracket neighbors at row 11 (52.3 °C) and row 13 (52.4 °C)",
      "evidence_references": [
        {
          "source_row_index": 11,
          "timestamp": "2026-01-01T00:11:00",
          "sensor_column": "temperature_bearing_c",
          "value": 52.3,
          "distance": 1.0,
          "weight": 0.5,
          "is_anomaly": false
        },
        {
          "source_row_index": 13,
          "timestamp": "2026-01-01T00:13:00",
          "sensor_column": "temperature_bearing_c",
          "value": 52.4,
          "distance": 1.0,
          "weight": 0.5,
          "is_anomaly": false
        }
      ],
      "abstention_reason": null,
      "is_reviewed": false,
      "reviewed_by": null,
      "review_decision": null,
      "review_comment": null,
      "reviewed_at": null,
      "created_at": "2026-10-25T16:00:00.050000Z"
    }
  ],
  "limit": 50,
  "offset": 0
}
```

### `GET /api/reconstruction/results/{result_id}`
Returns a single reconstruction record by ID.

### `POST /api/reconstruction/results/{result_id}/review`
Records an explicit human operator review decision (`ACCEPT`, `REJECT`, or `MODIFY`).
* **Request:**
```json
{
  "decision": "ACCEPT",
  "modified_value": null,
  "reviewer_name": "Operator_JVR",
  "review_comment": "Approved during turbine bench calibration"
}
```
* **Response (HTTP 200 OK):** Updated `ReconstructionRecord` with `is_reviewed: true`.

---

## 7. Controlled Evaluation & Benchmarking

### `POST /api/evaluations`
Executes Mode A (controlled synthetic fault benchmark) or Mode B (unlabeled consistency evaluation).
* **Request (Mode A):**
```json
{
  "evaluation_mode": "mode_a_benchmark",
  "dataset_id": "ds_a1b2c3d4e5f6",
  "pipeline_id": "pipe_...",
  "seed": 42,
  "fault_types": ["spike", "drift", "gap", "frozen"],
  "fault_rate": 0.05
}
```
* **Response (HTTP 201 Created):** Full `EvaluationRun` object including precision, recall, F1, MAE, RMSE, and confusion matrix.

### `GET /api/evaluations/{evaluation_id}`
Retrieves metadata and results for an evaluation run.

### `GET /api/evaluations/{evaluation_id}/metrics`
Returns quantitative performance metrics. If ground truth is absent, returns `null` with explanatory definitions rather than zero.

### `GET /api/evaluations/{evaluation_id}/manifest`
Retrieves injected synthetic ground-truth manifest for Mode A runs.

---

## 8. Audit Trail & Cryptographic Verification

### `GET /api/audit/events`
Lists chronological audit events (latest first).
* **Query Params:** `dataset_id`, `pipeline_id`, `run_id`, `event_type`, `limit` (default 50), `offset` (default 0)
* **Response (HTTP 200 OK):** `{ "events": [ ... ], "total": N }`

### `POST /api/audit/verify`
Recomputes SHA-256 digests across the entire append-only hash chain from genesis to latest event.
* **Response (HTTP 200 OK):**
```json
{
  "is_valid": true,
  "total_events_checked": 24,
  "genesis_hash": "0000000000000000000000000000000000000000000000000000000000000000",
  "latest_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "errors": [],
  "verified_at": "2026-10-25T16:00:00.000000Z",
  "limitations": [
    "Hash chains detect post-hoc alterations within normal application access.",
    "Local file storage cannot prevent an administrator with direct filesystem write access from recomputing the entire chain.",
    "This cryptographic verification checks internal ledger consistency, not legal compliance or hardware-enforced immutability.",
    "Internal chain verification cannot, by itself, detect truncation or deletion of the newest valid ledger suffix without an external checkpoint.",
    "No external third-party trust anchor or hardware security module (HSM) is configured in this deployment."
  ]
}
```

### `GET /api/audit/export`
Exports audit ledger in `jsonl` or `csv` format.
* **Query Params:** `format` (`jsonl` or `csv`), `limit` (max 10,000)
* **Response (HTTP 200 OK):** Binary download attachment (`Content-Disposition: attachment; filename="kintsugi_audit_export_*.csv"`).

---

*Specification verified against `backend/app/schemas/` and `backend/app/api/routes/`.*
