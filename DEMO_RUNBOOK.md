# KINTSUGI — Live Demonstration Runbook

## Executive Summary

This runbook guides operators, judges, and evaluators through two repeatable live demonstrations of **KINTSUGI — Confidence-Aware, Self-Healing Industrial Data Pipeline**.

Every metric, detection result, reconstruction value, and audit hash shown in these demonstrations is computed **live by the actual backend engine**. No mocked data, synthetic metrics, or fabricated outcomes are used.

---

## Pre-Demo Checklist

1. **Start Application**: Run the launcher from a fresh terminal:
   ```powershell
   powershell -ExecutionPolicy Bypass -File .\run.ps1
   ```
2. **Confirm Readiness**:
   - Browser opens to [http://localhost:5173](http://localhost:5173).
   - Backend health check at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) returns `status: "healthy"`.
3. **Locate Demonstration Datasets**:
   - `demo_data/industrial_recoverable_faults.csv` (Demo 1)
   - `demo_data/industrial_ambiguous_faults.csv` (Demo 2)

---

# DEMONSTRATION 1 — Automated Recovery & Self-Healing Telemetry

### Core Theme
**"Self-healing with mathematical justification: fixing what can be proven, abstaining when it cannot."**

### Dataset
[`demo_data/industrial_recoverable_faults.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_recoverable_faults.csv) (60 rows, 1-minute gas turbine telemetry).

---

### Step-by-Step Procedure

#### Step 1: Upload & Ingest
1. Navigate to the **Datasets** tab.
2. Click **Upload CSV** and select `demo_data/industrial_recoverable_faults.csv` (or click **Load Preloaded Demo 1**).
3. **Highlight to Judges**:
   - Exact row count: **60 rows**, 5 columns (`timestamp`, `temperature_bearing_c`, `vibration_drive_end_g`, `pressure_feed_bar`, `ambient_temp_c`).
   - Immutable ingestion: An unalterable SHA-256 fingerprint is immediately calculated and stored.

#### Step 2: Configure the Industrial Pipeline
1. Navigate to the **Pipelines** tab.
2. Select the ingested dataset.
3. Verify sensor mapping:
   - Primary Sensors: `temperature_bearing_c`, `vibration_drive_end_g`, `pressure_feed_bar`.
   - Ignored / Auxiliary: `ambient_temp_c`.
4. Configure algorithms:
   - **Statistical MAD**: Window size = 15, Threshold = 3.0× MAD, Min observations = 10.
   - **Isolation Forest**: Contamination = 0.05, Min observations = 50.
   - **Reconstruction**: Linear interpolation allowed, Max gap = 5 samples, Automatic correction permitted.
   - **Confidence Policy**: Acceptance threshold = 70.0% (0.70).
5. Click **Save & Register Pipeline**.

#### Step 3: Run Real Anomaly Detection
1. Click **Execute Detection Run**.
2. **Inspect Results**:
   - The detector engine evaluates trailing rolling median MAD dispersion and multivariate isolation trees.
   - Consensus anomalies are flagged with explicit severity (`CRITICAL`, `HIGH`, `MEDIUM`).
   - Observe **Row 12**: extreme thermal spike (`158.4°C` vs nominal `~67°C`) is flagged simultaneously by both statistical MAD and Isolation Forest (`MULTI_DETECTOR` consensus).

#### Step 4: Execute Self-Healing Reconstruction
1. Click **Reconstruct Anomalies**.
2. **Review Self-Healing Outcomes**:
   - **Row 12 (Bearing Temperature Spike)**:
     - Original: `158.40°C`
     - Final Repaired: `67.10°C`
     - Status: `CORRECTED`
     - Method: `linear_interpolation`
     - Confidence Score: `90.0%` (bracketed by valid finite anchors at row 11 and row 13, confirmed by low local dispersion).
   - **Rows 24–26 (Vibration Packet Drop)**:
     - 3-consecutive missing samples are cleanly interpolated across the gap (gap size 3 <= 5).
     - Status: `CORRECTED` (or `ESTIMATED`).
   - **Row 0 (Boundary Missing Observation)**:
     - Target: `vibration_drive_end_g` at row 0 is missing (`NaN`).
     - Status: **`UNRESOLVED`**!
     - Reason: *"Observation at row 0 has no valid preceding observation; extrapolation is strictly prohibited."*
     - **Key Judge Point**: Even in a recoverable dataset, KINTSUGI strictly refuses to hallucinate data backwards into the past.

#### Step 5: Cryptographic Audit Trail & Safe Export
1. Navigate to the **Audit** tab:
   - Verify each detection, reconstruction, and review event has generated an append-only SHA-256 hash record.
   - Click **Verify Hash Chain** to prove cryptographic integrity.
2. Click **Export Processed Dataset (CSV)**:
   - Open the exported CSV.
   - Point out that raw values are preserved in original columns (`temperature_bearing_c`).
   - Repaired values appear in `temperature_bearing_c_repaired`.
   - Every row carries an explicit provenance status: `MEASURED`, `CORRECTED`, or `UNRESOLVED`.

---

# DEMONSTRATION 2 — Confidence-Aware Abstention & Safety Invariants

### Core Theme
**"The hallmark of industrial-grade AI is knowing when to abstain. Safety means never guessing without evidence."**

### Dataset
[`demo_data/industrial_ambiguous_faults.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_ambiguous_faults.csv) (60 rows, industrial edge cases).

---

### Step-by-Step Procedure

#### Step 1: Upload & Configure
1. Navigate to **Datasets** and upload `demo_data/industrial_ambiguous_faults.csv` (or click **Load Preloaded Demo 2**).
2. Configure the pipeline with `max_gap_size = 5` and `review_threshold = 0.70`.

#### Step 2: Execute Pipeline & Review Strict Abstentions
1. Click **Execute Detection** then **Reconstruct**.
2. **Demonstrate KINTSUGI's Four Core Safety Invariants**:

   | Invariant | Row(s) | Channel | Condition | Pipeline Decision | Explanation |
   | :--- | :---: | :--- | :--- | :---: | :--- |
   | **1. Gap Limit Violation** | **15–22** | `temperature_bearing_c` | 8 consecutive missing readings | **`UNRESOLVED`** | Gap of 8 samples exceeds `max_gap_size=5`. Linear interpolation across wide outages is mathematically invalid. |
   | **2. Boundary Extrapolation** | **0** | `vibration_drive_end_g` | Missing reading at first row | **`UNRESOLVED`** | No preceding observation exists. Extrapolation is strictly prohibited. |
   | **3. Sensor Contradiction** | **32** | `temperature_bearing_c` | Apparent thermal spike (`135.0°C`) | **`UNRESOLVED`** | Companion vibration and pressure remain at idle baseline. Physical cross-sensor penalty drops confidence below threshold. |
   | **4. Sparse Neighborhood** | **45** | `vibration_drive_end_g` | Clustered missing readings | **`UNRESOLVED`** | Fewer than 3 valid neighbors available in the evaluation radius. Local median quorum fails. |

3. **Demonstrate Zero-MAD Robustness**:
   - Inspect rows **50–59** (`pressure_feed_bar` constant signal at 4.00 bar).
   - Point out that zero variance did NOT cause division-by-zero, detector crash, or false anomaly cascades. Status remains nominal `MEASURED`.

#### Step 3: Raw Data Immutability & Safe Export
1. Verify in disk storage (`storage/datasets/{id}/data.csv`) that the original file SHA-256 is bit-for-bit identical to its pre-processing state.
2. Export the processed CSV:
   - Show that unresolved rows retain their original raw readings without destructive overwriting.
   - Unresolved rows are transparently labeled `UNRESOLVED` with the mathematical cause permanently logged.

---

## Judge Talk-Track & Key Soundbites

1. **On Immutability**:  
   *"KINTSUGI treats industrial sensor telemetry as an immutable system of record. Reconstructions are proposals with provenance, never destructive in-place mutations."*
2. **On Safety vs Hallucination**:  
   *"In consumer AI, a bad guess is an inconvenience. In a 500-megawatt turbine, a bad guess trips a false scram or masks bearing failure. KINTSUGI's core design goal is justified abstention."*
3. **On Confidence as Evidence**:  
   *"Our confidence score is a heuristic index from 0 to 100 based on temporal gap, neighbor dispersion, and cross-sensor corroboration. We explicitly do NOT claim it is a calibrated Bayesian probability."*
4. **On Auditability**:  
   *"Every repair and every abstention produces an append-only SHA-256 hash record. Operators can trace exactly which algorithm touched a value, who reviewed it, and why."*

---

## Troubleshooting Guide

| Issue | Root Cause | Immediate Resolution |
| :--- | :--- | :--- |
| **Port 8000 or 5173 occupied** | Previous session left running | Rerun `powershell -ExecutionPolicy Bypass -File .\run.ps1` (it auto-cleans old processes), or terminate via `Stop-Process -Id (Get-NetTCPConnection -LocalPort 8000 -State Listen).OwningProcess -Force`. |
| **Browser doesn't open** | Default browser association issue | Manually open [http://localhost:5173](http://localhost:5173). |
| **Backend unavailable** | Virtualenv path or python crash | Verify `backend\.venv` exists; check terminal output for error trace. |
| **Upload rejects file** | Non-CSV format or file > 50MB | Upload valid `.csv` meeting schema; review error message banner in UI. |
| **Export file empty** | Run ID not selected | Ensure reconstruction run completed successfully before clicking export. |
