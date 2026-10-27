# KINTSUGI — Technical Architecture & Inventory Audit

**Audit Date**: October 27, 2026  
**Auditor**: Senior Machine Learning & Systems Architecture Auditor  
**Audit Scope**: System Inventory, Dependency Graph, Component Architecture, and Pipeline Dataflow  
**Status**: VERIFIED & RECONCILED (Read-Only Audit Phase)

---

## 1. System Inventory & Dependency Matrix

### 1.1 Backend Environment
- **Runtime**: Python 3.14.3 (`C:\WORK LAB-SL19\Workstation\MY PROJECT\ANTIGRAVITY\HORIZONXT26\backend\.venv\Scripts\python.exe`)
- **Web Framework**: FastAPI `0.159.1` with Starlette `0.52.1`
- **Data Validation & Typing**: Pydantic `2.14.1`, Pydantic-Settings `2.13.1`
- **Server Gateway**: Uvicorn `0.54.0` (ASGI)
- **Scientific & ML Libraries**:
  - `scikit-learn==1.9.1` (Isolation Forest)
  - `pandas==3.1.0` (Data profiling, time-series transformations)
  - `numpy==2.5.4` (Linear algebra, median/MAD vectorization)
  - `scipy==1.17.1` (Statistical distributions and correlations)
- **Storage / Persistence**:
  - Local JSON / JSONL filesystem store under `backend/storage/`
  - Canonical JSON + SHA-256 event chaining for audit trail (`backend/storage/audit/events.jsonl`)
  - No external SQL/NoSQL database dependency.

### 1.2 Frontend Environment
- **Runtime**: Node.js `v25.8.2`, npm `11.1.2`
- **Application Framework**: React `19.3.1`, React DOM `19.3.1`
- **Build Tool / Bundler**: Vite `8.3.4` (ESM build target `esnext`)
- **Styling**: Tailwind CSS `4.3.3` with `@tailwindcss/vite`
- **Icons & UI Components**: Lucide React `1.61.0`
- **Client Networking**: Native `fetch` with typed API client wrapper (`frontend/src/services/api.ts`)
- **Linting & Code Quality**: Oxlint `1.88.0` (Rust-based linter)
- **E2E Testing**: Playwright `1.64.1` (Chromium engine)

---

## 2. Discovered Route Architecture (43 Endpoints)

The backend exposes 43 distinct endpoints mapped across 8 domain controllers:

| Controller Module | Route Prefix | Route Count | Responsibility |
|---|---|:---:|---|
| [health.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/health.py) | `/api/health` | 1 | Liveness probe, service metadata, uptime |
| [datasets.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/datasets.py) | `/api/datasets` | 6 | Multipart CSV upload, byte validation, profiling, preview, demo dataset loading |
| [pipelines.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/pipelines.py) | `/api/pipelines` | 10 | Pipeline configuration, validation, cloning, detector settings |
| [anomalies.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/anomalies.py) | `/api/anomalies` | 2 | Anomaly detection run execution, paginated anomaly results |
| [reconstruction.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/reconstruction.py) | `/api/reconstruction` | 6 | Contextual repair execution, policy enforcement, side-by-side CSV/JSON export |
| [evaluation.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/evaluation.py) | `/api/evaluations` | 7 | Ground truth upload, benchmarking, confusion matrix, MAE/RMSE calculation |
| [audit.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/audit.py) | `/api/audit` | 7 | SHA-256 hash-chain ledger events, cryptographic verification, tamper detection |
| [demos.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/api/routes/demos.py) | `/api/demos` | 4 | Demo catalog, scenario manifests, error simulation without stack trace leakage |

---

## 3. Execution Dataflow: Documented vs Actual Implementation

```
[CSV Upload]
     │
     ▼
[Input Validation & Byte Profiling] (MIME sniff, UTF-8/Latin-1, size limit 50MB)
     │
     ▼
[Data Profiler] (Monotonic timestamps, duplicate check, numeric casting)
     │
     ▼
[Audit Event: DATASET_UPLOADED] (SHA-256 raw bytes recorded into ledger)
     │
     ▼
[Pipeline Config & Validation] (Settings schema, column selection, MAD/IF params)
     │
     ▼
[Anomaly Detection Stage]
     ├── Rolling MAD Detector (Univariate dispersion, min 10 observations)
     └── Isolation Forest (Multivariate contamination, fixed seed=42)
     │
     ▼
[Audit Event: DETECTION_RUN_COMPLETED]
     │
     ▼
[Contextual Reconstruction Engine]
     ├── Gap Analysis (Max gap <= 5 samples)
     ├── Linear Interpolation / Local Median Baseline
     ├── Cross-Sensor Corroboration (|r| >= 0.70 on nominal points)
     └── Confidence Policy & Safe Abstention Filter
     │
     ▼
[Status Assignment Matrix]
     ├── UNMODIFIED -> "MEASURED"
     ├── RECONSTRUCTED & CONFIDENT -> "CORRECTED"
     ├── IMPUTED MISSING & CONFIDENT -> "ESTIMATED"
     └── LOW CONFIDENCE / LARGE GAP -> "UNRESOLVED"
     │
     ▼
[Audit Event: RECONSTRUCTION_RUN_COMPLETED]
     │
     ▼
[Side-by-Side Serialization & Export API] (Original + Repaired + Status + Confidence)
     │
     ▼
[React 19 Dashboard Visualization] (Real response binding, chart overlay, ledger verification)
```

### 3.1 Architectural Deviations & Inconsistencies Discovered
1. **Ledger Concurrency & Test Isolation Gap (`DEF-01`)**:
   - Intended: The audit ledger provides an append-only cryptographic hash chain of system actions.
   - Actual: Backend test suites (`test_step5_audit_tamper.py`, `test_demo_datasets_regression.py`, etc.) write directly to `backend/storage/audit/events.jsonl` unless explicitly monkeypatched in every test file. Under concurrent test runs, sequence number collisions occurred at event `12265` (duplicate sequence `12264`), corrupting the hash chain pointers for subsequent events and failing verification in `06_audit_trail.spec.ts`.
2. **Heavy Execution Time vs UI Timeout (`DEF-02`)**:
   - Intended: The frontend dashboard provides real-time progress while detectors and reconstructors run.
   - Actual: Running Isolation Forest and Reconstruction across 4 sensor channels takes ~44.9s on Windows under CPU load. Playwright tests configured with 30–35s timeouts fail prematurely even though the backend finishes successfully shortly after.
3. **No External Database Overhead**:
   - The system is completely self-contained with no external database requirements (PostgreSQL, Redis, etc.), which ensures 100% portability for edge and on-premise industrial gateways.

---

## 4. Phase A Architecture Verification Verdict

- **Repository Inventory**: **PASS**
- **Dependency Compatibility**: **PASS** (Python 3.14 + React 19 + Tailwind v4 + Vite)
- **Route Registration**: **PASS** (43/43 routes active)
- **Data Flow Traceability**: **PASS** (Pipeline stages are genuinely executed; no mock stubs in production path)
- **Identified Defect**: **DEF-01** (Audit ledger concurrency and missing test isolation).
