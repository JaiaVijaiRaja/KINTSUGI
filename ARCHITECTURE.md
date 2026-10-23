# KINTSUGI — System Architecture & Design Boundaries

## 1. System Overview

**KINTSUGI** (Confidence-Aware, Self-Healing Industrial Data Pipeline) is an industrial telemetry pipeline designed to ingest noisy, intermittent, or corrupted multi-sensor data, detect quality anomalies, reconstruct damaged signals using contextual machine learning and physics-informed models, assign evidence-based confidence scores to all proposed repairs, and preserve original un-altered sensor measurements in an immutable audit ledger.

The project takes its name from *Kintsugi* (金継ぎ), the traditional Japanese art of repairing broken pottery with lacquer dusted with powdered gold—treating flaws and repairs with full transparency and historical fidelity rather than concealing them.

---

## 2. Core Architectural Invariants

### 1. Preservation of Original Readings
Original measured sensor values (`original_value`) are permanently retained and NEVER overwritten, mutated, or deleted. All downstream consumers can inspect both the raw reading and the healed signal simultaneously. In all phases, `preserve_original_readings` is enforced as an immutable invariant (`True`). Raw CSV datasets are mounted read-only and verified via SHA-256 integrity checks.

### 2. The Four Processing Statuses
Every telemetry data point evaluated by the pipeline is categorized into one of four mutually exclusive, strictly defined processing statuses:

| Status | Code | Meaning | Downstream Action |
| :--- | :--- | :--- | :--- |
| **MEASURED** | `01_RAW` | Original unmodified physical sensor reading. Verified within nominal operating boundaries. | Passed to downstream operational telemetry as trusted truth. |
| **ESTIMATED** | `02_PROP` | Candidate repaired value generated via contextual time-series or multivariate model imputation. | Internal intermediate proposal; holding raw reading pending human review. |
| **CORRECTED** | `03_VERIF` | High-confidence validated repair. The candidate repair exceeds the required policy confidence threshold (e.g. $\ge 0.80$) or received operator approval. | Approved for downstream control loops, labeled with repair metadata. |
| **UNRESOLVED** | `04_ABST` | Insufficient contextual evidence or corrupted neighboring channels. The system strictly **abstains from guessing**. | Flagged for operator review; safety interlocks alerted; no fabricated precision. |

### 3. Strict Requirement to Abstain
When evidence is ambiguous, sensor correlation is degraded, or uncertainty margins exceed permissible thresholds, the pipeline **MUST abstain**. Fabricating synthetic accuracy where none exists is prohibited.

---

## 3. Scope: Implemented vs. Planned Features

### Implemented Features (Phases 1 through 6)
* **Application Shell & Navigation**: Complete 8-route single-page application shell (`/overview`, `/datasets`, `/pipeline`, `/anomalies`, `/reconstruction`, `/audit`, `/evaluation`, `/settings`).
* **Zero-Dependency History Router**: Lightweight HTML5 History API client router supporting direct browser URL navigation, browser Back/Forward, automatic `/` to `/overview` redirect, and 404 Not Found handling.
* **Verified Backend Health Contract**: Live `GET /api/health` endpoint returning operational status, service identifier, API version, environment, and ISO-8601 UTC server timestamp with roundtrip latency tracking.
* **Dataset Ingestion Engine (Phase 3 Core Feature)**:
  * Multipart file upload (`POST /api/datasets/upload`) for CSV telemetry streams.
  * Multi-encoding support (`utf-8-sig`, `utf-8`, `latin-1`).
  * Strict validation against empty files, invalid extensions, header-only datasets, duplicate column names, empty column names, and mismatched row lengths.
  * Server-controlled isolated storage paths (`ds_{uuid}`) preventing path traversal.
  * Exact data quality audit calculations (row duplicates, missing counts, column types, descriptive statistics).
* **Pipeline Configuration Engine (Phase 4 Core Feature)**:
  * Typed, versioned configuration data model (`PipelineConfig`, `PipelineConfigCreate`, `PipelineConfigUpdate`).
  * Live validation endpoint (`POST /api/pipelines/validate`) validating against actual dataset schema, column types, and data quality without side-effects.
  * Persistence endpoint (`POST /api/pipelines`) saving atomic configuration files in `storage/pipelines/` with server-controlled IDs (`pipe_{uuid}`).
  * Configuration listing (`GET /api/pipelines`) and single retrieval (`GET /api/pipelines/{id}`).
  * Versioned update endpoint (`PUT /api/pipelines/{id}`) incrementing `configuration_version` and re-validating.
* **Real Sensor Anomaly Detection Engine (Phase 5 Core Feature)**:
  * Robust statistical anomaly detection via trailing rolling median and Median Absolute Deviation (MAD).
  * Multivariate Isolation Forest detection via `scikit-learn` with finite-sample filtering and exact source row mapping.
  * Explicit multi-detector aggregation policy distinguishing single-detector vs multi-detector consensus.
  * Documented severity classification rubric (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
  * Atomic detection run persistence in `storage/runs/{run_id}/run.json` and `anomalies.json`.
  * Dedicated API endpoints for execution (`POST /api/pipelines/{id}/run`), run status (`GET /api/pipelines/{id}/runs/{run_id}`), run results (`GET /api/pipelines/{id}/runs/{run_id}/results`), and anomalies catalog (`GET /api/anomalies`, `GET /api/anomalies/{anomaly_id}`).
  * Interactive Anomaly Explorer frontend with real pipeline selection, execution controls, KPI cards, SVG time-series visualization with anomaly overlays, filterable records table, and detailed observation modal.
* **Confidence-Aware Data Reconstruction Engine (Phase 6 Core Feature)**:
  * Chronological Linear Interpolation with strict boundary extrapolation prohibition, gap limits, timestamp weighting ($\Delta t$), and anomaly neighbor exclusion.
  * Local Median Reconstruction with isolated window, target exclusion, minimum valid neighbor quorum, and anomaly exclusion.
  * Cross-Sensor Validation evaluating empirical Pearson correlation ($|r| \ge 0.70$) on nominal observations, linear regression residual corroboration, and severe conflict detection ($>3.5\sigma_{\text{res}}$).
  * Evidence-Based Confidence Scoring (0 to 100) combining neighbor density, method concordance, temporal proximity, signal stability, cleanliness, and cross-sensor corroboration.
  * Deterministic Acceptance Policies driving explicit status transitions (`MEASURED`, `ESTIMATED`, `CORRECTED`, `UNRESOLVED`).
  * Operator human review decisions (`ACCEPT`, `REJECT`, `MODIFY`) committed with audit notes.
  * Reconstruction Studio frontend with run selection, controls, KPI summary cards, filterable results table, and detailed evidence inspector modal.

### Planned for Future Phases
* **Evaluation Center Benchmarking (Phase 7)**: Independent performance metrics, precision, recall, F1, RMSE, MAE, and calibration curves against labeled test datasets.
* **Cryptographic Audit Ledger (Phase 8)**: Append-only SHA-256 hash chains documenting all repair proposals and operator decisions.

---

## 4. Confidence-Aware Data Reconstruction Architecture (Phase 6)

### 1. Chronological Linear Interpolation
* **Mathematical Formula**:
  Given target row index $i$ with timestamp $t_i$, left valid bounding neighbor $(t_L, y_L)$ at row $L < i$, and right valid bounding neighbor $(t_R, y_R)$ at row $R > i$:
  $$\hat{y}_i = y_L + \frac{t_i - t_L}{t_R - t_L} \cdot (y_R - y_L)$$
  When timestamps are absent, row indices are used:
  $$\hat{y}_i = y_L + \frac{i - L}{R - L} \cdot (y_R - y_L)$$
* **Safety Invariants**:
  1. **Extrapolation Prohibited**: If $L$ is absent (left boundary) or $R$ is absent (right boundary), the method strictly returns `can_reconstruct=False`.
  2. **Gap Limit Enforcement**: If $R - L - 1 > \text{max\_gap\_size}$, linear interpolation abstains.
  3. **Neighbor Cleanliness**: Observations flagged as unresolved anomalies cannot serve as trusted bounding neighbors $L$ or $R$.

### 2. Local Median Reconstruction
* **Mathematical Formula**:
  For window radius $w$:
  $$N_i = \{y_k \mid \max(0, i - w) \le k \le \min(N-1, i + w), k \ne i, y_k \in \mathbb{R}_{\text{finite}}, k \notin \text{Anomalies}\}$$
  $$\hat{y}_i = \text{median}(N_i)$$
* **Safety Invariants**:
  1. The target observation $i$ is strictly excluded from its own reference neighborhood.
  2. Flagged anomalies within the window are excluded.
  3. If $|N_i| < \text{min\_trusted\_neighbors}$ (default 3), the method declines to reconstruct.

### 3. Empirical Cross-Sensor Validation
* **Corroboration Threshold**:
  Computes Pearson correlation coefficient $r$ across all nominal (non-anomalous) rows between target sensor $Y$ and candidate reference sensor $X$:
  $$r = \frac{\sum (x_k - \bar{x})(y_k - \bar{y})}{\sqrt{\sum (x_k - \bar{x})^2 \sum (y_k - \bar{y})^2}}$$
* **Invariant**: If $|r| < 0.70$, the engine strictly disclaims any cross-sensor relationship (`has_relationship=False`).
* **Regression Corroboration**: If $|r| \ge 0.70$, fits empirical linear regression $y = \beta_1 x + \beta_0$ and evaluates residual standard error $\sigma_{\text{res}}$:
  * **Corroborating**: If $|\hat{y} - \hat{y}_{\text{reg}}| \le 2.0\sigma_{\text{res}}$, cross-sensor corroboration bonus (+10 pts) is awarded.
  * **Conflicting**: If $|\hat{y} - \hat{y}_{\text{reg}}| > 3.5\sigma_{\text{res}}$, severe evidence conflict is flagged (-25 pts penalty and hold for review).

---

## 5. Storage & Persistence Layout

```
backend/storage/
├── datasets/
│   └── ds_{uuid}/
│       ├── data.csv                 # Raw sensor CSV (IMMUTABLE, READ-ONLY)
│       ├── metadata.json            # Dataset catalog metadata
│       └── quality.json             # Data quality audit
├── pipelines/
│   └── pipe_{uuid}.json             # Saved pipeline configuration (v1, v2...)
├── runs/
│   └── run_{uuid}/
│       ├── run.json                 # Detection run execution state & summary counts
│       └── anomalies.json           # Array of individual AnomalyRecord objects
└── reconstruction/
    └── rec_run_{uuid}/
        ├── run.json                 # Reconstruction execution state & summary counts
        └── results.json             # Per-reading audit records & review decisions
```

* **Data Preservation**: Raw CSV files in `storage/datasets/` are strictly read-only and never modified by detection or reconstruction runs.
* **Atomic Writes**: All JSON persistence uses `.tmp` files committed via atomic `os.replace`.

---

## 6. API Contracts Summary

### Pipeline Execution & Detection
* `POST /api/pipelines/{pipeline_id}/run` — Executes detection run.
* `GET /api/pipelines/{pipeline_id}/runs` — Lists detection runs for pipeline.
* `GET /api/pipelines/{pipeline_id}/runs/{run_id}` — Retrieves detection run status.
* `GET /api/pipelines/{pipeline_id}/runs/{run_id}/results` — Retrieves anomaly records.
* `GET /api/anomalies` — Queries and filters anomaly records across runs.
* `GET /api/anomalies/{anomaly_id}` — Retrieves single anomaly details.

### Reconstruction Runs & Results
* `POST /api/pipelines/{pipeline_id}/runs/{detection_run_id}/reconstruct` — Executes confidence-aware reconstruction run.
* `GET /api/reconstruction/runs` — Lists reconstruction runs with optional filtering.
* `GET /api/reconstruction/runs/{reconstruction_run_id}` — Retrieves reconstruction run metadata and summary counts.
* `GET /api/reconstruction/runs/{reconstruction_run_id}/results` — Retrieves paginated reconstruction records with sensor and status filters.
* `GET /api/reconstruction/results/{result_id}` — Retrieves single reconstruction record with evidence references and confidence factor breakdown.
* `POST /api/reconstruction/results/{result_id}/review` — Records an operator human review decision (`ACCEPT`, `REJECT`, `MODIFY`).
