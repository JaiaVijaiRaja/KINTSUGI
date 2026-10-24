"""Deterministic synthetic fault injection for KINTSUGI industrial data benchmarking."""

import logging
import math
import uuid
from typing import Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from app.schemas.evaluation import (
    FaultInjectionConfig,
    FaultManifest,
    FaultType,
    InjectedFaultRecord,
)

logger = logging.getLogger("kintsugi.fault_injector")


def clean_val(val: any) -> Optional[float]:
    """Clean NaN or non-finite values for manifest representation."""
    if val is None:
        return None
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    except (ValueError, TypeError):
        return None


class FaultInjector:
    """Orchestrates deterministic synthetic fault injection into dataset copies."""

    def inject_faults(
        self,
        df: pd.DataFrame,
        config: FaultInjectionConfig,
        source_dataset_id: str,
        benchmark_dataset_id: str,
        timestamp_col: Optional[str] = None,
    ) -> Tuple[pd.DataFrame, FaultManifest]:
        """
        Inject deterministic synthetic faults into a fresh copy of the dataset DataFrame.
        Preserves original DataFrame without mutation.
        Returns corrupted DataFrame copy and machine-readable ground truth manifest.
        """
        # 1. Strictly copy dataframe - original source remains untouched
        corrupted_df = df.copy(deep=True)
        n_rows = len(corrupted_df)

        if n_rows == 0:
            raise ValueError("Cannot inject faults into an empty dataset.")

        # 2. Validate sensor columns
        target_columns = config.sensor_columns
        if not target_columns:
            # Fall back to all numeric columns except timestamp
            target_columns = [
                c for c in corrupted_df.columns
                if c != timestamp_col and pd.api.types.is_numeric_dtype(corrupted_df[c])
            ]

        if not target_columns:
            raise ValueError("No eligible numeric sensor columns found for fault injection.")

        for col in target_columns:
            if col not in corrupted_df.columns:
                raise ValueError(f"Target sensor column '{col}' does not exist in dataset.")
            if not pd.api.types.is_numeric_dtype(corrupted_df[col]):
                raise ValueError(f"Target column '{col}' is not numeric; cannot inject sensor faults.")

        # 3. Setup seeded RNG for strict reproducibility
        seed = int(config.seed)
        rng = np.random.default_rng(seed)

        manifest_id = f"man_{uuid.uuid4().hex[:12]}"
        injected_records: List[InjectedFaultRecord] = []
        modified_positions: Dict[Tuple[int, str], str] = {}  # (row_index, col) -> fault_id
        fault_counts_by_type: Dict[str, int] = {}
        fault_counts_by_sensor: Dict[str, int] = {c: 0 for c in target_columns}
        skipped_overlap_count = 0

        # Precompute sensor statistics on original data
        sensor_stats: Dict[str, Dict[str, float]] = {}
        for col in target_columns:
            s = corrupted_df[col].dropna()
            std_val = float(s.std()) if len(s) > 1 else 1.0
            if math.isnan(std_val) or std_val <= 1e-6:
                std_val = 1.0
            mean_val = float(s.mean()) if len(s) > 0 else 0.0
            if math.isnan(mean_val):
                mean_val = 0.0
            sensor_stats[col] = {"std": std_val, "mean": mean_val}

        # Helper to apply or resolve overlapping fault
        def try_apply_fault(
            fault_id: str,
            fault_type: FaultType,
            col: str,
            row_idx: int,
            raw_orig_val: any,
            target_corrupted_val: any,
            is_interval: bool = False,
            interval_id: Optional[str] = None,
            interval_index: Optional[int] = None,
        ) -> bool:
            nonlocal skipped_overlap_count
            key = (row_idx, col)
            ts_str = str(corrupted_df.at[row_idx, timestamp_col]) if timestamp_col and timestamp_col in corrupted_df.columns else None
            orig_cleaned = clean_val(raw_orig_val)

            if key in modified_positions:
                # Overlapping fault detected: first-applied wins deterministically
                earlier_id = modified_positions[key]
                record = InjectedFaultRecord(
                    fault_id=fault_id,
                    fault_type=fault_type,
                    sensor_column=col,
                    source_row_index=row_idx,
                    timestamp=ts_str,
                    original_value=orig_cleaned,
                    corrupted_value=clean_val(target_corrupted_val),
                    is_interval=is_interval,
                    interval_id=interval_id,
                    interval_index=interval_index,
                    applied=False,
                    resolution_note=f"Overlapping fault at row {row_idx}, column '{col}' already modified by earlier fault '{earlier_id}'. Skipped.",
                )
                injected_records.append(record)
                skipped_overlap_count += 1
                return False

            # Apply modification
            modified_positions[key] = fault_id
            corrupted_df.at[row_idx, col] = target_corrupted_val
            record = InjectedFaultRecord(
                fault_id=fault_id,
                fault_type=fault_type,
                sensor_column=col,
                source_row_index=row_idx,
                timestamp=ts_str,
                original_value=orig_cleaned,
                corrupted_value=clean_val(target_corrupted_val),
                is_interval=is_interval,
                interval_id=interval_id,
                interval_index=interval_index,
                applied=True,
                resolution_note=None,
            )
            injected_records.append(record)
            fault_counts_by_type[fault_type] = fault_counts_by_type.get(fault_type, 0) + 1
            fault_counts_by_sensor[col] = fault_counts_by_sensor.get(col, 0) + 1
            return True

        # =====================================================================
        # Sequence of injections: Intervals first, then point faults
        # =====================================================================

        # 1. DRIFT FAULT (interval ramp)
        if config.drift.enabled and n_rows >= 3:
            drift_cfg = config.drift
            L = min(n_rows, max(3, drift_cfg.interval_length))
            for col in target_columns:
                max_start = max(0, n_rows - L)
                if drift_cfg.start_row is not None and 0 <= drift_cfg.start_row <= max_start:
                    start_row = drift_cfg.start_row
                else:
                    start_row = int(rng.integers(0, max_start + 1)) if max_start > 0 else 0

                interval_id = f"drift_int_{uuid.uuid4().hex[:8]}"
                std = sensor_stats[col]["std"]
                slope = drift_cfg.slope_factor * std

                for step_i in range(L):
                    r_idx = start_row + step_i
                    orig_v = corrupted_df.at[r_idx, col]
                    if orig_v is not None and np.isfinite(orig_v):
                        ramp_delta = (step_i + 1) * slope
                        corr_v = float(orig_v + ramp_delta)
                    else:
                        corr_v = (step_i + 1) * slope
                    flt_id = f"flt_drift_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="drift",
                        col=col,
                        row_idx=r_idx,
                        raw_orig_val=orig_v,
                        target_corrupted_val=corr_v,
                        is_interval=True,
                        interval_id=interval_id,
                        interval_index=step_i,
                    )

        # 2. FROZEN SENSOR (interval constant)
        if config.frozen.enabled and n_rows >= 3:
            frozen_cfg = config.frozen
            L = min(n_rows, max(3, frozen_cfg.interval_length))
            for col in target_columns:
                max_start = max(0, n_rows - L)
                if frozen_cfg.start_row is not None and 0 <= frozen_cfg.start_row <= max_start:
                    start_row = frozen_cfg.start_row
                else:
                    start_row = int(rng.integers(0, max_start + 1)) if max_start > 0 else 0

                interval_id = f"frozen_int_{uuid.uuid4().hex[:8]}"
                first_val = corrupted_df.at[start_row, col]
                if frozen_cfg.frozen_value is not None:
                    const_val = float(frozen_cfg.frozen_value)
                elif first_val is not None and np.isfinite(first_val):
                    const_val = float(first_val)
                else:
                    const_val = sensor_stats[col]["mean"]

                for step_i in range(L):
                    r_idx = start_row + step_i
                    orig_v = corrupted_df.at[r_idx, col]
                    flt_id = f"flt_froz_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="frozen_sensor",
                        col=col,
                        row_idx=r_idx,
                        raw_orig_val=orig_v,
                        target_corrupted_val=const_val,
                        is_interval=True,
                        interval_id=interval_id,
                        interval_index=step_i,
                    )

        # 3. COMMUNICATION GAP (interval missing values)
        if config.gap.enabled and n_rows >= 2:
            gap_cfg = config.gap
            L = min(n_rows, max(2, gap_cfg.interval_length))
            for col in target_columns:
                max_start = max(0, n_rows - L)
                if gap_cfg.start_row is not None and 0 <= gap_cfg.start_row <= max_start:
                    start_row = gap_cfg.start_row
                else:
                    start_row = int(rng.integers(0, max_start + 1)) if max_start > 0 else 0

                interval_id = f"gap_int_{uuid.uuid4().hex[:8]}"
                for step_i in range(L):
                    r_idx = start_row + step_i
                    orig_v = corrupted_df.at[r_idx, col]
                    flt_id = f"flt_gap_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="communication_gap",
                        col=col,
                        row_idx=r_idx,
                        raw_orig_val=orig_v,
                        target_corrupted_val=np.nan,
                        is_interval=True,
                        interval_id=interval_id,
                        interval_index=step_i,
                    )

        # 4. POINT SPIKES
        if config.spikes.enabled and n_rows >= 1:
            spike_cfg = config.spikes
            k = max(1, int(round(n_rows * spike_cfg.rate)))
            for col in target_columns:
                sample_indices = rng.choice(n_rows, size=min(k, n_rows), replace=False)
                std = sensor_stats[col]["std"]
                mag = spike_cfg.magnitude_factor * std

                for r_idx in sample_indices:
                    orig_v = corrupted_df.at[r_idx, col]
                    if orig_v is None or not np.isfinite(orig_v):
                        base_v = sensor_stats[col]["mean"]
                    else:
                        base_v = float(orig_v)

                    # Direction
                    if spike_cfg.direction == "positive":
                        sign = 1.0
                    elif spike_cfg.direction == "negative":
                        sign = -1.0
                    else:
                        sign = 1.0 if rng.random() > 0.5 else -1.0

                    corr_v = float(base_v + sign * mag)
                    flt_id = f"flt_spk_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="point_spike",
                        col=col,
                        row_idx=int(r_idx),
                        raw_orig_val=orig_v,
                        target_corrupted_val=corr_v,
                    )

        # 5. POINT CORRUPTION
        if config.corruption.enabled and n_rows >= 1:
            corr_cfg = config.corruption
            k = max(1, int(round(n_rows * corr_cfg.rate)))
            for col in target_columns:
                sample_indices = rng.choice(n_rows, size=min(k, n_rows), replace=False)
                for r_idx in sample_indices:
                    orig_v = corrupted_df.at[r_idx, col]
                    if corr_cfg.fixed_value is not None:
                        corr_v = float(corr_cfg.fixed_value)
                    else:
                        # Produce extreme out-of-scale or unphysical value
                        if orig_v is not None and np.isfinite(orig_v) and abs(orig_v) > 1e-4:
                            corr_v = float(orig_v * corr_cfg.scale_multiplier)
                        else:
                            corr_v = 9999.0

                    flt_id = f"flt_cor_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="point_corruption",
                        col=col,
                        row_idx=int(r_idx),
                        raw_orig_val=orig_v,
                        target_corrupted_val=corr_v,
                    )

        # 6. MISSING VALUE INJECTION
        if config.missing.enabled and n_rows >= 1:
            miss_cfg = config.missing
            k = max(1, int(round(n_rows * miss_cfg.rate)))
            for col in target_columns:
                sample_indices = rng.choice(n_rows, size=min(k, n_rows), replace=False)
                for r_idx in sample_indices:
                    orig_v = corrupted_df.at[r_idx, col]
                    flt_id = f"flt_mis_{uuid.uuid4().hex[:8]}"
                    try_apply_fault(
                        fault_id=flt_id,
                        fault_type="missing_value",
                        col=col,
                        row_idx=int(r_idx),
                        raw_orig_val=orig_v,
                        target_corrupted_val=np.nan,
                    )

        # Build final manifest
        manifest = FaultManifest(
            manifest_id=manifest_id,
            evaluation_id="",  # will be populated by evaluation orchestrator
            source_dataset_id=source_dataset_id,
            benchmark_dataset_id=benchmark_dataset_id,
            seed=seed,
            total_injected_points=sum(1 for r in injected_records if r.applied),
            fault_counts_by_type=fault_counts_by_type,
            fault_counts_by_sensor=fault_counts_by_sensor,
            overlapping_skipped_count=skipped_overlap_count,
            injected_faults=injected_records,
        )

        logger.info(
            "Fault injection complete for benchmark %s: %d applied faults (%d overlaps skipped)",
            benchmark_dataset_id,
            manifest.total_injected_points,
            skipped_overlap_count,
        )

        return corrupted_df, manifest


fault_injector = FaultInjector()
