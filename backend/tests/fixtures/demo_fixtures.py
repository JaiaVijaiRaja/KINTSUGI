"""
Deterministic demonstration datasets and ground-truth generators for KINTSUGI:
- Demo 1: Self-Healing Industrial Sensor Data (turbine_telemetry_demo.csv)
- Demo 2: Trust, Abstention, Hard Cases & Evaluation (difficult_cases_demo.csv)

All generators use deterministic random seeds, isolate ground truth, and document physical units.
"""

import io
import math
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd


def generate_demo1_turbine_telemetry(
    n_rows: int = 60, seed: int = 101
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Generate Demo 1 dataset: Self-Healing Industrial Gas Turbine Telemetry.
    Contains:
    1. Valid measurements (nominal baseline with sinusoidal harmonics and noise).
    2. Missing readings (packet loss on vibration channel).
    3. Localized suspicious spike (impulse thermal excursion at row 12).
    4. Suitable reconstruction cases (row 12 spike and rows 24-25 missing).
    5. At least one strict abstention case (row 0 boundary missing value).
    6. Frozen transducer output (rows 36-39 on pressure feed).
    """
    rng = np.random.default_rng(seed)

    base_ts = pd.Timestamp("2026-10-24 08:00:00", tz="UTC")
    timestamps = [str(base_ts + pd.Timedelta(minutes=i)) for i in range(n_rows)]

    clean_data: Dict[str, List[Any]] = {
        "timestamp": timestamps,
        "temperature_bearing_c": [],
        "vibration_drive_end_g": [],
        "pressure_feed_bar": [],
        "ambient_temp_c": [],
    }

    for i in range(n_rows):
        t_val = 65.0 + 3.2 * math.sin(i / 5.0) + float(rng.normal(0, 0.15))
        v_val = 2.5 + 0.45 * math.cos(i / 5.0) + float(rng.normal(0, 0.08))
        p_val = 4.2 + 0.12 * math.sin(i / 3.0) + float(rng.normal(0, 0.04))
        a_val = 22.0 + 0.05 * (i / n_rows) + float(rng.normal(0, 0.05))

        clean_data["temperature_bearing_c"].append(round(t_val, 4))
        clean_data["vibration_drive_end_g"].append(round(v_val, 4))
        clean_data["pressure_feed_bar"].append(round(p_val, 4))
        clean_data["ambient_temp_c"].append(round(a_val, 4))

    clean_df = pd.DataFrame(clean_data)
    corrupted_df = clean_df.copy(deep=True)
    injected_manifest: List[Dict[str, Any]] = []

    # Fault 0: Strict Abstention at Boundary (Row 0, vibration_drive_end_g)
    # Target observation at row 0 has no preceding neighbor; extrapolation is strictly prohibited
    orig_v0 = clean_df.at[0, "vibration_drive_end_g"]
    corrupted_df.at[0, "vibration_drive_end_g"] = np.nan
    injected_manifest.append({
        "fault_id": "fault_boundary_abstain_00",
        "fault_type": "MISSING_BOUNDARY",
        "sensor_column": "vibration_drive_end_g",
        "source_row_index": 0,
        "timestamp": timestamps[0],
        "ground_truth_value": orig_v0,
        "corrupted_value": None,
        "expected_status": "UNRESOLVED",
        "abstention_reason": "Observation at row 0 has no valid preceding observation; extrapolation is strictly prohibited.",
        "description": "Boundary missing value demonstrating strict system abstention without guessing",
    })

    # Fault 1: Isolated Extreme Spike (Row 12, temperature_bearing_c)
    orig_spike_val = clean_df.at[12, "temperature_bearing_c"]
    injected_spike_val = 158.4000
    corrupted_df.at[12, "temperature_bearing_c"] = injected_spike_val
    injected_manifest.append({
        "fault_id": "fault_spike_01",
        "fault_type": "SPIKE",
        "sensor_column": "temperature_bearing_c",
        "source_row_index": 12,
        "timestamp": timestamps[12],
        "ground_truth_value": orig_spike_val,
        "corrupted_value": injected_spike_val,
        "expected_status": "CORRECTED",
        "description": "Extreme impulse excursion on bearing temperature successfully reconstructed via temporal interpolation",
    })

    # Fault 2: Missing-Value Interval within Gap Limit (Rows 24 to 26, vibration_drive_end_g)
    for m_row in [24, 25, 26]:
        orig_v_val = clean_df.at[m_row, "vibration_drive_end_g"]
        corrupted_df.at[m_row, "vibration_drive_end_g"] = np.nan
        injected_manifest.append({
            "fault_id": f"fault_missing_{m_row}",
            "fault_type": "MISSING",
            "sensor_column": "vibration_drive_end_g",
            "source_row_index": m_row,
            "timestamp": timestamps[m_row],
            "ground_truth_value": orig_v_val,
            "corrupted_value": None,
            "expected_status": "ESTIMATED",
            "description": "Transient communication loss / NaN packet drop within acceptable gap limit",
        })

    # Fault 3: Frozen Sensor Interval (Rows 36 to 39, pressure_feed_bar)
    frozen_val = 4.2150
    for f_row in [36, 37, 38, 39]:
        orig_p_val = clean_df.at[f_row, "pressure_feed_bar"]
        corrupted_df.at[f_row, "pressure_feed_bar"] = frozen_val
        injected_manifest.append({
            "fault_id": f"fault_frozen_{f_row}",
            "fault_type": "FROZEN",
            "sensor_column": "pressure_feed_bar",
            "source_row_index": f_row,
            "timestamp": timestamps[f_row],
            "ground_truth_value": orig_p_val,
            "corrupted_value": frozen_val,
            "expected_status": "CORRECTED",
            "description": "Pressure transducer frozen output interval detected by multi-detector ensemble",
        })

    manifest = {
        "manifest_version": "2.0.0",
        "demo_id": "demo1_self_healing",
        "dataset_name": "gas_turbine_motor_telemetry_demo1",
        "scenario": "Gas Turbine Bearing & Feed System Monitoring",
        "n_rows": n_rows,
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "ignored_columns": ["ambient_temp_c"],
        "timestamp_column": "timestamp",
        "units": {
            "temperature_bearing_c": "Degrees Celsius (°C)",
            "vibration_drive_end_g": "Acceleration Gravity (g)",
            "pressure_feed_bar": "Pressure Bar (bar)",
            "ambient_temp_c": "Degrees Celsius (°C)",
        },
        "injected_faults": injected_manifest,
        "total_injected_faults": len(injected_manifest),
    }

    return clean_df, corrupted_df, manifest


def generate_demo2_difficult_cases_telemetry(
    n_rows: int = 60, seed: int = 202
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Generate Demo 2 dataset: Trust, Abstention, Hard Cases & Evaluation.
    Contains representative difficult cases:
    1. Valid stream with physical correlations.
    2. Missing value at row 0 (boundary with insufficient left context) -> Prohibited extrapolation abstention.
    3. Gap exceeding configured interpolation limit (rows 15 to 22: 8 consecutive missing points, max_gap=5) -> Gap limit abstention.
    4. Suspected anomaly with conflicting sensor evidence (row 32: bearing temperature spike with opposing vibration residual) -> Negative correlation penalty & abstention.
    5. Sparse readings with insufficient neighboring context (row 45: < 3 valid neighbors) -> Quorum failure abstention.
    6. Low-variance / constant baseline (rows 50 to 59: constant pressure signal) -> Zero-MAD handling.
    """
    rng = np.random.default_rng(seed)

    base_ts = pd.Timestamp("2026-10-25 12:00:00", tz="UTC")
    timestamps = [str(base_ts + pd.Timedelta(minutes=i)) for i in range(n_rows)]

    clean_data: Dict[str, List[Any]] = {
        "timestamp": timestamps,
        "temperature_bearing_c": [],
        "vibration_drive_end_g": [],
        "pressure_feed_bar": [],
        "ambient_temp_c": [],
    }

    for i in range(n_rows):
        t_val = 58.0 + 4.1 * math.sin(i / 6.0) + float(rng.normal(0, 0.12))
        v_val = 2.1 + 0.50 * math.sin(i / 6.0) + float(rng.normal(0, 0.06))  # Positively correlated
        p_val = 4.0 + 0.10 * math.cos(i / 4.0) + float(rng.normal(0, 0.03))
        a_val = 21.5 + float(rng.normal(0, 0.04))

        clean_data["temperature_bearing_c"].append(round(t_val, 4))
        clean_data["vibration_drive_end_g"].append(round(v_val, 4))
        clean_data["pressure_feed_bar"].append(round(p_val, 4))
        clean_data["ambient_temp_c"].append(round(a_val, 4))

    clean_df = pd.DataFrame(clean_data)
    corrupted_df = clean_df.copy(deep=True)
    injected_manifest: List[Dict[str, Any]] = []

    # Case A: Boundary Missing Value (Row 0, vibration_drive_end_g)
    orig_v0 = clean_df.at[0, "vibration_drive_end_g"]
    corrupted_df.at[0, "vibration_drive_end_g"] = np.nan
    injected_manifest.append({
        "fault_id": "case_a_boundary_abstention",
        "case_name": "Boundary Extrapolation Prohibited",
        "sensor_column": "vibration_drive_end_g",
        "source_row_index": 0,
        "timestamp": timestamps[0],
        "ground_truth_value": orig_v0,
        "corrupted_value": None,
        "expected_status": "UNRESOLVED",
        "expected_rule": "Linear interpolation prohibits boundary extrapolation. System strictly abstains.",
        "description": "Row 0 has no preceding observation; algorithm declines to extrapolate.",
    })

    # Case B: Exceeded Gap Limit (Rows 15 to 22: 8 consecutive missing values on temperature_bearing_c)
    exceeded_gap_rows = list(range(15, 23))  # 8 rows: 15,16,17,18,19,20,21,22
    for r_idx in exceeded_gap_rows:
        orig_t = clean_df.at[r_idx, "temperature_bearing_c"]
        corrupted_df.at[r_idx, "temperature_bearing_c"] = np.nan
        injected_manifest.append({
            "fault_id": f"case_b_exceeded_gap_{r_idx}",
            "case_name": "Gap Exceeds Permitted Limit",
            "sensor_column": "temperature_bearing_c",
            "source_row_index": r_idx,
            "timestamp": timestamps[r_idx],
            "ground_truth_value": orig_t,
            "corrupted_value": None,
            "expected_status": "UNRESOLVED",
            "expected_rule": "Gap of 8 samples exceeds max_gap_size=5. Reconstruction declined.",
            "description": "Continuous telemetry blackout exceeding maximum interpolation threshold.",
        })

    # Case C: Conflicting Multi-Sensor Evidence (Row 32, temperature_bearing_c)
    # Temperature spikes massively to 135.0 C, while vibration and pressure remain at idle baseline
    orig_t32 = clean_df.at[32, "temperature_bearing_c"]
    corrupted_df.at[32, "temperature_bearing_c"] = 135.0
    injected_manifest.append({
        "fault_id": "case_c_conflicting_evidence",
        "case_name": "Conflicting Cross-Sensor Evidence",
        "sensor_column": "temperature_bearing_c",
        "source_row_index": 32,
        "timestamp": timestamps[32],
        "ground_truth_value": orig_t32,
        "corrupted_value": 135.0,
        "expected_status": "UNRESOLVED",
        "expected_rule": "Corroborating sensors contradict proposal; severe cross-sensor penalty triggers UNRESOLVED.",
        "description": "Bearing temperature indicates extreme overheating but physical motor vibration contradicts.",
    })

    # Case D: Sparse Readings / Insufficient Neighbors (Row 45, vibration_drive_end_g)
    # Mask surrounding rows 43, 44, 46, 47 as NaN so row 45 lacks neighbor quorum
    for neighbor_idx in [43, 44, 46, 47]:
        corrupted_df.at[neighbor_idx, "vibration_drive_end_g"] = np.nan
    orig_v45 = clean_df.at[45, "vibration_drive_end_g"]
    corrupted_df.at[45, "vibration_drive_end_g"] = np.nan
    injected_manifest.append({
        "fault_id": "case_d_insufficient_neighbors",
        "case_name": "Insufficient Trusted Neighbors",
        "sensor_column": "vibration_drive_end_g",
        "source_row_index": 45,
        "timestamp": timestamps[45],
        "ground_truth_value": orig_v45,
        "corrupted_value": None,
        "expected_status": "UNRESOLVED",
        "expected_rule": "Neighborhood lacks minimum required 3 valid finite observations.",
        "description": "Telemetry burst loss leaves target reading with insufficient neighbor context.",
    })

    # Case E: Constant Sensor Signal / Low Variance (Rows 50 to 59, pressure_feed_bar)
    for const_idx in range(50, n_rows):
        corrupted_df.at[const_idx, "pressure_feed_bar"] = 4.2000
    injected_manifest.append({
        "fault_id": "case_e_constant_signal",
        "case_name": "Zero-MAD Constant Signal Handling",
        "sensor_column": "pressure_feed_bar",
        "source_row_index": 50,
        "timestamp": timestamps[50],
        "ground_truth_value": clean_df.at[50, "pressure_feed_bar"],
        "corrupted_value": 4.2000,
        "expected_status": "MEASURED",
        "expected_rule": "Zero dispersion handled safely without false positive storm or divide-by-zero.",
        "description": "Constant signal interval demonstrating zero-MAD stability.",
    })

    manifest = {
        "manifest_version": "2.0.0",
        "demo_id": "demo2_trust_and_abstention",
        "dataset_name": "difficult_cases_industrial_telemetry_demo2",
        "scenario": "Edge-Case Resilience, Strict Abstention & Ground Truth Evaluation",
        "n_rows": n_rows,
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "ignored_columns": ["ambient_temp_c"],
        "timestamp_column": "timestamp",
        "units": {
            "temperature_bearing_c": "Degrees Celsius (°C)",
            "vibration_drive_end_g": "Acceleration Gravity (g)",
            "pressure_feed_bar": "Pressure Bar (bar)",
            "ambient_temp_c": "Degrees Celsius (°C)",
        },
        "injected_faults": injected_manifest,
        "total_injected_faults": len(injected_manifest),
    }

    return clean_df, corrupted_df, manifest
