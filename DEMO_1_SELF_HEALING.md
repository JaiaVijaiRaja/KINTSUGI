# KINTSUGI — Demonstration 1: Self-Healing Industrial Sensor Data

## 1. Executive Summary & Objective

**Demo 1** proves KINTSUGI's core mission: self-healing industrial telemetry with complete mathematical transparency and permanent provenance.

Operating on a continuous stream of real gas turbine monitoring telemetry (60 observations of temperature, vibration, and feed pressure), Demo 1 illustrates how KINTSUGI:
1. Validates high-frequency CSV telemetry without schema or type assumptions.
2. Identifies anomalous readings via dual-detector consensus (Rolling Median Absolute Deviation & unsupervised Isolation Forest).
3. Contextually reconstructs corrupt readings using chronologically sound linear interpolation.
4. Preserves 100% of original raw telemetry in immutable storage.
5. Emits an evidence-based heuristic confidence score (e.g., `88/100`) accompanied by an explicit non-probabilistic disclaimer.
6. Records an immutable SHA-256 cryptographic audit record for every corrected observation.
7. Exports repaired telemetry to CSV with side-by-side `{sensor}_raw`, `{sensor}_repaired`, `{sensor}_status`, `{sensor}_method`, and `{sensor}_confidence`.

---

## 2. Dataset Specification

- **File Path**: [`demo/turbine_telemetry_demo.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/turbine_telemetry_demo.csv)
- **Isolated Clean Baseline**: [`demo/turbine_telemetry_clean.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/turbine_telemetry_clean.csv)
- **Ground Truth Manifest**: [`demo/ground_truth_manifest.json`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo/ground_truth_manifest.json)
- **Cadence**: 1-second intervals (60 observations total).
- **Channels**:
  - `timestamp`: ISO-8601 UTC chronological timestamps (`2026-03-30T14:00:00Z` to `14:00:59Z`).
  - `temperature_bearing_c`: Gas turbine journal bearing temperature (°C), nominal steady state ~67.0°C.
  - `vibration_drive_end_g`: Accelerometer vibration amplitude (g), nominal RMS ~1.45 g.
  - `pressure_feed_bar`: Lube oil feed manifold pressure (bar), nominal ~4.20 bar.
  - `ambient_temp_c`: Ambient intake air temperature (°C) — ignored column.

---

## 3. Injected Faults & Pipeline Outcomes

| Row | Timestamp | Channel | Raw Value | Clean Truth | Injected Fault Type | Pipeline Status | Repaired Value | Confidence | Decision Reason / Method |
|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---|
| **0** | 14:00:00Z | `vibration_drive_end_g` | `NaN` (Missing) | 1.442 g | Missing Boundary Reading | `UNRESOLVED` | `NaN` (Unchanged) | N/A | Row 0 has no valid preceding neighbor; extrapolation strictly prohibited. |
| **12** | 14:00:12Z | `temperature_bearing_c` | **158.42°C** | 67.12°C | Extreme Positive Thermal Spike | `CORRECTED` | **67.14°C** | **88 / 100** | Dual consensus (MAD + IF); linear interpolation between valid neighbors. |
| **24** | 14:00:24Z | `vibration_drive_end_g` | `NaN` (Missing) | 1.451 g | Communication Drop (Gap 1/3) | `ESTIMATED` | **1.455 g** | **84 / 100** | Linear interpolation across 3-sample gap within max limit (5). |
| **25** | 14:00:25Z | `vibration_drive_end_g` | `NaN` (Missing) | 1.448 g | Communication Drop (Gap 2/3) | `ESTIMATED` | **1.458 g** | **84 / 100** | Linear interpolation across 3-sample gap within max limit (5). |
| **26** | 14:00:26Z | `vibration_drive_end_g` | `NaN` (Missing) | 1.463 g | Communication Drop (Gap 3/3) | `ESTIMATED` | **1.462 g** | **84 / 100** | Linear interpolation across 3-sample gap within max limit (5). |
| **38** | 14:00:38Z | `pressure_feed_bar` | **0.12 bar** | 4.21 bar | Cavitation Sensor Glitch | `CORRECTED` | **4.20 bar** | **91 / 100** | Rolling MAD outlier detection; healed via local temporal neighbors. |
| **Others** | — | All Sensors | Nominal | Nominal | Normal Telemetry | `MEASURED` | Original | N/A | Within bounds; raw measurement retained. |

---

## 4. End-to-End Demonstration Walkthrough

### Step 1: Launch Services
1. **Backend**:
   ```powershell
   .\backend\.venv\Scripts\uvicorn.exe app.main:app --port 8000 --reload
   ```
2. **Frontend**:
   ```powershell
   cd frontend
   npm run dev
   ```
3. Open browser at `http://localhost:5173`.

### Step 2: Open Demo 1
- Click on **"Live Demonstrations"** in the sidebar navigation or click **"Run Demo"** on the System Overview card.
- Ensure the **"Demo 1: Self-Healing Telemetry"** tab is selected.

### Step 3: Preview the Dataset
- Click **"Preview Dataset"**.
- Point out to judges:
  - The dataset is ingested through the real backend API: `POST /api/datasets/load-demo`.
  - The backend validates the schema, checks finite values, calculates SHA-256 dataset hash, and records the dataset in the persistent metadata registry.
  - The preview table shows 60 rows with the 3 active industrial channels and timestamps.

### Step 4: Execute Real Pipeline
- Click **"Execute Real Pipeline"**.
- Watch the live progress indicator advance through 4 genuine pipeline stages:
  1. *Stage 1/4*: Ingesting and profiling demo telemetry.
  2. *Stage 2/4*: Registering detection bounds & reconstruction policies (`POST /api/pipelines`).
  3. *Stage 3/4*: Running statistical Rolling MAD & Isolation Forest (`POST /api/pipelines/{id}/run`).
  4. *Stage 4/4*: Contextual signal healing and confidence scoring (`POST /api/pipelines/{id}/runs/{det_run_id}/reconstruct`).

### Step 5: Inspect Healed Observation Results
- Review the KPI Summary Cards:
  - **Total Processed**: 60 observations evaluated.
  - **Corrected (Accepted)**: 2 thermal / pressure spikes safely repaired.
  - **Estimated**: 3 missing communication gap samples filled.
  - **Unresolved (Abstained)**: 1 boundary observation safely abstained.
  - **Mean Evidence Score**: ~86/100 across healed readings.
- Examine the **Results Ledger Table**:
  - Filter by `CORRECTED` — Highlight **Row 12**:
    - Raw Original: `158.42°C` (abnormal excursion).
    - Repaired Output: `~67.14°C`.
    - Evidence Score: `88 / 100` (Heuristic score, not a probability).
    - Method: `linear_interpolation`.
  - Filter by `UNRESOLVED` — Highlight **Row 0**:
    - Raw Value: `NaN`.
    - Repaired Output: `NaN` (Raw retained).
    - Status: `UNRESOLVED`.
    - Decision Reason: *"Observation at row 0 has no valid preceding observation; extrapolation is strictly prohibited."*
    - Show judges that KINTSUGI refuses to invent numbers at sequence boundaries!

### Step 6: Export Results
- Click **"Export Repaired CSV"**.
- The backend serves `GET /api/reconstruction/runs/{id}/export?format=csv`.
- Inspect the downloaded CSV to prove that raw readings, repaired values, statuses, methods, and evidence scores are all present in separate, non-destructive columns.
- Click **"Export Audit Trail"** to download the JSON causal lineage.

---

## 5. Judge Talk-Track & Verification Script

> **Judge Question**: *"How do we know this isn't just a mock frontend or a hardcoded curve?"*
>
> **Answer**:
> 1. Open Browser Network Tab (F12) and reload or re-run the pipeline.
> 2. Observe the live HTTP calls:
>    - `POST /api/datasets/load-demo` $\to$ Returns real `dataset_id`.
>    - `POST /api/pipelines` $\to$ Registers configuration with unique UUID.
>    - `POST /api/pipelines/{id}/run` $\to$ Spawns actual Python subprocess executing Rolling MAD & scikit-learn Isolation Forest.
>    - `POST /api/pipelines/{id}/runs/{id}/reconstruct` $\to$ Executes interpolation algorithm and confidence formula.
>    - `GET /api/reconstruction/runs/{id}/export` $\to$ Streams real CSV generated on the fly.
> 3. Check the audit ledger: Every single corrected observation generated a SHA-256 hashed ledger record verifiable at `GET /api/audit/verify`.
