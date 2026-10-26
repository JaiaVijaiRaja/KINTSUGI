# KINTSUGI — Demonstration 2: Trust, Abstention, Evaluation & Error Recovery

## 1. Executive Summary & Objective

**Demo 2** proves that KINTSUGI prioritizes **safety, honesty, and trust above all else**.

In industrial automation and mission-critical telemetry, guessing a wrong value is vastly more dangerous than admitting uncertainty. A pipeline that silently interpolates across an 8-minute sensor blackout or overrides a genuine process anomaly could blind operators to an impending equipment failure.

Demo 2 directly demonstrates:
1. **Strict Abstention (`UNRESOLVED`)**: The pipeline refuses to invent values when evidence is insufficient, contradictory, or beyond safety bounds.
2. **Zero-MAD Constant Signal Handling**: Resilient numerical operations that do not crash on zero-variance streams.
3. **Controlled Ground-Truth Evaluation (Mode A Benchmark)**: Isolated benchmarking against separate, unpolluted clean telemetry to calculate mathematically sound F1, MAE, and RMSE metrics.
4. **Safe Error Recovery**: Input validation rejections (non-CSV formats, empty payloads, corrupted columns) fail cleanly and safely without exposing tracebacks or corrupting data.

---

## 2. Dataset Specification

- **File Path**: [`demo/difficult_cases_demo.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/difficult_cases_demo.csv)
- **Isolated Clean Baseline**: [`demo/difficult_cases_clean.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/difficult_cases_clean.csv)
- **Ground Truth Manifest**: [`demo/difficult_cases_ground_truth.json`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/difficult_cases_ground_truth.json)
- **Cadence**: 1-second intervals (60 observations total).
- **Channels**:
  - `timestamp`: UTC chronological index.
  - `temperature_bearing_c`: Gas turbine journal bearing temperature.
  - `vibration_drive_end_g`: Accelerometer vibration stream.
  - `pressure_feed_bar`: Lube oil manifold pressure.
  - `constant_signal_ma`: 4.00 mA constant current loop (zero-variance stream).

---

## 3. Strict Abstention Scenarios & Invariants

| Row Range | Channel | Injected Condition | Pipeline Decision | Status | Scientific Invariant |
|:---:|:---:|:---|:---|:---:|:---|
| **Row 0** | `temperature_bearing_c` | Boundary NaN reading | Abstain from repair | `UNRESOLVED` | **Extrapolation Invariant**: No left temporal anchor exists. Extrapolating without history is scientifically invalid. |
| **Rows 15–22** | `vibration_drive_end_g` | **8-row missing blackout** ($> \text{max\_gap\_size} = 5$) | Abstain across blackout | `UNRESOLVED` | **Gap Limit Invariant**: Interpolating across large gaps creates fictitious signals. The pipeline must declare a data loss event. |
| **Row 32** | `temperature_bearing_c` | Apparent thermal spike (125.0°C) with opposite residual on pressure sensor | Abstain due to contradictory evidence | `UNRESOLVED` | **Cross-Sensor Invariant**: When multi-sensor residual correlation contradicts the candidate repair, confidence score drops below threshold (0.70). |
| **Row 45** | `pressure_feed_bar` | Isolated spike in window with fewer than 3 valid neighbors | Abstain due to quorum failure | `UNRESOLVED` | **Neighbor Quorum Invariant**: Local statistical filtering requires at least 3 valid observations. |
| **All Rows** | `constant_signal_ma` | Exactly 4.00 mA constant signal ($\text{MAD} = 0.0$) | Retain raw measurement | `MEASURED` | **Zero-MAD Robustness**: Division by zero is prevented; normal readings are not erroneously flagged as anomalies. |

---

## 4. End-to-End Walkthrough

### Step 1: Open Demo 2
- Navigate to **"Live Demonstrations"** in the sidebar.
- Click the **"Demo 2: Trust, Abstention & Evaluation"** tab.

### Step 2: Run Real Pipeline
- Click **"Execute Real Pipeline"**.
- The backend validates the difficult-cases dataset, executes MAD + Isolation Forest detection, and applies strict reconstruction policies.
- Notice the KPI Summary Card:
  - **Unresolved (Abstained)**: Shows multiple abstentions.
  - Total accepted repairs are limited only to cases with high, unambiguous evidence.

### Step 3: Inspect the Unresolved Ledger
- In the **Results Ledger Table**, click the `UNRESOLVED` filter button.
- Inspect the **Decision Reason** column for each abstention:
  - *Rows 15–22*: *"Gap size (8) exceeds maximum allowed interpolation limit (5)."*
  - *Row 0*: *"Observation at row 0 has no valid preceding observation; extrapolation is strictly prohibited."*
  - *Row 32*: *"Cross-sensor corroboration penalty: supporting channels contradict the candidate estimate."*
- Highlight to judges:
  - **The raw measurements were NEVER altered or overwritten.**
  - **The pipeline honestly recorded `UNRESOLVED` rather than guessing.**

### Step 4: Run Mode A Ground Truth Benchmark
- Under the **"Isolated Ground Truth Benchmark (Mode A)"** card, click **"Run Benchmark"**.
- The backend evaluates the pipeline's detection and repair performance against the completely isolated ground truth baseline (`demo/difficult_cases_clean.csv`).
- Observe the genuine metrics calculated:
  - **Detection F1 Score**: Reflects precision and recall across injected faults.
  - **Repair MAE (Mean Absolute Error)**: Measured strictly on *successfully repaired* points where ground truth exists.
  - **Repair RMSE (Root Mean Squared Error)**: Quantifies repair quality without counting abstained points as 0 error.
- Point out to judges:
  - Undefined metrics are never silently replaced with 0.
  - Ground truth values were never provided to the repair algorithm during runtime.

### Step 5: Test Safe Error Recovery Sandbox
- Scroll to the **"Safe Error Recovery Sandbox"** card.
- Test 1: Click **"Test Non-CSV Upload"**.
  - Backend returns HTTP 400 Bad Request with:
    `"Unable to process this file. Please upload a supported CSV file."`
  - Verify: **Traceback Exposed: `false`**.
- Test 2: Click **"Test Empty File"**.
  - Backend returns HTTP 400 Bad Request with:
    `"The uploaded file contains no readable data. Please choose a valid dataset."`
  - Verify: **No internal file paths or secrets leaked**.
- Test 3: Click **"Test Missing Columns"**.
  - Backend returns HTTP 422 with:
    `"The dataset is missing one or more required columns. Review the selected timestamp and sensor columns."`

---

## 5. Judge Talk-Track & Key Takeaway

> **Judge Question**: *"Why is abstaining a feature? Shouldn't an AI pipeline repair all broken data?"*
>
> **Answer**:
> In aviation, power generation, and chemical refining, **a confident lie is catastrophic**.
> If a vibration sensor goes dead for 10 minutes while a turbine blade is cracking, a naive pipeline that linearly connects the dots will report smooth normal vibration, masking a catastrophic failure.
>
> KINTSUGI's core innovation is **confidence-awareness**:
> 1. When evidence is robust, it heals the signal (`CORRECTED`, `ESTIMATED`).
> 2. When evidence is insufficient, it strictly abstains (`UNRESOLVED`), preserves the raw observation, and alerts domain experts.
> 3. Every action is cryptographically recorded in an append-only SHA-256 ledger.
