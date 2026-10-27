# KINTSUGI — System Performance & Resource Usage Audit

**Audit Date**: October 27, 2026  
**Auditor**: Senior Performance Engineer & Systems Profiler  
**Audit Scope**: Pipeline Stage Latencies, CPU Profile, ML Fitting Overhead, and UI Timeout Correlation  
**Status**: VERIFIED & RECONCILED (Read-Only Audit Phase)

---

## 1. Measured Pipeline Latency Benchmarks

Benchmarked using [audit/run_performance_benchmark.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/audit/run_performance_benchmark.py) on Demo 1 industrial telemetry (240 rows, 4 continuous sensor channels):

| Pipeline Stage | Implementation Component | Measured Latency | Latency Share (%) |
|---|---|:---:|:---:|
| **1. File Ingestion & Byte Profiling** | `dataset_service.ingest_dataset_bytes` | `279.38 ms` | 0.6% |
| **2. Pipeline Configuration Validation** | `pipeline_service.create_pipeline_config` | `132.40 ms` | 0.3% |
| **3. Anomaly Detection (MAD + IF)** | `detection_service.execute_detection_run` | `21,804.21 ms` (~21.8s) | 48.5% |
| **4. Contextual Signal Reconstruction** | `reconstruction_service.execute_reconstruction_run` | `22,716.30 ms` (~22.7s) | 50.5% |
| **5. Side-by-Side Export Serialization** | `reconstruction_service.export_reconstructed_dataset` | `16.16 ms` | <0.1% |
| **Total Full-Pipeline Execution Time** | **Complete Processing Chain** | **`44,948.44 ms` (~44.9s)** | **100.0%** |

---

## 2. Bottleneck Analysis & Execution Profiling

### 2.1 Anomaly Detection Stage (21.8s)
- **Component**: [app/services/detectors/isolation_forest.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/services/detectors/isolation_forest.py)
- **Bottleneck**: `IsolationForest(n_estimators=100)` is instantiated and fitted on-the-fly per sensor channel across all rows.
- **Impact**: While scikit-learn's tree builder provides robust multivariate outlier isolation, fitting 100 trees iteratively across multiple channels on CPU takes ~5–6s per channel on a Windows workstation.
- **Finding**: Rolling MAD takes $< 50\text{ms}$; over $99\%$ of detection latency is spent inside Isolation Forest fitting.

### 2.2 Reconstruction & Evidence Scoring Stage (22.7s)
- **Component**: [app/services/reconstruction/cross_sensor.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/services/reconstruction/cross_sensor.py) & [confidence.py](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/backend/app/services/reconstruction/confidence.py)
- **Bottleneck**: For each flagged anomaly candidate (180 candidates in Demo 1), the engine slices surrounding nominal samples and recalculates pairwise Pearson correlation coefficients $\|r\|$ against all other sensors.
- **Impact**: 180 candidate cells $\times$ pairwise correlation calculations $\times$ local dispersion MAD = ~22.7s.

---

## 3. Correlation with Defect DEF-02 (Playwright Selector Timeout)

In `frontend/e2e/11_demo_datasets_upload_and_pipeline.spec.ts`:
```typescript
await expect(page.locator('text=Total Anomalies')).toBeVisible({ timeout: 35000 });
```
- **Auditor Discovery**: The browser test expects the pipeline to complete within 35 seconds.
- **Actual Measured Pipeline Time**: **44.95 seconds**.
- **Root Cause**: The test timed out at 35.0s while the backend was still actively processing the reconstruction stage. The request succeeded 10 seconds later, but the test had already aborted.
- **Remediation**:
  1. Increase Playwright selector timeout to 60s for full end-to-end ML pipeline runs.
  2. Optimize cross-sensor correlation by precomputing the global pairwise nominal correlation matrix once per run rather than inside each cell iteration loop.

---

## 4. Phase J Performance Verification Verdict

- **File Ingestion & Export**: **PASS (EXCELLENT)** ($<300\text{ms}$)
- **Statistical Detector Latency**: **PASS (EXCELLENT)** ($<50\text{ms}$)
- **ML & Reconstruction Latency**: **PARTIAL (COMPUTE-BOUND)** (~44.9s for full multi-sensor run)
- **Identified Defect**: **DEF-02** (E2E test timeout exceeds actual pipeline computation time).
