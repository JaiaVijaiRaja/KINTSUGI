# KINTSUGI — Confidence-Aware Self-Healing Data Pipeline

> **Phase 10: Final Polish, Demonstration Preparation, and Deployment Readiness**

KINTSUGI is a confidence-aware, self-healing industrial data pipeline designed to ingest noisy multi-sensor telemetry, detect quality anomalies, reconstruct damaged signals with contextual confidence scores, preserve original measurements in an immutable audit ledger, and verify performance through reproducible benchmarks.

Like the Japanese art of *Kintsugi* (金継ぎ, repairing broken ceramics with gold lacquer), KINTSUGI treats signal repairs with complete transparency: **raw measured telemetry is never overwritten or discarded**. Proposed reconstructions carry evidence-based confidence scores, and when evidence is insufficient, the system strictly abstains by marking values as `UNRESOLVED` rather than guessing.

---

## 1. Project Overview & The Industrial Reliability Problem

In mission-critical industrial environments—such as power generation gas turbines, oil & gas compressors, chemical reactors, and electrical grid substations—telemetry feeds suffer from severe real-world data-quality degradations:
* Transient electrical spikes and outlier noise
* Frozen/stuck sensor readings due to transducer lockup
* Missing data intervals caused by packet drops or network communication lapses
* Gradual mechanical calibration drift

Traditional automated data-cleaning approaches introduce two fatal failure modes:
1. **Destructive Overwriting**: They silently overwrite or delete raw physical sensor readings, destroying regulatory audit evidence and preventing downstream control systems from assessing original measurement veracity.
2. **Hallucinated Precision**: They attempt to interpolate or impute values regardless of whether valid bounding evidence exists—hallucinating plausible-looking numbers over wide data blackouts.

KINTSUGI solves this by treating signal healing as an auditable, confidence-bounded process governed by non-negotiable safety invariants:
* Original raw measurements are permanently preserved and immutable.
* Every proposed repair is decomposed into transparent physical evidence factors (0 to 100).
* The pipeline strictly **abstains from guessing** (`UNRESOLVED`) when bounding evidence is broken or ambiguous.
* All lifecycle state transitions are cryptographically sealed in an append-only SHA-256 hash-chain ledger.

---

## 2. Key Capabilities (Implemented & Verified)

* **Robust Telemetry Ingestion (Phase 3)**: Validated CSV stream ingestion with multi-encoding detection (`utf-8`, `utf-8-sig`, `latin-1`), isolated server-controlled storage (`ds_{uuid}`), path traversal prevention, and data quality audits (row duplicates, missing cell rates, column statistics, ISO-8601 timestamp inference).
* **Versioned Pipeline Configuration (Phase 4)**: Typed, persistent pipeline profiles (`pipe_{uuid}`) with validation against dataset schemas, separate sensor/ignored channel assignments, and detection/reconstruction parameter bounds.
* **Multi-Detector Anomaly Engine (Phase 5)**: High-performance execution combining trailing rolling median with Median Absolute Deviation (MAD) and multivariate Isolation Forest (`scikit-learn`), multi-detector consensus policies, and severity classification (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`).
* **Confidence-Aware Signal Reconstruction (Phase 6)**:
  * Chronological Linear Interpolation with strict boundary extrapolation prohibition.
  * Local Median Reconstruction with isolated window, target observation exclusion, and quorum thresholds.
  * Empirical Cross-Sensor Validation evaluating Pearson correlations ($|r| \ge 0.70$) on nominal baselines with linear regression residual corroboration.
  * Evidence-Based Confidence Scoring (0 to 100) decomposed into 6 physical factors.
  * Four strict processing statuses: `MEASURED`, `ESTIMATED`, `CORRECTED`, and `UNRESOLVED`.
  * Human-in-the-loop operator review workflow (`ACCEPT`, `REJECT`, `MODIFY`) with audit notes.
* **Evaluation Center & Benchmarking (Phase 7)**: Controlled synthetic fault injection across 6 industrial fault models (point spikes, corruption, missing intervals, drift ramps, frozen sensors, communication gaps) generating separate benchmark copies and ground-truth manifests. Quantitative metrics (Precision, Recall, F1, Specificity, MAE, RMSE) with zero-denominator safeguards.
* **Cryptographic Audit Trail & Explainability (Phase 8)**: Append-only ledger (`storage/audit/events.jsonl`) with parent-child SHA-256 hash chains, causal provenance graph reconstruction, single-observation row lifecycle tracking, live tamper verification, and bounded compliance export (JSONL and CSV).
* **End-to-End Integration & Reliability (Phase 9)**: 137 passing tests, cold application restart persistence, corrupted storage recovery, standardized error envelopes, and SHA-256 source immutability verification.
* **Demonstration & Deployment Readiness (Phase 10)**: Polished industrial dashboard with dark slate surfaces and metallic gold accents, live KPI metrics with clear population scopes, demonstration script (`DEMO_SCRIPT.md`), verification checklist (`DEMO_CHECKLIST.md`), troubleshooting guide (`DEMO_TROUBLESHOOTING.md`), and Docker container orchestration (`docker-compose.yml`).

---

## 3. System Architecture & Processing Flow

```
                      ┌──────────────────────────────────────┐
                      │   Raw Multi-Sensor Telemetry (CSV)   │
                      └──────────────────┬───────────────────┘
                                         │  (Read-only, SHA-256 Verified)
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Dataset Ingestion & Quality Audit │
                      └──────────────────┬───────────────────┘
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Pipeline Configuration & Bounds   │
                      └──────────────────┬───────────────────┘
                                         ▼
                      ┌──────────────────────────────────────┐
                      │    Multi-Detector Anomaly Engine     │
                      │  (Rolling MAD + Isolation Forest)    │
                      └──────────────────┬───────────────────┘
                                         ▼
                      ┌──────────────────────────────────────┐
                      │  Confidence-Aware Reconstruction     │
                      │  - Linear Interpolation (No Extrap)  │
                      │  - Local Median (Quorum >= 3)        │
                      │  - Cross-Sensor Empirical Check      │
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
                                       │
                                       ▼
                      ┌──────────────────────────────────────┐
                      │   Append-Only SHA-256 Audit Ledger   │
                      │   (Cryptographic Hash Chain Proof)   │
                      └──────────────────────────────────────┘
```

---

## 4. Technology Stack & Prerequisites

### Core Dependencies
* **Frontend**:
  * React 19.x
  * TypeScript 5.9.x
  * Vite 8.3.x
  * Tailwind CSS v4
  * Lucide Icons
* **Backend**:
  * Python 3.12+ (tested on Python 3.14)
  * FastAPI 0.115+
  * Pydantic v2.7+ & Pydantic-Settings
  * Pandas 2.2+ & NumPy
  * Scikit-Learn 1.4+
  * Uvicorn 0.30+
  * Pytest 8.0+

### Prerequisites
* Python 3.12 or newer
* Node.js v20.x or newer & npm v10+
* (Optional for containerization) Docker & Docker Compose v2+

---

## 5. Installation & Local Setup

### 1. Clone & Set Up Backend
```powershell
# Navigate to repository root
cd "c:\WORK LAB-SL19\Workstation\MY PROJECT\ANTIGRAVITY\HORIZONXT26"

# Create and activate Python virtual environment
python -m venv backend\.venv
.\backend\.venv\Scripts\Activate.ps1

# Install required Python dependencies
pip install --upgrade pip
pip install -r backend\requirements.txt
```

### 2. Set Up Frontend
```powershell
# Navigate to frontend directory
cd frontend

# Install Node dependencies
npm install
cd ..
```

---

## 6. Environment Configuration

### Backend Configuration (`backend/.env`)
Create `backend/.env` (or rely on built-in safe defaults):
```env
ENVIRONMENT=development
HOST=127.0.0.1
PORT=8000
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,http://localhost:80
```

### Frontend Configuration (`frontend/.env`)
Create `frontend/.env`:
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

> [!NOTE]
> No sensitive third-party API keys or private database passwords are required. All persistence uses local isolated storage paths under `backend/storage/`.

---

## 7. Running Locally

### Start Backend Service
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```
* Backend API Health: `http://127.0.0.1:8000/api/health`
* Interactive OpenAPI Documentation: `http://127.0.0.1:8000/docs`

### Start Frontend Application
```powershell
cd frontend
npm run dev
```
* Frontend Dashboard: `http://localhost:5173`

---

## 8. Eight Application Routes

| Route | Module Name | Operational Status | Key Functionality |
| :--- | :--- | :--- | :--- |
| `/overview` | System Overview | **Live Operational** | Live KPI cards with population scopes, system health, and recent audit activity stream |
| `/datasets` | Dataset Management | **Live Operational** | Drag-and-drop CSV upload, data quality audit, missing rates, and tabular preview |
| `/pipeline` | Pipeline Configuration | **Live Operational** | Column role mapping, detection bounds, reconstruction thresholds, and atomic saving |
| `/anomalies` | Anomaly Explorer | **Live Operational** | Real anomaly detection, SVG multi-sensor time-series chart, and detector consensus |
| `/reconstruction` | Reconstruction Studio | **Live Operational** | Tri-value comparison (`MEASURED`, `ESTIMATED`, `CORRECTED`, `UNRESOLVED`), evidence factor breakdown, and human review |
| `/evaluation` | Evaluation Center | **Live Operational** | Controlled synthetic fault injection benchmarks (Mode A), existing run inspection (Mode B), and confusion matrix |
| `/audit` | Audit Trail | **Live Operational** | Chronological SHA-256 hash-chain ledger, causal provenance graphs, row lifecycles, and compliance export |
| `/settings` | Settings & System Info | **Live Operational** | Runtime specifications, network diagnostics, and interactive OpenAPI documentation |

---

## 9. Automated Testing & Verification

### Run Full Backend Test Suite
```powershell
.\backend\.venv\Scripts\pytest.exe backend\tests -v
```
**All 137 test cases pass with zero failures**:
* `test_datasets.py`: 17 tests (Ingestion, encoding, validation, quality metrics)
* `test_health.py`: 3 tests (Health status, CORS headers, 404 contracts)
* `test_pipelines.py`: 16 tests (Configuration CRUD, validation, version increment)
* `test_phase4_workflow.py`: 1 test (End-to-end configuration lifecycle)
* `test_detection.py`: 20 tests (Rolling MAD, Isolation Forest, consensus aggregation)
* `test_phase5_workflow.py`: 1 test (End-to-end detection lifecycle)
* `test_reconstruction.py`: 23 tests (Linear interpolation, local median, cross-sensor, abstention, factor breakdown)
* `test_phase6_workflow.py`: 1 test (End-to-end reconstruction lifecycle)
* `test_evaluation.py`: 26 tests (Synthetic fault injection, confusion matrix, denominator safety, manifests)
* `test_audit.py`: 20 tests (Append-only ledger, SHA-256 hash chains, causal provenance, export)
* `test_integration_phase9.py`: 9 tests (Full critical lifecycle, invariants, restart persistence, corruption recovery, tamper detection, compliance export)

### Run Frontend Typecheck & Production Build
```powershell
cd frontend
npm run build
```
Vite production build and TypeScript compilation complete with **0 errors**.

---

## 10. Confidence Scoring & Abstention Mechanics

### Transparent Evidence-Based Confidence Scoring (0 to 100)
> [!IMPORTANT]
> The confidence score is an **evidence index** composed of documented physical factors. It is **NOT a calibrated statistical probability**.

| Factor | Point Range | Criteria |
| :--- | :--- | :--- |
| **Neighbor Density** | 0 to 25 | Scaled by available valid surrounding observations ($\min(N/8, 1.0) \times 25$). |
| **Method Concordance** | 0 to 25 | Agreement between Linear Interpolation and Local Median ($1.0 - \text{diff}/\text{baseline}$). |
| **Temporal Proximity** | 0 to 20 | Penalizes wide gaps or distant supporting brackets ($e^{-\text{gap}/3} \times 20$). |
| **Signal Stability** | 0 to 15 | Reward for localized signal stability ($\sigma_{\text{local}}/\mu_{\text{local}}$). |
| **Neighbor Cleanliness** | 0 to 15 | Ratio of non-anomalous neighbors to total inspected window neighbors. |
| **Cross-Sensor Corroboration** | -25 to +10 | +10 bonus for regression corroboration ($<2\sigma_{\text{res}}$); -25 penalty for severe conflict ($>3.5\sigma_{\text{res}}$). |
| **Structural Invariant Violations** | Override to 0.0 | Boundary extrapolation breach, gap limit exceedance, or non-finite values force score to 0.0 and status to `UNRESOLVED`. |

---

## 11. Demonstration Assets & Guides

* **[DEMO_SCRIPT.md](DEMO_SCRIPT.md)**: Structured 5-to-7 minute presentation script for judges and juries.
* **[DEMO_CHECKLIST.md](DEMO_CHECKLIST.md)**: 15-minute pre-demonstration verification checklist.
* **[DEMO_TROUBLESHOOTING.md](DEMO_TROUBLESHOOTING.md)**: Emergency quick-reference guide for live demo incidents.
* **`demo/turbine_telemetry_demo.csv`**: Deterministic 60-row industrial gas turbine telemetry dataset containing known synthetic faults (Row 12 spike, Rows 24–26 gap, Rows 36–39 frozen sensor).
* **`demo/ground_truth_manifest.json`**: Reference ground truth values.

---

## 12. Deployment Readiness & Known Limitations

* **Containerized Deployment**: Supported via `docker-compose.yml` with persistent storage volume `kintsugi_persistent_storage` and production Nginx reverse proxy.
* **Local Filesystem Persistence**: Current persistence uses local atomic JSON/CSV storage in `backend/storage/`. On ephemeral cloud platforms (e.g. AWS Fargate, Google Cloud Run), volume mounting or cloud object storage is required to survive container redeployments (see [DEPLOYMENT.md](DEPLOYMENT.md)).
* **Single-Node Architecture**: Scaled for single-instance industrial edge appliances; multi-node distributed clustering would require a centralized database (e.g. PostgreSQL) and message broker.
