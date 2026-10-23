# KINTSUGI — System Architecture & Design Boundaries

## 1. System Overview

**KINTSUGI** (Confidence-Aware, Self-Healing Industrial Data Pipeline) is an industrial telemetry pipeline designed to ingest noisy, intermittent, or corrupted multi-sensor data, detect quality anomalies, reconstruct damaged signals using contextual machine learning and physics-informed models, assign evidence-based confidence scores to all proposed repairs, and preserve original un-altered sensor measurements in an immutable audit ledger.

The project takes its name from *Kintsugi* (金継ぎ), the traditional Japanese art of repairing broken pottery with lacquer dusted with powdered gold—treating flaws and repairs with full transparency and historical fidelity rather than concealing them.

---

## 2. Core Architectural Invariants

### 1. Preservation of Original Readings
Original measured sensor values (`rawMeasuredValue`) are permanently retained and NEVER overwritten, mutated, or deleted. All downstream consumers can inspect both the raw reading and the healed signal simultaneously. In Phase 4 configuration management, `preserve_original_readings` is enforced as an immutable invariant (`True`). Configurations attempting to disable original reading retention are strictly rejected.

### 2. The Four Processing Statuses
Every telemetry data point evaluated by the pipeline is categorized into one of four mutually exclusive, strictly defined processing statuses:

| Status | Code | Meaning | Downstream Action |
| :--- | :--- | :--- | :--- |
| **MEASURED** | `01_RAW` | Original unmodified physical sensor reading. Verified within nominal operating boundaries. | Passed to downstream operational telemetry as trusted truth. |
| **ESTIMATED** | `02_PROP` | Candidate repaired value generated via contextual time-series or multivariate model imputation. | Internal intermediate proposal; pending confidence verification. |
| **CORRECTED** | `03_VERIF` | High-confidence validated repair. The candidate repair exceeds the required policy confidence threshold (e.g. $\ge 0.80$). | Approved for downstream control loops, labeled with repair metadata. |
| **UNRESOLVED** | `04_ABST` | Insufficient contextual evidence or corrupted neighboring channels. The system strictly **abstains from guessing**. | Flagged for operator review; safety interlocks alerted; no fabricated precision. |

### 3. Strict Requirement to Abstain
When evidence is ambiguous, sensor correlation is degraded, or uncertainty margins exceed permissible thresholds, the pipeline **MUST abstain**. Fabricating synthetic accuracy where none exists is prohibited.

---

## 3. Scope: Implemented vs. Planned Features

### Implemented in Phase 1, Phase 2, Phase 3 & Phase 4
* **Application Shell & Navigation**: Complete 8-route single-page application shell (`/overview`, `/datasets`, `/pipeline`, `/anomalies`, `/reconstruction`, `/audit`, `/evaluation`, `/settings`).
* **Zero-Dependency History Router**: Lightweight HTML5 History API client router supporting direct browser URL navigation, browser Back/Forward, automatic `/` to `/overview` redirect, and 404 Not Found handling.
* **Verified Backend Health Contract**: Live `GET /api/health` endpoint returning operational status, service identifier, API version, environment, and ISO-8601 UTC server timestamp with roundtrip latency tracking.
* **Strict CORS Whitelisting**: Explicit origin restriction allowing only `http://localhost:5173` and `http://127.0.0.1:5173`.
* **Dataset Ingestion Engine (Phase 3 Core Feature)**:
  * Multipart file upload (`POST /api/datasets/upload`) for CSV telemetry streams.
  * Multi-encoding support (`utf-8-sig`, `utf-8`, `latin-1`).
  * Strict validation against empty files, invalid extensions, header-only datasets, duplicate column names, empty column names, and mismatched row lengths.
  * Server-controlled isolated storage paths (`ds_{uuid}`) preventing path traversal.
  * Configurable upload size limits (50 MB default), max row count (500,000), and max column count (200).
* **Genuine Data Quality Audit (Phase 3 Core Feature)**:
  * Exact total row and column counts.
  * Full row duplicate detection count and percentage.
  * Total missing cells count and overall missing percentage.
  * Per-column metrics: detected data type (`float`, `integer`, `string`, `datetime`, `boolean`), missing count, missing percentage, unique values count.
  * Descriptive statistics for numeric sensor channels: `min`, `max`, `mean`, `median`, `std`, `q25`, `q75`.
  * Conservative timestamp candidate analysis: identifies timestamp channels, computes parseability %, evaluates duplicate timestamps, and verifies monotonic sequence progression.
* **Pipeline Configuration Engine (Phase 4 Core Feature)**:
  * Typed, versioned configuration data model (`PipelineConfig`, `PipelineConfigCreate`, `PipelineConfigUpdate`).
  * Live validation endpoint (`POST /api/pipelines/validate`) validating against actual dataset schema, column types, and data quality without side-effects.
  * Persistence endpoint (`POST /api/pipelines`) saving atomic configuration files in `storage/pipelines/` with server-controlled IDs (`pipe_{uuid}`).
  * Configuration listing (`GET /api/pipelines`) and single retrieval (`GET /api/pipelines/{id}`).
  * Versioned update endpoint (`PUT /api/pipelines/{id}`) incrementing `configuration_version` and re-validating.
  * Channel role assignment: single timestamp, one or more numeric sensors, and excluded channels.
  * Conflicting role detection: prevents column assigned to multiple conflicting roles.
  * Non-numeric sensor rejection: ensures sensor channels contain numeric data.
  * Statistical detector settings (rolling window, MAD threshold, min observations).
  * Isolation Forest detector settings (contamination fraction, random seed, min observations).
  * Reconstruction policy configuration (linear interpolation, max gap size, cross-sensor validation, immutable raw reading retention).
  * Confidence policy as decision logic (review threshold, human review requirement, corroborating sensor quorum).
  * Unsaved changes modal guard preventing accidental data loss during editing.
* **Automated Test Suite**:
  * 37 backend automated test cases covering valid upload, listing, metadata, preview, quality metrics, invalid extensions, empty files, malformed CSV, header-only CSV, missing IDs, oversized uploads, preview limits, unusual filenames, persistence, valid configuration validation, unknown dataset IDs, unknown columns, duplicate sensors, conflicting roles, invalid detection parameters, invalid reconstruction parameters, invalid confidence policy, successful creation, listing configurations, retrieving saved configurations, updating configurations, unknown configuration IDs, service restart persistence, validation side-effect isolation, non-numeric sensor rejection, and end-to-end integration workflow.

### Planned for Phase 5 (Anomaly Detection, Self-Healing & Ledger)
* Execution of Statistical and Isolation Forest detectors against configured pipelines.
* Signal reconstruction algorithms (linear interpolation, splines, multivariate regression).
* Contextual confidence score calculation (0.00–1.00) based on signal degradation and sensor correlation.
* Immutable append-only audit ledger with SHA-256 cryptographic chaining.
* Operator manual override workflow with mandatory rationale documentation.
* Controlled empirical benchmark evaluation against standard labeled datasets (IMS Bearing, SWaT).

---

## 4. Storage Architecture

```
backend/storage/
├── datasets/
│   └── ds_79122c0f0d41/                 # Server-generated dataset directory
│       ├── data.csv                     # Original unmodified raw CSV file
│       ├── metadata.json                # Ingestion metadata (filename, row count, column list)
│       └── quality.json                 # Calculated data quality report & column statistics
└── pipelines/
    ├── pipe_b147584b47e0.json           # Persisted pipeline configuration (v1, v2...)
    └── pipe_b147584b47e0.tmp            # Ephemeral file for atomic commit via os.replace
```

* **Separation of Storage**: Pipeline configurations are stored independently from uploaded dataset files in `storage/pipelines/`.
* **Atomic Writes**: Configurations are written to a temporary `.tmp` file, flushed to disk (`os.fsync`), and atomically committed using `os.replace`. This prevents corruption in the event of unexpected process termination.
* **Path Safety**: Directory and file identifiers are server-generated (`ds_` or `pipe_` followed by 12-character hex UUID). Client-supplied strings are never used in filesystem paths.
* **Git Isolation**: The `storage/` directory is strictly excluded by `.gitignore`.

---

## 5. Active & Planned API Contract

### Implemented & Live Endpoints

#### Health (`/api/health`)
* `GET /api/health` — Returns status, service ID, version, environment, and UTC timestamp.

#### Datasets (`/api/datasets`)
* `POST /api/datasets/upload` — Ingest CSV telemetry file via multipart/form-data. Returns `DatasetDetailResponse` (metadata + quality).
* `GET /api/datasets` — List cataloged datasets with row counts, column counts, and sizes.
* `GET /api/datasets/{dataset_id}` — Retrieve metadata for a specific dataset.
* `GET /api/datasets/{dataset_id}/preview?limit=50&offset=0` — Retrieve bounded row preview.
* `GET /api/datasets/{dataset_id}/quality` — Retrieve computed data quality summary.

#### Pipelines (`/api/pipelines`) — Phase 4 Core Feature
* `POST /api/pipelines/validate` — Validate configuration against target dataset schema and quality audit. Returns `PipelineValidationResponse` with structured errors and advisory warnings. Does NOT persist configuration or execute any pipeline.
* `POST /api/pipelines` — Create, validate, and persist a new pipeline configuration. Returns `PipelineConfig` (v1) with HTTP 201 Created.
* `GET /api/pipelines` — List all saved pipeline configurations from storage, sorted by `updated_at` descending.
* `GET /api/pipelines/{pipeline_id}` — Retrieve a specific configuration by ID. Returns HTTP 404 if not found.
* `PUT /api/pipelines/{pipeline_id}` — Validate updates against target dataset, increment `configuration_version`, update `updated_at`, and atomically persist. Returns updated `PipelineConfig`.

### Planned Endpoints (Phase 5)
* **Execution (`/api/pipelines/{id}/execute`)**:
  - `POST /api/pipelines/{id}/execute`
  - `GET /api/pipelines/runs`
  - `GET /api/pipelines/runs/{id}/status`
* **Anomalies (`/api/anomalies`)**:
  - `GET /api/anomalies`
  - `GET /api/anomalies/summary`
  - `GET /api/anomalies/timeseries`
* **Reconstruction (`/api/reconstruction`)**:
  - `GET /api/reconstruction/records`
  - `GET /api/reconstruction/summary`
  - `POST /api/reconstruction/override`
* **Audit Trail (`/api/audit`)**:
  - `GET /api/audit/records`
  - `GET /api/audit/verify/{id}`
  - `GET /api/audit/export`
* **Evaluation (`/api/evaluation`)**:
  - `GET /api/evaluation/benchmarks`
  - `POST /api/evaluation/run`
  - `GET /api/evaluation/results/{id}`

---

## 6. Pipeline Configuration Design & Validation Rules

### Configuration Data Model Schema
```typescript
interface PipelineConfig {
  configuration_id: string;             // Server-generated 'pipe_' + hex UUID
  configuration_name: string;           // 1 to 100 characters
  description?: string;                 // Max 500 characters
  dataset_id: string;                   // References valid dataset
  configuration_version: number;        // Revision counter (1, 2, ...)
  timestamp_column?: string | null;     // Datetime channel name or null
  sensor_columns: string[];             // At least 1 numeric column
  ignored_columns: string[];            // Excluded columns
  detection_settings: {
    statistical: {
      enabled: boolean;
      window_size: number;              // 5 to 500 samples
      mad_threshold: number;            // 1.0 to 10.0 multiples of MAD
      min_observations: number;         // 5 to 100 samples
    };
    isolation_forest: {
      enabled: boolean;
      contamination: number;            // 0.001 to 0.500 (0.1% to 50%)
      random_seed: number;              // Integer seed
      min_observations: number;         // 10 to 1000 samples
    };
  };
  reconstruction_settings: {
    allow_linear_interpolation: boolean;
    max_gap_size: number;               // 1 to 100 samples
    require_cross_sensor_validation: boolean;
    preserve_original_readings: boolean;// Enforced True
    allow_automatic_correction: boolean;
    fallback_behavior: 'abstain_unresolved' | 'flag_only';
  };
  confidence_policy: {
    review_threshold: number;           // 0.00 to 1.00
    human_review_required: boolean;
    min_evidence_sensors: number;       // 0 to 20
    unjustified_behavior: 'abstain_unresolved' | 'retain_raw';
  };
  created_at: string;                   // ISO-8601 UTC
  updated_at: string;                   // ISO-8601 UTC
}
```

### Validation Rules Summary
1. **Target Dataset Verification**: Dataset must exist; unknown dataset ID returns HTTP 404.
2. **Column Existence**: All assigned columns (`timestamp_column`, `sensor_columns`, `ignored_columns`) must exist in dataset metadata.
3. **Sensor Numeric Requirement**: Sensor columns must have detected numeric types (`float` or `integer`). Non-numeric sensor assignments produce blocking validation errors.
4. **No Conflicting Roles**: A column cannot be assigned to more than one role (e.g. timestamp and sensor, or sensor and ignored).
5. **Duplicate Assignments**: Assigning the same sensor column multiple times produces validation errors.
6. **Sensor Selection Count**: At least one sensor column must be mapped.
7. **Preservation Invariant**: `preserve_original_readings` must be `True`.
8. **Bounded Numerical Ranges**: Window sizes, thresholds, contamination fractions, and observation limits are validated against strict mathematical boundaries.
9. **Contextual Quality Warnings**: Non-monotonic timestamps, duplicate timestamps, missing cells in sensor columns, and single-sensor cross-validation quorums generate advisory warnings without blocking valid configurations.

### Distinction: Configuration vs. Execution
KINTSUGI strictly decouples configuration management from pipeline execution. Phase 4 provides complete lifecycle management for pipeline specifications. No machine learning models are fit, no time series are interpolated, and no synthetic metrics are produced during configuration saving or validation. Execution engines are scheduled for Phase 5.

### Current Limitations
* **Local Filesystem Persistence**: Configurations are stored as individual JSON documents on local disk.
* **No Pipeline Execution**: Run endpoints (`POST /api/pipelines/{id}/execute`) return HTTP 501 until Phase 5.
* **Static Schema Verification**: Configuration is validated against the static dataset schema at the time of validation; if the underlying dataset is deleted, configurations referencing it will fail validation upon subsequent editing.
