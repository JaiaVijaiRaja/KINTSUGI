# KINTSUGI — Confidence-Aware Self-Healing Data Pipeline

> **Phase 5: Real Industrial Sensor Anomaly Detection Engine**

KINTSUGI is a confidence-aware, self-healing industrial data pipeline designed to ingest noisy multi-sensor telemetry, detect quality anomalies, reconstruct damaged signals with contextual confidence scores, and preserve original measurements in an auditable ledger.

Like the Japanese art of *Kintsugi* (repairing broken ceramics with gold lacquer), KINTSUGI treats signal repairs with complete transparency: **raw measured telemetry is never overwritten or discarded**. Proposed reconstructions carry evidence-based confidence scores, and when evidence is insufficient, the system strictly abstains by marking values as `UNRESOLVED` rather than guessing.

---

## Architecture at a Glance

* **Frontend**: React 19 + TypeScript + Vite 8 + Tailwind CSS v4 + Lucide Icons
* **Client Routing**: Zero-dependency HTML5 History router (`useRouter`, `Link`) supporting direct navigation, browser Back/Forward, automatic `/` to `/overview` redirect, and 404 Not Found handling.
* **Backend**: Python 3.14 + FastAPI + Pydantic v2 + Pandas + Scikit-Learn + Uvicorn
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
  * `POST /api/pipelines/{pipeline_id}/run` — Execute real detection run on stored sensor dataset.
  * `GET /api/pipelines/{pipeline_id}/runs/{run_id}` — Retrieve detection run status and summary counts.
  * `GET /api/pipelines/{pipeline_id}/runs/{run_id}/results` — Retrieve persisted anomaly records for a run.
  * `GET /api/anomalies` — Query and filter detected anomaly records across runs.
  * `GET /api/anomalies/{anomaly_id}` — Lookup individual anomaly record details.
* **Testing**: 57 automated Pytest test cases • Strict TypeScript type checking & Vite production build
* **Design Philosophy**: Deep slate palette, emerald/amber accents, accessible focus states, atomic persistence, zero fabricated metrics.

For an in-depth breakdown of system architecture, data quality rules, and API contracts, see [ARCHITECTURE.md](ARCHITECTURE.md).

---

## Eight Application Routes

| Route | Module Name | Current Status | Milestone |
| :--- | :--- | :--- | :--- |
| `/overview` | System Overview | **Implemented** | Phase 1 & 2 Shell |
| `/datasets` | Dataset Management | **Live Operational** (CSV upload, catalog, data quality audit, real row preview) | Phase 3 Core Feature |
| `/pipeline` | Pipeline Configuration | **Live Operational** (Dataset selector, column mapping, detection settings, reconstruction policies, backend validation, persistent configuration management) | Phase 4 Core Feature |
| `/anomalies` | Anomaly Explorer | **Live Operational** (Real execution engine, rolling MAD, Isolation Forest, consensus aggregation, interactive SVG time-series visualizer, anomaly records table, per-detector inspector) | Phase 5 Core Feature |
| `/reconstruction` | Reconstruction Studio | **Implemented Shell** (Deep dive on 4 statuses, dual-trace comparison spec, records empty state) | Phase 6 Target |
| `/audit` | Audit Trail | **Implemented Shell** (Cryptographic lineage concept, filter interface, ledger empty state) | Phase 6 Target |
| `/evaluation` | Evaluation Center | **Implemented Shell** (Planned benchmark metrics: F1, RMSE, MAE, calibration, empty state) | Phase 6 Target |
| `/settings` | Settings & System Info | **Implemented** (Safe runtime info, API diagnostics, interactive docs links) | Phase 2 Shell |

---

## Real Sensor Anomaly Detection Engine (Phase 5)

### 1. Supported Detectors & Detection Algorithms

#### A. Robust Statistical Anomaly Detection (Rolling Median & MAD)
* **Algorithm**: For each sensor channel $x$, evaluates the trailing window $W_i = [x_{\max(0, i - w + 1)}, \dots, x_i]$ of size $w$ (`window_size`).
* **Rolling Baseline**: Calculates the trailing median $\tilde{x}_i = \text{median}(W_i)$.
* **Dispersion Metric**: Median Absolute Deviation $\text{MAD}_i = \text{median}(|W_i - \tilde{x}_i|)$.
* **Outlier Threshold**: An observation is flagged if $|x_i - \tilde{x}_i| > T_{\text{MAD}} \times \text{MAD}_i$.
* **Self-Participation & Robustness**: The current observation participates in the localized window baseline. Because the median and MAD have a 50% breakdown point, transient single-point spikes cannot corrupt or distort the baseline.
* **Zero-MAD & Constant Signal Handling**: In physical industrial telemetry, sensors frequently dwell at steady-state values (e.g. constant $50.0^\circ\text{C}$). When over 50% of the window is identical, MAD evaluates to $0.0$:
  * If $|x_i - \tilde{x}_i| \le 10^{-9}$, the observation is marked **nominal** (`flagged=False`, `score=0.0`), preventing false-positive cascades across flatline telemetry.
  * If the point deviates from a zero-MAD baseline, it is safely flagged with a sentinel `score=999.0` avoiding division by zero.
* **Edge Windows & Missing Data**:
  * If valid finite historical samples in $W_i < \text{min\_observations}$, the detector abstains from flagging the observation and documents insufficient history.
  * Missing (NaN) and non-finite ($\pm\infty$) samples are never silently replaced; they are preserved as-is and documented as unassessed non-finite observations.

#### B. Multivariate Isolation Forest (`scikit-learn`)
* **Algorithm**: Fits an ensemble of extremely randomized isolation trees over configured numeric sensor channels. Outliers require significantly fewer recursive splits to isolate than nominal points.
* **Reproducibility**: Explicitly seeds `random_state` with `random_seed` for deterministic results across identical configurations and data.
* **Row-Index Preservation**: Excludes rows containing missing or non-finite values from model fitting, while retaining a strict index map back to original CSV row positions (`source_row_index`).
* **Minimum Usable Observations**: Enforces `min_observations` threshold. If usable finite samples are insufficient, Isolation Forest safely declines to fit and emits a clear diagnostic warning.
* **Zero-Variance Safeguard**: Bypasses tree training with an advisory warning if sensor telemetry exhibits zero variance across all dimensions.

---

### 2. Explicit Detector Aggregation & Severity Policy

Each enabled detector evaluates observations independently. Their individual scores, baselines, and reasons are permanently retained in `detector_details`.

* **Consensus Classification**:
  * `MULTI_DETECTOR`: Both Statistical MAD and Isolation Forest flagged the observation.
  * `SINGLE_DETECTOR`: Exactly one detector flagged the observation.
* **Documented Severity Rubric**:
  * `CRITICAL`: Multi-detector consensus with extreme deviation ($>2.0\times$ MAD threshold or IF score $< -0.15$).
  * `HIGH`: Any multi-detector consensus, or single-detector flag with extreme deviation.
  * `MEDIUM`: Single-detector flag at standard threshold margins.
  * `LOW`: Borderline single-detector flag near threshold boundary.
* **Mathematical Suspicion vs Fault Disclaimer**:
  * Detector agreement indicates corroborating mathematical suspicion across localized dispersion and tree partitioning; **it does NOT constitute physical proof of a hardware fault**.
  * Detector scores are algorithm-specific distance/isolation metrics, **not calibrated fault probabilities**.

---

### 3. Detection Run Persistence

Detection runs and anomaly records are atomically persisted in isolated filesystem directories:

```
backend/storage/
├── datasets/
│   └── ds_79122c0f0d41/
│       ├── data.csv                 # Raw unmodified CSV file (IMMUTABLE)
│       ├── metadata.json            # Dataset catalog metadata
│       └── quality.json             # Computed data quality audit
├── pipelines/
│   └── pipe_b147584b47e0.json       # Saved pipeline configuration (v1, v2...)
└── runs/
    └── run_a7c8e219fb04/
        ├── run.json                 # Run metadata, parameters, status, summary, warnings
        └── anomalies.json           # Persisted anomaly records list
```

* **Data Preservation**: The original dataset CSV (`data.csv`) is strictly read-only and never modified.
* **Atomic Writes**: Written to `.tmp` files and committed via atomic `os.replace` to prevent race conditions.

---

## Verification & Test Execution

### Backend Automated Test Suite
```powershell
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```
All **57 test cases** pass with zero failures:
* 17 dataset ingestion and quality audit tests (`test_datasets.py`)
* 3 operational health, CORS, and 404 tests (`test_health.py`)
* 16 pipeline configuration and validation tests (`test_pipelines.py`)
* 1 end-to-end Phase 4 workflow verification test (`test_phase4_workflow.py`)
* **20 Phase 5 anomaly detection tests (`test_detection.py`)**:
  1. Clear isolated impulse spike detection
  2. Nominal series with zero false positives
  3. Constant-valued sensor data (zero division protection)
  4. Missing values (NaN) handling without silent replacement
  5. Non-finite values (Inf / -Inf) graceful handling
  6. Insufficient observations (< min_observations)
  7. Zero-MAD baseline deviation detection
  8. Rolling window boundary behavior
  9. Isolation Forest reproducibility across identical runs
  10. Insufficient data handling for Isolation Forest
  11. Source row index preservation across missing value filtering
  12. Multi-sensor concurrent channel detection
  13. Detector aggregation, consensus, and disagreement
  14. Invalid configuration rejection (422)
  15. Unknown dataset and configuration IDs (404)
  16. Detection run file persistence and API retrieval
  17. Partial detector failure handling with diagnostic warnings
  18. Cryptographic hash verification of raw dataset preservation
  19. Accurate summary counts and sensor breakdown matching
  20. Global anomalies catalog filtering and individual record lookup

### Frontend Typecheck & Production Build
```powershell
cd frontend
npm run build
```
Vite production build and TypeScript compilation complete cleanly with zero errors in < 300ms.

---

## Known Limitations

1. **Detection Phase Only**: Phase 5 detects and records suspicious observations only. It does not perform signal repair, interpolation, cross-sensor correction, or assign reconstruction confidence scores (reserved for Phase 6).
2. **Synchronous Execution for MVP**: Runs execute synchronously on FastAPI worker threads for datasets up to 500,000 samples. Background workers (Celery/RQ) are reserved for distributed enterprise deployments.
3. **Finite Scalar Requirement**: Statistical MAD requires finite numeric scalars; rows containing non-finite values are excluded from dispersion computation and recorded as unassessed observations.

---

## Instructions to Reproduce a Real Detection Run

1. **Start Backend Service**:
   ```powershell
   cd backend
   .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
2. **Start Frontend Dev Server**:
   ```powershell
   cd frontend
   npm run dev
   ```
3. **Execute Full User Workflow**:
   * Navigate to `http://localhost:5173/datasets` and upload `backend/samples/industrial_telemetry_sample.csv`.
   * Navigate to `/pipeline`, configure sensor channels (e.g. `vibration_x_axis`, `bearing_temperature_c`), enable Statistical MAD and Isolation Forest, and click **Save Pipeline Configuration**.
   * Navigate to `/anomalies` (Anomaly Explorer), select your saved pipeline from the dropdown, and click **Run Real Detection**.
   * Inspect the rendered SVG time-series graph with interactive anomaly markers, filter by sensor or detector, and click **Inspect** on any row to view full algorithmic diagnostics.
