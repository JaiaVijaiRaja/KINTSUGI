"""
Reproducible synthetic industrial sensor data fixtures for Phase 9 integration testing.

Contains:
- Timestamp column (1-minute intervals)
- Multiple numeric sensor channels (temperature, vibration, pressure, ambient)
- Nominal operational baseline with physical correlations
- Isolated spike fault
- Missing-value interval
- Frozen sensor interval
- Sufficient clean intervals for baseline fitting and neighbor interpolation
- Separately stored ground-truth manifest with exact target values
"""

import io
import math
from typing import Any, Dict, List, Tuple
import numpy as np
import pandas as pd


def generate_synthetic_telemetry(
    n_rows: int = 60, seed: int = 42
) -> Tuple[pd.DataFrame, pd.DataFrame, Dict[str, Any]]:
    """
    Generate deterministic clean and corrupted industrial telemetry DataFrames
    along with an independent ground-truth manifest.

    Assumptions:
    1. Sensor channels operate under stationary nominal dynamics with deterministic sinusoidal harmonics.
    2. Vibration drive end is strongly correlated with bearing temperature.
    3. Feed pressure maintains stable baseline with low noise.
    4. Row index strictly corresponds to source row sequence.
    """
    rng = np.random.default_rng(seed)

    # 1. Generate Timestamps
    base_ts = pd.Timestamp("2026-10-24 08:00:00", tz="UTC")
    timestamps = [str(base_ts + pd.Timedelta(minutes=i)) for i in range(n_rows)]

    # 2. Generate Nominal Clean Signals
    clean_data: Dict[str, List[Any]] = {
        "timestamp": timestamps,
        "temperature_bearing_c": [],
        "vibration_drive_end_g": [],
        "pressure_feed_bar": [],
        "ambient_temp_c": [],
    }

    for i in range(n_rows):
        # Bearing temperature: ~65.0 C with gentle oscillation
        t_val = 65.0 + 3.2 * math.sin(i / 5.0) + float(rng.normal(0, 0.15))
        # Vibration: ~2.5 g correlated with temperature
        v_val = 2.5 + 0.45 * math.cos(i / 5.0) + float(rng.normal(0, 0.08))
        # Pressure: ~4.2 bar
        p_val = 4.2 + 0.12 * math.sin(i / 3.0) + float(rng.normal(0, 0.04))
        # Ambient: ~22.0 C
        a_val = 22.0 + 0.05 * (i / n_rows) + float(rng.normal(0, 0.05))

        clean_data["temperature_bearing_c"].append(round(t_val, 4))
        clean_data["vibration_drive_end_g"].append(round(v_val, 4))
        clean_data["pressure_feed_bar"].append(round(p_val, 4))
        clean_data["ambient_temp_c"].append(round(a_val, 4))

    clean_df = pd.DataFrame(clean_data)

    # 3. Create Corrupted Copy with Controlled Injected Faults
    corrupted_df = clean_df.copy(deep=True)

    injected_manifest: List[Dict[str, Any]] = []

    # Fault 1: Isolated Extreme Spike (Row 12, temperature_bearing_c)
    # Nominal ~67.1 C -> Injected 158.4 C (+91.3 C excursion)
    spike_row = 12
    if spike_row < n_rows:
        orig_spike_val = clean_df.at[spike_row, "temperature_bearing_c"]
        injected_spike_val = 158.4000
        corrupted_df.at[spike_row, "temperature_bearing_c"] = injected_spike_val
        injected_manifest.append({
            "fault_id": "fault_spike_01",
            "fault_type": "SPIKE",
            "sensor_column": "temperature_bearing_c",
            "source_row_index": spike_row,
            "timestamp": timestamps[spike_row],
            "ground_truth_value": orig_spike_val,
            "corrupted_value": injected_spike_val,
            "description": "Extreme impulse excursion on bearing temperature",
        })

    # Fault 2: Missing-Value Interval (Rows 24 to 26, vibration_drive_end_g)
    # Packet loss / telemetry drop: 3 consecutive NaN readings
    missing_rows = [24, 25, 26]
    for m_row in missing_rows:
        if m_row < n_rows:
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
                "description": "Transient communication loss / NaN packet drop",
            })

    # Fault 3: Frozen Sensor Interval (Rows 36 to 39, pressure_feed_bar)
    # Sensor lockup: exactly frozen at 4.2150 with 0 variance
    frozen_rows = [36, 37, 38, 39]
    frozen_val = 4.2150
    for f_row in frozen_rows:
        if f_row < n_rows:
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
                "description": "Pressure transducer frozen output interval",
            })

    # Assemble manifest structure
    manifest = {
        "manifest_version": "1.0.0",
        "dataset_name": "synthetic_industrial_telemetry_fixture",
        "n_rows": n_rows,
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "ignored_columns": ["ambient_temp_c"],
        "timestamp_column": "timestamp",
        "clean_intervals": [
            {"start_row": 0, "end_row": 11, "length": 12},
            {"start_row": 13, "end_row": 23, "length": 11},
            {"start_row": 27, "end_row": 35, "length": 9},
            {"start_row": 40, "end_row": 59, "length": 20},
        ],
        "injected_faults": injected_manifest,
        "total_injected_faults": len(injected_manifest),
    }

    return clean_df, corrupted_df, manifest


def dataframe_to_csv_bytes(df: pd.DataFrame) -> bytes:
    """Serialize DataFrame to standard UTF-8 CSV bytes, preserving NaN as empty string."""
    buf = io.StringIO()
    df.to_csv(buf, index=False, na_rep="")
    return buf.getvalue().encode("utf-8")
