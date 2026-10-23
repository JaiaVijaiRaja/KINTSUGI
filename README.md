# KINTSUGI — Confidence-Aware Self-Healing Data Pipeline

> **Phase 4: Pipeline Configuration Engine**

KINTSUGI is a confidence-aware, self-healing industrial data pipeline designed to ingest noisy multi-sensor telemetry, detect quality anomalies, reconstruct damaged signals with contextual confidence scores, and preserve original measurements in an auditable ledger.

Like the Japanese art of *Kintsugi* (repairing broken ceramics with gold lacquer), KINTSUGI treats signal repairs with complete transparency: **raw measured telemetry is never overwritten or discarded**. Proposed reconstructions carry evidence-based confidence scores, and when evidence is insufficient, the system strictly abstains by marking values as `UNRESOLVED` rather than guessing.

---

## Architecture at a Glance

* **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Lucide Icons
* **Client Routing**: Zero-dependency HTML5 History router (`useRouter`, `Link`) supporting direct navigation, browser Back/Forward, automatic `/` to `/overview` redirect, and 404 Not Found handling.
* **Backend**: Python 3.14 + FastAPI + Pydantic v2 + Pandas + Uvicorn
* **API Endpoints**:
  * `GET /api/health` — Operational health check with latency tracking.
  * `POST /api/datasets/upload` — Multipart/form-data ingestion, validation, and quality audit.
  * `GET /api/datasets` — Catalog of registered datasets with metadata.
  * `GET /api/datasets/{dataset_id}` — Dataset metadata and schema.
  * `GET /api/datasets/{dataset_id}/preview` — Bounded tabular row preview.
  * `GET /api/datasets/{dataset_id}/quality` — Comprehensive calculated data quality report.
  * `POST /api/pipelines/validate` — Validate configuration against target dataset (no side-effects).
  * `POST /api/pipelines` — Create and persist a validated pipeline configuration.
  * `GET /api/pipelines` — Catalog of saved pipeline configurations.
  * `GET /api/pipelines/{pipeline_id}` — Retrieve a specific pipeline configuration.
  * `PUT /api/pipelines/{pipeline_id}` — Update configuration with validation and version increment.
* **Testing**: 37 automated Pytest test cases • Strict TypeScript type checking & Vite production build
* **Design Philosophy**: Deep slate palette, gold/amber accents, accessible focus states, unsaved changes modal guard, atomic file persistence, zero fabricated metrics.

For an in-depth breakdown of system architecture, data quality rules, and API contracts, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Eight Application Routes

| Route | Module Name | Current Status | Milestone |
| :--- | :--- | :--- | :--- |
| `/overview` | System Overview | **Implemented** | Phase 1 & 2 Shell |
| `/datasets` | Dataset Management | **Live Operational** (CSV upload, catalog, data quality audit, real row preview) | Phase 3 Core Feature |
| `/pipeline` | Pipeline Configuration | **Live Operational** (Dataset selector, column mapping, detection settings, reconstruction policies, backend validation, persistent configuration management) | Phase 4 Core Feature |
| `/anomalies` | Anomaly Explorer | **Implemented Shell** (Query filters concept, visualization canvas standby, records table) | Phase 5 Target |
| `/reconstruction` | Reconstruction Studio | **Implemented Shell** (Deep dive on 4 statuses, dual-trace comparison spec, records empty state) | Phase 5 Target |
| `/audit` | Audit Trail | **Implemented Shell** (Cryptographic lineage concept, filter interface, ledger empty state) | Phase 5 Target |
| `/evaluation` | Evaluation Center | **Implemented Shell** (Planned benchmark metrics: F1, RMSE, MAE, calibration, empty state) | Phase 5 Target |
| `/settings` | Settings & System Info | **Implemented** (Safe runtime info, API diagnostics, interactive docs links) | Phase 2 Shell |

---

## Pipeline Configuration Architecture (Phase 4)

### 1. Configuration Data Model
The configuration model is strictly typed and versioned:
* `configuration_id`: Server-controlled unique identifier (`pipe_` + 12-char hex UUID).
* `configuration_name`: Human-readable identifier (1–100 characters).
* `description`: Optional user rationale and context.
* `dataset_id`: Foreign reference to an existing ingested dataset (`ds_` identifier).
* `configuration_version`: Integer tracking revisions (starts at 1, increments on `PUT` update).
* `timestamp_column`: Optional string referencing an actual datetime/temporal column in the dataset.
* `sensor_columns`: List of one or more numeric column names for signal monitoring.
* `ignored_columns`: List of column names excluded from processing.
* `detection_settings`: Bounded settings for Statistical and Isolation Forest anomaly detectors.
* `reconstruction_settings`: Policies governing internal gap interpolation, cross-sensor validation, and invariant retention of original readings.
* `confidence_policy`: Decision threshold, human-review triggers, and minimum corroborating evidence quorums.
* `created_at` / `updated_at`: ISO-8601 UTC server timestamps.

### 2. Supported Column Roles & Rules
* **Timestamp**: Optional single datetime channel. If missing, the dataset is evaluated as unordered static samples and time-based rolling window detection is disabled.
* **Sensor**: One or more numeric channels (`float` or `integer`). Non-numeric columns are strictly rejected with validation errors.
* **Ignored**: Excluded channels passed through without anomaly inspection or imputation.
* **Conflicting Roles**: A column cannot be assigned to conflicting roles simultaneously (e.g., both sensor and timestamp, or both sensor and ignored).
* **Missing Value Warnings**: Mapped sensor columns with missing cells produce advisory warnings regarding necessary reconstruction policy coverage.

### 3. Detection Settings
* **Statistical Detector (Z-Score / MAD)**:
  * `enabled`: Boolean toggle.
  * `window_size`: Rolling window size (5 to 500 samples, default 30).
  * `mad_threshold`: Multiples of Median Absolute Deviation (1.0 to 10.0, default 3.5).
  * `min_observations`: Minimum valid samples required before bounds computation (5 to 100, default 10).
* **Isolation Forest**:
  * `enabled`: Boolean toggle.
  * `contamination`: Expected anomaly fraction across feature space (0.001 to 0.500, default 0.050 / 5.0%).
  * `random_seed`: Deterministic integer for reproducible tree ensembles (default 42).
  * `min_observations`: Minimum rows needed for fitting trees (10 to 1000, default 50).

### 4. Reconstruction Settings & Core Invariants
* `preserve_original_readings`: **Strict Architectural Invariant**. Must be `True`. Raw physical measurements are never modified, overwritten, or discarded.
* `allow_linear_interpolation`: Permits piecewise linear interpolation for small internal gaps (default `True`).
* `max_gap_size`: Maximum consecutive missing samples allowed for interpolation (1 to 100, default 5).
* `require_cross_sensor_validation`: Requires correlation consensus from neighboring channels (default `True`).
* `allow_automatic_correction`: Promotion of high-confidence repairs without manual sign-off (default `False`).
* `fallback_behavior`: Action when signal repairs cannot be justified (`abstain_unresolved` [strict `UNRESOLVED`] or `flag_only`).

### 5. Confidence Policy as Decision Logic
The confidence threshold is an operational decision policy cutoff, not a calibrated probability.
* `review_threshold`: Threshold between 0.00 and 1.00 (default 0.80). Repairs scoring below this threshold are routed to human review or strictly marked `UNRESOLVED`.
* `human_review_required`: Mandates operator sign-off before committing repairs (default `True`).
* `min_evidence_sensors`: Minimum corroborating channels required for multi-sensor quorum (default 1).
* `unjustified_behavior`: Fallback action (`abstain_unresolved` or `retain_raw`).

### 6. Distinction: Configuring vs. Executing a Pipeline
Phase 4 implements configuration management and schema validation only. **Saving or validating a configuration does NOT execute anomaly detection, fit models, impute signals, or generate synthetic outputs.** Pipeline execution is reserved for Phase 5.

---

## Prerequisites

* **Python**: 3.10 or newer (tested with Python 3.14)
* **Node.js**: v18 or newer (tested with Node.js v25)
* **npm**: v9 or newer (tested with npm v11)

---

## Quickstart Guide

### 1. Backend Setup & Run

1. Open a terminal and navigate to the project root:
   ```powershell
   cd "c:\WORK LAB-SL19\Workstation\MY PROJECT\ANTIGRAVITY\HORIZONXT26"
   ```

2. Activate the Python virtual environment:
   ```powershell
   .\backend\.venv\Scripts\Activate.ps1
   ```

3. Install backend dependencies:
   ```powershell
   pip install -r backend\requirements.txt
   ```

4. Run backend unit tests:
   ```powershell
   .\backend\.venv\Scripts\pytest.exe backend\tests -v
   ```

5. Start the FastAPI development server:
   ```powershell
   .\backend\.venv\Scripts\uvicorn.exe app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload
   ```

   The backend will be live at `http://127.0.0.1:8000`.
   * Interactive Swagger Documentation: `http://127.0.0.1:8000/docs`
   * ReDoc Documentation: `http://127.0.0.1:8000/redoc`
   * Health Endpoint: `http://127.0.0.1:8000/api/health`

---

### 2. Frontend Setup & Run

1. Open a second terminal and navigate to `frontend/`:
   ```powershell
   cd "c:\WORK LAB-SL19\Workstation\MY PROJECT\ANTIGRAVITY\HORIZONXT26\frontend"
   ```

2. Install dependencies:
   ```powershell
   npm install
   ```

3. Verify TypeScript type checking and production build:
   ```powershell
   npm run build
   ```

4. Start the Vite development server:
   ```powershell
   npm run dev
   ```

   Open your browser at `http://localhost:5173`.

---

## Testing Complete Pipeline Configuration Workflow

1. Open `http://localhost:5173/datasets` and upload the sample telemetry file if not already loaded:
   ```
   backend/samples/industrial_telemetry_sample.csv
   ```
2. Navigate to `http://localhost:5173/pipeline`.
3. **Select Dataset**: The uploaded CSV appears in the dataset selector. Select it to review column count, row count, and missing cell statistics.
4. **Map Channels**: Click **Auto-Map Suggested** or assign individual columns:
   * Map `timestamp` as the Timestamp channel.
   * Map `vibration_drive_end_g`, `vibration_non_drive_end_g`, `bearing_temperature_c`, `motor_current_amps`, `hydraulic_pressure_bar` as Sensor channels.
   * Map `machine_state` (string) as Exclude / Ignored.
5. **Adjust Policies**: Configure statistical window size (e.g. 15), MAD sensitivity (e.g. 3.5), Isolation Forest contamination (e.g. 5.0%), and review threshold (e.g. 0.80).
6. **Validate Configuration**: Click **Validate**. The backend runs validation against the dataset schema and displays any advisory warnings (e.g., missing cells in sample columns).
7. **Save Configuration**: Click **Save Configuration**. The server creates an atomic configuration file (`pipe_...json`) with version 1.
8. **Saved Drawer & Edit**: Click **Saved Configs** in the header. Select the saved configuration to load and edit. Adjust the threshold to 0.85 and click **Update (Save v2)**. The configuration version increments to version 2.

---

## Automated Verification & Testing

### Backend Unit Test Suite (37 Tests)
```powershell
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```
All 37 test cases pass:
* 17 dataset ingestion and quality audit tests
* 3 operational health, CORS, and 404 tests
* 16 pipeline configuration, validation, role conflict, persistence, and error tests
* 1 end-to-end integration workflow verification test

### Frontend Typecheck & Production Build
```powershell
cd frontend
npm run build
```
Vite production build and TypeScript compilation complete cleanly with zero errors.

---

## Persistence & Storage Architecture

```
backend/storage/
├── datasets/
│   └── ds_79122c0f0d41/
│       ├── data.csv                 # Raw unmodified CSV file
│       ├── metadata.json            # Dataset catalog metadata
│       └── quality.json             # Computed data quality audit
└── pipelines/
    └── pipe_b147584b47e0.json       # Persisted pipeline configuration (v1, v2...)
```

* **Separation of Concerns**: Pipeline configurations are stored independently from uploaded CSV data in `storage/pipelines/`.
* **Atomic Writes**: Configurations are written to `.tmp` files and committed via atomic `os.replace` to prevent partial or corrupted writes.
* **Server-Controlled Identifiers**: All identifiers (`pipe_` + hex UUID) are generated on the server; client-provided identifiers are never used as filesystem paths.
* **Storage Limitations**: Local JSON file storage is suited for single-node development and workstations. Multi-node clusters or enterprise deployments in future phases can substitute an operational database without changing the service interface.

---

## Development Roadmap

* [x] **Phase 1: Project Foundation & Architecture** (CORS, health check, initial layout, backend tests)
* [x] **Phase 2: Complete Application Shell & Structural Skeleton** (All 8 pages, History router, typed models, service boundaries, honest empty states)
* [x] **Phase 3: Sensor Dataset Ingestion & Data Quality Engine** (CSV upload, strict validation, pandas parsing, safe local storage, quality audit calculations, row preview)
* [x] **Phase 4: Pipeline Configuration Engine** (Dataset channel mapping, detection parameters, reconstruction policies, backend validation, atomic configuration persistence, versioning)
* [ ] **Phase 5: Anomaly Detection, Signal Reconstruction & Auditable Ledger** (Statistical detector execution, Isolation Forest, contextual imputation, confidence calibration, SHA-256 ledger)
