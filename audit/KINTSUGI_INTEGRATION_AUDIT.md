# KINTSUGI — Frontend-Backend Integration Audit

**Audit Date**: October 27, 2026  
**Auditor**: Senior Full-Stack Integration Engineer  
**Audit Scope**: User Actions, Client Service Wrappers, HTTP Contracts, Backend Handlers, and UI State Updates  
**Status**: VERIFIED & RECONCILED (Read-Only Audit Phase)

---

## 1. Endpoint-to-Component Integration Matrix

The full interactive journey of KINTSUGI traces through 8 core workflows connecting React components to FastAPI backend services:

| User Action | Frontend Component | Client Service Method | HTTP Route | Backend Handler | Response Schema | Displaying Component | Integration Result |
|---|---|---|---|---|---|---|:---:|
| **1. Upload CSV** | [UploadDatasetCard.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/UploadDatasetCard.tsx) | `apiClient.uploadDataset(file)` | `POST /api/datasets/upload` | `datasets.upload_dataset` | `DatasetUploadResponse` | [DatasetsPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/DatasetsPage.tsx) | **PASS** |
| **2. Preview Dataset** | [DataPreviewTable.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/DataPreviewTable.tsx) | `apiClient.getDatasetPreview(id)` | `GET /api/datasets/{id}/preview`| `datasets.get_preview` | `DatasetPreviewResponse` | [DataPreviewTable.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/DataPreviewTable.tsx) | **PASS** |
| **3. Configure Pipeline** | [PipelineConfigForm.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/PipelineConfigForm.tsx) | `apiClient.createPipelineConfig(cfg)`| `POST /api/pipelines` | `pipelines.create_pipeline` | `PipelineConfig` | [PipelinesPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/PipelinesPage.tsx) | **PASS** |
| **4. Run Anomaly Detection** | [AnomaliesPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/AnomaliesPage.tsx) | `apiClient.runDetection(req)` | `POST /api/anomalies/run` | `anomalies.execute_detection`| `DetectionRunResponse` | [AnomalyList.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/AnomalyList.tsx) | **PASS** |
| **5. Run Reconstruction** | [ReconstructionPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/ReconstructionPage.tsx)| `apiClient.runReconstruction(req)`| `POST /api/reconstruction/run`| `reconstruction.execute_run`| `ReconstructionRunResponse`| [ReconstructionView.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/ReconstructionView.tsx) | **PASS** |
| **6. Verify Audit Ledger** | [AuditPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/AuditPage.tsx) | `apiClient.verifyAuditLedger()` | `POST /api/audit/verify` | `audit.verify_ledger` | `AuditVerificationResponse`| [AuditLedgerViewer.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/AuditLedgerViewer.tsx)| **PASS** (isolated) / **FAIL** (`events.jsonl`) |
| **7. Ground Truth Benchmark** | [EvaluationPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/EvaluationPage.tsx)| `apiClient.runEvaluation(req)` | `POST /api/evaluations/run` | `evaluation.execute_evaluation`| `EvaluationRunResponse` | [EvaluationMetrics.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/components/EvaluationMetrics.tsx)| **PASS** |
| **8. Export Repaired Telemetry**| [ReconstructionPage.tsx](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/frontend/src/pages/ReconstructionPage.tsx)| Native browser download link | `GET /api/reconstruction/runs/{id}/export`| `reconstruction.export_dataset`| Streaming CSV/JSON | Browser File Saver | **PASS** |

---

## 2. In-Depth Flow Trace: Signal Repair & Evidence Rendering

```
[User clicks "Run Contextual Reconstruction"]
     │
     ▼
[ReconstructionPage.tsx] triggers handleRunReconstruction()
     │
     ▼
[reconstructionService.ts] executes executeReconstruction(configId, runId)
     │
     ▼
[HTTP POST /api/reconstruction/run] body: { "configuration_id": "...", "detection_run_id": "..." }
     │
     ▼
[reconstruction.py:execute_run] dispatches to reconstruction_service.py
     │
     ▼
[reconstruction_service.py]
     - Evaluates gap sizes (<= 5)
     - Applies local median baseline or linear interpolation
     - Queries cross_sensor.py for corroborating channels (|r| >= 0.70)
     - Computes confidence index (0-100)
     - Applies policy.py (MEASURED / ESTIMATED / CORRECTED / UNRESOLVED)
     - Records RECONSTRUCTION_RUN_COMPLETED in audit ledger
     │
     ▼
[HTTP 200 OK] returns ReconstructionRunResponse { run: {...}, summary: {...} }
     │
     ▼
[ReconstructionPage.tsx] receives payload -> updates setReconstructionRun(res.run)
     │
     ▼
[ReconstructionChart.tsx & ReconstructionTable.tsx]
     - Renders dual-series chart (raw points vs repaired curve)
     - Renders evidence tooltip: Corroborating sensors, Pearson r, gap distance
     - Renders status badges: CORRECTED (green), UNRESOLVED (amber)
```

---

## 3. Contract Edge Cases & Race Conditions

1. **State Isolation on Route Switching**:
   - Navigating between tabs (e.g., from `Pipelines` to `Reconstruction`) stores active dataset and configuration IDs in React Context / local state. Returning to a previous tab retains selections without re-triggering unnecessary backend runs.
2. **Concurrent Request Handling**:
   - While a detection or reconstruction run is in-flight, the UI disables the trigger button and displays a progress spinner (`Executing Detectors...`), preventing duplicate concurrent submissions from the client.
3. **Graceful Handling of Null Fields**:
   - When a sensor cell is `MEASURED` (untouched), `original_value` equals `final_value`, and `confidence_score` is null. The frontend safely handles `null` confidence scores without throwing `TypeError: undefined is not an object` or displaying `NaN%`.

---

## 4. Phase F Integration Verification Verdict

- **Matrix Verification**: **PASS** (All 8 core workflows functionally integrated)
- **Data Serialization**: **PASS** (Pydantic to JSON to TypeScript without data loss)
- **State Synchronization**: **PASS** (Zero stale data leakage between tabs)
- **Known Defect**: **DEF-01** (Ledger verification endpoint fails when the shared production ledger contains sequence gaps).
