# KINTSUGI — Confidence-Aware Self-Healing Data Pipeline

> **Phase 6: Confidence-Aware Data Reconstruction Engine**

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
  * `GET /api/pipelines/{pipeline_id}/runs` — List historical detection runs for a pipeline.
  * `GET /api/pipelines/{pipeline_id}/runs/{run_id}` — Retrieve detection run status and summary counts.
  * `GET /api/pipelines/{pipeline_id}/runs/{run_id}/results` — Retrieve persisted anomaly records for a run.
  * `GET /api/anomalies` — Query and filter detected anomaly records across runs.
  * `GET /api/anomalies/{anomaly_id}` — Lookup individual anomaly record details.
  * `POST /api/pipelines/{pipeline_id}/runs/{detection_run_id}/reconstruct` — Execute confidence-aware signal reconstruction.
  * `GET /api/reconstruction/runs` — List historical reconstruction runs with optional filtering.
  * `GET /api/reconstruction/runs/{reconstruction_run_id}` — Retrieve reconstruction run status, summary metrics, and error logs.
  * `GET /api/reconstruction/runs/{reconstruction_run_id}/results` — Retrieve paginated reconstruction records with filtering by sensor and status.
  * `GET /api/reconstruction/results/{result_id}` — Retrieve single reconstruction record with evidence references and factor breakdown.
  * `POST /api/reconstruction/results/{result_id}/review` — Record operator human review decision (`ACCEPT`, `REJECT`, `MODIFY`).
* **Testing**: 82 automated Pytest test cases • Strict TypeScript type checking & Vite production build
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
| `/reconstruction` | Reconstruction Studio | **Live Operational** (Confidence-aware reconstruction engine, linear interpolation, local median, cross-sensor validation, evidence factor decomposition, status transitions, operator review ledger) | Phase 6 Core Feature |
| `/audit` | Audit Trail | **Implemented Shell** (Cryptographic lineage concept, filter interface, ledger empty state) | Phase 7 Target |
| `/evaluation` | Evaluation Center | **Implemented Shell** (Planned benchmark metrics: F1, RMSE, MAE, calibration, empty state) | Phase 7 Target |
| `/settings` | Settings & System Info | **Implemented** (Safe runtime info, API diagnostics, interactive docs links) | Phase 2 Shell |

---

## Confidence-Aware Data Reconstruction Engine (Phase 6)

### 1. Reconstruction Algorithms

#### A. Chronological Linear Interpolation
* **Chronological Ordering**: Respects timestamp progression or sequential row indices.
* **Strict Extrapolation Prohibition**: Reconstructs only when valid bounding observations exist on both sides. Extrapolating beyond available data is strictly prohibited and leads to explicit abstention.
* **Gap Limit Enforcement**: Reconstructs across missing or contiguous anomalous observations up to `max_gap_size`. Exceeding this limit triggers abstention as `UNRESOLVED`.
* **Timestamp Weighting & Duplicate Handling**: Uses exact temporal distance ($\Delta t$) between timestamps. When duplicate timestamps exist, deterministic midpoint ordering is applied.
* **Exclusion of Contaminated Neighbors**: Neighboring observations that are themselves unresolved anomalies are strictly excluded from bracket baselines.

#### B. Local Median Reconstruction
* **Localized Window**: Computes candidate baseline from valid observations within a configurable window $W = [i - w, i + w]$.
* **Target Observation Excluded**: The anomalous observation itself is excluded from candidate calculation.
* **Anomaly Neighbor Exclusion**: Unresolved flagged anomalies within the window are excluded from the reference set.
* **Quorum Enforcement**: Requires a minimum count of valid, non-anomalous neighbors (default $\ge 3$). If insufficient trusted neighbors exist, the algorithm declines to guess.

#### C. Cross-Sensor Empirical Validation
* **Strict Relationship Requirement**: Evaluates empirical Pearson correlation on nominal (non-anomalous) rows.
* **No Unverified Physical Assumptions**: If $|r| < 0.70$, the engine strictly disclaims any cross-sensor relationship (`has_relationship=False`).
* **Linear Regression & Residual Corroboration**: If $|r| \ge 0.70$, fits an empirical regression and computes residual dispersion $\sigma_{\text{res}}$. If candidate reconstruction deviates $> 3.5\sigma_{\text{res}}$, severe conflict is flagged and the candidate is rejected.

---

### 2. The Four Processing Statuses & Transition Rules

```
                      ┌──────────────────────────────────────┐
                      │  Detected Anomaly from Detection Run │
                      └──────────────────┬───────────────────┘
                                         │
                         ┌───────────────┴───────────────┐
                         ▼                               ▼
                 [ Insufficient /                [ Valid Evidence,
                 Conflicting Evidence ]          Gap Validated, Score Checked ]
                         │                               │
                         ▼                               ▼
                  ┌──────────────┐               ┌───────────────┐
                  │  UNRESOLVED  │               │   ESTIMATED   │
                  └──────────────┘               └───────┬───────┘
                         ▲                               │
                         │             ┌─────────────────┴─────────────────┐
                         │             ▼                                   ▼
             Operator    │     [ Human Review Req.                 [ Auto-Correction
             Rejection   │       or Operator Review ]                Permitted & Score Meets Thresh. ]
                         │             │                                   │
                         └─────────────┤                                   │
                                       ▼                                   ▼
                                ┌──────────────────────────────────────────────┐
                                │                  CORRECTED                   │
                                └──────────────────────────────────────────────┘
```

* **MEASURED**: Physical sensor reading preserved in its exact unaltered state.
* **ESTIMATED**: Contextual reconstruction proposal generated with evidence score; holding original reading pending human review.
* **CORRECTED**: High-confidence repair approved via automated policy threshold or operator review.
* **UNRESOLVED**: Low-confidence, broken gap, or contradictory evidence; system strictly abstains from guessing. Original value remains untouched.

---

### 3. Transparent Evidence-Based Confidence Scoring (0 to 100)

> [!IMPORTANT]
> The confidence score is an **evidence index** composed of documented factors. It is **NOT a calibrated statistical probability**.

| Factor | Point Range | Criteria |
| :--- | :--- | :--- |
| **Neighbor Density** | 0 to 25 | Scaled by available valid neighbors ($\min(N/8, 1.0) \times 25$). |
| **Method Concordance** | 0 to 25 | Agreement between Linear Interpolation and Local Median ($1.0 - \text{diff}/\text{baseline}$). |
| **Temporal Proximity** | 0 to 20 | Penalizes wide gaps or distant supporting brackets ($e^{-\text{gap}/3} \times 20$). |
| **Signal Stability** | 0 to 15 | Reward for localized signal stability ($\sigma_{\text{local}}/\mu_{\text{local}}$). |
| **Neighbor Cleanliness** | 0 to 15 | Ratio of non-anomalous neighbors to total inspected window neighbors. |
| **Cross-Sensor Impact** | -25 to +10 | +10 bonus for regression corroboration ($<2\sigma_{\text{res}}$); -25 penalty for severe conflict ($>3.5\sigma_{\text{res}}$). |
| **Structural Failures** | Override to 0.0 | Extrapolation violation, gap limit breach, or non-finite calculation overrides score to 0.0. |

---

### 4. Storage & Persistence Layout

```
backend/storage/
├── datasets/
│   └── ds_79122c0f0d41/
│       ├── data.csv                 # Raw unmodified CSV file (STRICTLY IMMUTABLE)
│       ├── metadata.json            # Dataset catalog metadata
│       └── quality.json             # Computed data quality audit
├── pipelines/
│   └── pipe_b147584b47e0.json       # Saved pipeline configuration (v1, v2...)
├── runs/
│   └── run_a7c8e219fb04/
│       ├── run.json                 # Detection run metadata & summary
│       └── anomalies.json           # Persisted anomaly records
└── reconstruction/
    └── rec_run_c21f0b48a192/
        ├── run.json                 # Reconstruction execution state & summary counts
        └── results.json             # Per-reading audit records, factor breakdown & review log
```

---

## Verification & Test Execution

### Backend Automated Test Suite
```powershell
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```
All **82 test cases** pass with zero failures:
* 17 dataset ingestion and quality audit tests (`test_datasets.py`)
* 3 operational health, CORS, and 404 tests (`test_health.py`)
* 16 pipeline configuration and validation tests (`test_pipelines.py`)
* 1 end-to-end Phase 4 workflow verification test (`test_phase4_workflow.py`)
* 20 Phase 5 anomaly detection tests (`test_detection.py`)
* 1 end-to-end Phase 5 workflow verification test (`test_phase5_workflow.py`)
* **23 Phase 6 reconstruction engine tests (`test_reconstruction.py`)**:
  1. Linear interpolation with valid surrounding observations
  2. Boundary extrapolation strictly prohibited
  3. Gap-limit enforcement
  4. Timestamp-weighted interpolation with actual $\Delta t$
  5. Deterministic duplicate timestamp handling
  6. Local median reconstruction
  7. Insufficient trusted neighbors handling
  8. Non-finite input values handling
  9. Anomaly neighbors excluded from trusted evidence
  10. Cross-sensor: no unjustified relationship claimed when $|r| < 0.70$
  11. Conflicting cross-sensor evidence causes abstention/penalty
  12. Complete confidence factor breakdown decomposition
  13. Confidence thresholds evaluation
  14. Invalid reconstructed output rejection
  15. Explicit abstention (never guesses)
  16. Acceptance-policy review hold despite high score
  17. Cryptographic hash preservation of original dataset
  18. Correct source row mapping
  19. Reconstruction run persistence and retrieval
  20. Incomplete detection run rejection
  21. Invalid detection run ID handling (404)
  22. Results filtering and pagination
  23. Operator review decision recording
* **1 end-to-end Phase 6 workflow verification test (`test_phase6_workflow.py`)**

### Frontend Typecheck & Production Build
```powershell
cd frontend
npm run build
```
Vite production build and TypeScript compilation complete cleanly with zero errors in ~300ms.

---

## Instructions to Reproduce Full End-to-End Workflow

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
3. **Execute Full Pipeline Workflow**:
   * Navigate to `http://localhost:5173/datasets` and upload an industrial telemetry CSV.
   * Navigate to `/pipeline`, configure sensor channels, detection settings, and reconstruction parameters, then click **Save Pipeline Configuration**.
   * Navigate to `/anomalies`, select the pipeline, and click **Run Real Detection** to produce real anomaly records.
   * Navigate to `/reconstruction` (Reconstruction Studio), select the completed detection run, and click **Start Reconstruction Run**.
   * View the real KPI summary cards, filter by status or sensor, and click **Inspect** on any observation to inspect the tri-value comparison, supporting evidence neighbors, and confidence factor breakdown.
   * Use the **Operator Review & Ledger Commitment** panel to accept, reject, or modify proposed values with an audit comment.
