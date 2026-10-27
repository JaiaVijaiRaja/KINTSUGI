# KINTSUGI Demonstration Datasets (`demo_data/`)

## 1. Overview and Provenance Notice

This directory contains deterministic demonstration datasets for evaluating and demonstrating the **KINTSUGI — Confidence-Aware Self-Healing Industrial Data Pipeline**.

> **[IMPORTANT] Provenance & Integrity Notice**  
> These datasets are **100% synthetically generated** using deterministic mathematical physics models (sinusoidal rotating machinery harmonics, thermal inertia baselines, Gaussian measurement dispersion, and controlled fault injection).  
> **They are NOT recordings from a live operational power plant, refinery, or commercial facility.**  
> Ground-truth labels are stored in separate manifest files (`*_ground_truth.json`) and isolated clean copies (`*_clean.csv`). The processing pipeline ingests ONLY the corrupted input CSV files and has **no runtime access** to ground-truth values during anomaly detection, signal reconstruction, or status assignment.

---

## 2. Dataset Catalog

| Dataset File | Isolated Clean Baseline | Ground Truth Manifest | Scenario & Primary Purpose |
| :--- | :--- | :--- | :--- |
| [`industrial_recoverable_faults.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_recoverable_faults.csv) | [`industrial_recoverable_clean.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_recoverable_clean.csv) | [`recoverable_ground_truth.json`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/recoverable_ground_truth.json) | **Dataset A: Recoverable Faults (Demo 1)**<br>Demonstrates successful, justified automated reconstruction on turbine telemetry with high-confidence evidence. |
| [`industrial_ambiguous_faults.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_ambiguous_faults.csv) | [`industrial_ambiguous_clean.csv`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/industrial_ambiguous_clean.csv) | [`ambiguous_ground_truth.json`](file:///c:/WORK%20LAB-SL19/Workstation/MY%20PROJECT/ANTIGRAVITY/HORIZONXT26/demo_data/ambiguous_ground_truth.json) | **Dataset B: Ambiguous Faults (Demo 2)**<br>Demonstrates confidence-aware abstention (`UNRESOLVED`) when evidence is insufficient, contradictory, or beyond safety bounds. |

---

## 3. Schema & Physical Channel Specifications

Both datasets share the standardized industrial telemetry schema:
* **Row Count**: 60 rows (cadence: 1-minute intervals).
* **Format**: Comma-Separated Values (CSV), RFC 4180 compliant, UTF-8 encoded.

### Channels & Engineering Units

1. **`timestamp`** (ISO-8601 UTC)  
   Chronological sequence (e.g. `2026-10-24 08:00:00+00:00` to `08:59:00+00:00`). Uniform 1-minute interval.
2. **`temperature_bearing_c`** (Degrees Celsius, °C)  
   Gas turbine journal bearing temperature. Nominal range: `63.0°C – 68.5°C`. Thermal time constant ~5 minutes.
3. **`vibration_drive_end_g`** (Acceleration, g RMS)  
   Drive-end bearing accelerometer amplitude. Nominal range: `2.0 g – 3.0 g`. Positively correlated with turbine rotational load.
4. **`pressure_feed_bar`** (Pressure, bar)  
   Lube oil feed manifold hydraulic pressure. Nominal range: `4.0 bar – 4.35 bar`.
5. **`ambient_temp_c`** (Degrees Celsius, °C)  
   Ambient inlet air temperature. Nominal: `~22.0°C`. Configured as an auxiliary / ignored channel in pipeline mapping.

---

## 4. Dataset A: Recoverable Faults Specification

### Purpose
Proves KINTSUGI's core self-healing capability when valid neighboring and multi-sensor evidence exists to mathematically justify a replacement.

### Injected Fault Matrix

| Row Index | Channel | Injected Value | Ground Truth | Fault Type | Pipeline Expectation | Confidence Rationale |
|:---:|:---|:---:|:---:|:---|:---:|:---|
| **0** | `vibration_drive_end_g` | `NaN` (Missing) | `2.95 g` | Boundary Missing | `UNRESOLVED` | Prohibited extrapolation; no preceding neighbor exists. |
| **12** | `temperature_bearing_c` | `158.4°C` | `67.48°C` | Impulse Thermal Spike | `CORRECTED` | Extreme residual ($>3.0\times\text{MAD}$); cleanly bracketed by valid neighbors at rows 11 & 13. |
| **24** | `vibration_drive_end_g` | `NaN` (Missing) | `2.53 g` | Packet Drop (Gap 1/3) | `ESTIMATED` | 3-row gap is within `max_gap_size=5`; valid anchors at row 23 & row 27. |
| **25** | `vibration_drive_end_g` | `NaN` (Missing) | `2.50 g` | Packet Drop (Gap 2/3) | `ESTIMATED` | Interpolated across 3-sample gap with high temporal proximity score. |
| **26** | `vibration_drive_end_g` | `NaN` (Missing) | `2.51 g` | Packet Drop (Gap 3/3) | `ESTIMATED` | Interpolated across 3-sample gap with high temporal proximity score. |
| **36–39** | `pressure_feed_bar` | `4.215 bar` (Fixed) | Dynamic `4.18–4.24` | Frozen Transducer | `CORRECTED` | Flagged by multi-detector consensus; reconstructed from local temporal moving median. |

---

## 5. Dataset B: Ambiguous Faults Specification

### Purpose
Proves that KINTSUGI strictly **abstains from guessing** (`UNRESOLVED`) when evidence is inadequate, conflicting, or beyond mathematical safety limits, while preserving original values intact.

### Injected Challenge Matrix

| Row Index | Channel | Injected Value | Ground Truth | Challenge Condition | Pipeline Expectation | Decision Invariant |
|:---:|:---|:---:|:---:|:---|:---:|:---|
| **0** | `vibration_drive_end_g` | `NaN` (Missing) | `2.10 g` | Boundary NaN | `UNRESOLVED` | **Extrapolation Invariant**: Extrapolation without preceding history is scientifically unsound. |
| **15–22** | `temperature_bearing_c` | 8 consecutive `NaN` | `56.0–61.0°C` | Continuous Blackout | `UNRESOLVED` | **Gap Limit Invariant**: 8-row gap exceeds `max_gap_size=5`. Linear interpolation across wide outages creates hallucinated data. |
| **32** | `temperature_bearing_c` | `135.0°C` | `61.8°C` | Conflicting Sensors | `UNRESOLVED` | **Cross-Sensor Invariant**: Companion vibration and pressure remain at idle baseline. Opposing residual triggers severe penalty, dropping evidence below threshold (0.70). |
| **43, 44, 45, 46, 47** | `vibration_drive_end_g` | `NaN` cluster | `2.0–2.3 g` | Sparse Neighborhood | `UNRESOLVED` | **Quorum Invariant**: Fewer than 3 valid neighbors available in window; local median quorum fails. |
| **50–59** | `pressure_feed_bar` | `4.00 bar` (Constant) | `4.00 bar` | Constant Signal | `MEASURED` | **Zero-MAD Robustness**: Zero variance stream does not cause division-by-zero or false anomaly trigger. |

---

## 6. Benchmark Limitations

1. **Synthetic Nature**: Generated using closed-form trigonometric and stochastic processes. Performance on this benchmark demonstrates algorithm correctness, not guaranteed physical accuracy on real hardware.
2. **Fixed Cadence**: Assumes uniform 1-minute sampling intervals without packet reordering.
3. **No Ground Truth Leakage**: These CSV files do not contain target labels or indicators. All predictions and repairs are computed purely from raw signal values.
