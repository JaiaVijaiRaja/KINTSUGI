# KINTSUGI — Live Hackathon Demonstration Script

> **Estimated Presentation Time**: 5 to 7 minutes  
> **Target Audience**: Hackathon Judges, Industrial IoT Engineers, Chief Risk Officers  
> **Demonstration Fixture**: `demo/turbine_telemetry_demo.csv` (Deterministic 60-row industrial gas turbine telemetry)

---

## 1. Executive Hook: The Industrial Sensor-Data Problem (1 Minute)

> **Speaker Script**:
> *"In mission-critical industrial environments—like turbine plants, power distribution, and chemical reactors—sensor noise, frozen telemetry, and communication gaps corrupt operational decisions.*
> 
> *Traditional pipelines make two fatal mistakes:*
> 1. *They silently overwrite physical measurements with synthetic estimates, destroying evidence.*
> 2. *They hallucinate corrections even when evidence is completely broken or ambiguous.*
> 
> *Welcome to **KINTSUGI**—inspired by the Japanese art of repairing ceramics with gold lacquer. KINTSUGI treats signal repairs with full transparency: **raw measured telemetry is never overwritten or discarded**. Every repair carries an evidence-based confidence score, and when evidence is insufficient, KINTSUGI strictly **abstains from guessing**."*

---

## 2. Step-by-Step Live Walkthrough (4-5 Minutes)

### Step 1: System Overview & Live Health (30 Seconds)
1. Open browser to `http://localhost:5173/overview`.
2. Point out:
   - **Backend API Health Card**: Live roundtrip latency probing the FastAPI service (`/api/health`).
   - **Pipeline Operational Metrics**: Active count of registered datasets, pipelines, and historical repairs.
   - **Non-Negotiable Invariants Banner**: Raw data immutability and the 4 strict statuses (`MEASURED`, `ESTIMATED`, `CORRECTED`, `UNRESOLVED`).

---

### Step 2: Dataset Ingestion & Quality Audit (45 Seconds)
1. Click **Dataset Management** in the sidebar (or navigate to `/datasets`).
2. Drag and drop `demo/turbine_telemetry_demo.csv` onto the upload dropzone.
3. Show the immediate server feedback:
   - Filename: `turbine_telemetry_demo.csv`
   - Total Observations: `60 rows • 5 columns`
   - SHA-256 Digest calculated and stored in `storage/datasets/ds_.../`
4. Click **Inspect** to open the **Data Quality Audit**:
   - Point out missing cell detection (3 missing values in `vibration_drive_end_g`).
   - Show timestamp candidate detection with ISO-8601 validation (`timestamp`).
   - Show the interactive tabular row preview with 10–50 row paging.

---

### Step 3: Pipeline Configuration & Boundary Policy (45 Seconds)
1. Click **Pipeline Configuration** (`/pipeline`).
2. Select the uploaded dataset `turbine_telemetry_demo.csv`.
3. Highlight the configuration parameters:
   - **Timestamp Column**: `timestamp`
   - **Sensor Channels**: `temperature_bearing_c`, `vibration_drive_end_g`
   - **Ignored Channels**: `ambient_temp_c`, `pressure_feed_bar`
   - **Detection Rules**: Statistical Rolling MAD (window: 15, threshold: 3.0) + Isolation Forest (contamination: 0.05).
   - **Reconstruction Policy**: Chronological linear interpolation, max gap size: 5, auto-accept threshold: 0.70.
4. Click **Save Pipeline Configuration**.
5. Show the green confirmation banner: `"Configuration Saved: ID pipe_..."` and click the quick action **"Proceed to Anomaly Detection &rarr;"**.

---

### Step 4: Multi-Detector Anomaly Explorer (60 Seconds)
1. In **Anomaly Explorer** (`/anomalies`), select the saved pipeline.
2. Click **Run Real Detection**.
3. Point out:
   - Real-time execution against stored sensor CSV: ~15ms execution time.
   - Summary KPI cards: Flagged anomaly counts, detector consensus breakdown.
   - **Interactive SVG Time-Series Chart**: Point out the yellow/red anomaly markers hovering over the physical sensor curves.
   - Find **Row 12**: Point out the isolated thermal spike on `temperature_bearing_c` (reading **92.5 °C** against nominal ~52.3 °C).
4. Click **Inspect** on Row 12 to see detector agreement: both MAD and Isolation Forest flagged the outlier.

---

### Step 5: Confidence-Aware Reconstruction Studio & Abstention (90 Seconds)
1. Click **Reconstruction Studio** (`/reconstruction`).
2. Select the completed detection run and click **Start Reconstruction Run**.
3. Point out the core differentiator:
   - **Row 12 Inspection (Successful Repair)**:
     - Original Raw Measurement: `92.50 °C` (preserved!)
     - Proposed Reconstructed Value: `~52.35 °C` (interpolated from valid temporal brackets)
     - Confidence Score: `~88 / 100` (High Confidence)
     - Status: `CORRECTED` (Auto-Accepted under threshold $\ge 0.70$).
     - Factor Decomposition: Show the 6 transparent sub-scores (neighbor density: 25/25, temporal proximity: 20/20, stability: 15/15).
   - **Row 0 / Boundary Observation (Strict Abstention Demonstration)**:
     - Show an anomaly occurring at the dataset boundary or broken gap limit.
     - Status: **`UNRESOLVED`**.
     - System rationale: *"Boundary extrapolation is strictly prohibited by safety policy. System declined to guess."*
4. Highlight human operator review:
   - Open any observation, enter an operator comment (`"Approved during turbine unit test"`), and commit an immutable review decision (`ACCEPT`).

---

### Step 6: Controlled Benchmark Evaluation (45 Seconds)
1. Click **Evaluation Center** (`/evaluation`).
2. Select **Run Benchmark Evaluation (Mode A)** with reproducible seed `42`.
3. Click **Execute Controlled Benchmark**:
   - The engine injects controlled synthetic faults into an isolated benchmark dataset copy (`ds_bm_...`).
   - The original dataset remains completely unaltered (verified via SHA-256).
4. Show the genuine quantitative metrics:
   - **Confusion Matrix**: True Positives, False Positives, True Negatives, False Negatives.
   - **Detection Metrics**: Precision, Recall, F1 Score.
   - **Signal Repair Accuracy**: Reconstruction MAE and RMSE.
   - Point out that denominator edge cases return `None` (undefined) rather than deceptive `0.0`.

---

### Step 7: Cryptographic Audit Trail & Provenance Trace (45 Seconds)
1. Click **Audit Trail** (`/audit`).
2. Show the append-only ledger:
   - Chronological sequence numbers (`#1, #2, #3...`).
   - Every state transition (`DATASET_UPLOADED`, `PIPELINE_CREATED`, `OBSERVATION_CORRECTED`).
3. Point out the **Cryptographic Integrity Panel**:
   - Click **Verify Hash Chain**.
   - Show: `"SHA-256 Hash Chain Integrity: VERIFIED (100% untampered continuity)"`.
4. Open the **Causal Lineage Search** for Row 12:
   - Show the 5-step causal graph: `Source Observation -> Detector Execution -> Anomaly Flag -> Reconstruction Proposal -> Confidence Factor Decomposition -> Final Commitment`.
5. Export compliance report: Click **Download Verified CSV Export**.

---

## 3. Concluding Summary (30 Seconds)

> **Speaker Script**:
> *"KINTSUGI solves the trust deficit in industrial AI.
> 
> By preserving raw measurements permanently, decomposing confidence into verifiable physical factors, enforcing strict abstention, and sealing every decision in an append-only SHA-256 ledger, KINTSUGI delivers an industrial data-quality pipeline that engineers and regulators can genuinely rely on.
> 
> Thank you, and we welcome your questions."*
