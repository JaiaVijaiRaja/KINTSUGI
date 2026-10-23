"""Linear interpolation reconstruction algorithm for industrial sensor telemetry."""

import math
from typing import List, Optional, Set, Tuple
import numpy as np
import pandas as pd

from app.schemas.reconstruction import EvidenceReference


def reconstruct_linear_interpolation(
    values: np.ndarray,
    target_idx: int,
    timestamps: Optional[pd.Series] = None,
    max_gap_size: int = 5,
    anomaly_indices: Optional[Set[int]] = None,
    sensor_column: str = "sensor",
) -> Tuple[Optional[float], List[EvidenceReference], str, bool]:
    """
    Reconstruct an anomalous or missing sensor observation using linear interpolation.

    Architectural Invariants & Policies:
    1. Extrapolation is Strictly Prohibited:
       Requires trusted, finite observations on BOTH the left and right sides.
       If the target observation is at the beginning or end of the series, linear
       interpolation declines and abstains.
    2. Gap Limit Enforcement:
       If the contiguous distance between the left and right valid observations
       exceeds max_gap_size, the algorithm abstains to prevent interpolating across wide unknown periods.
    3. Untrusted Anomaly Exclusion:
       Observations flagged as anomalies are excluded from being used as interpolation anchors.
    4. Deterministic Temporal Handling:
       When timestamps exist and are monotonically valid, interpolation is weighted by true time elapsed.
       Duplicate timestamps are handled deterministically without division by zero.
    """
    n = len(values)
    anom_set = anomaly_indices or set()
    evidence_refs: List[EvidenceReference] = []

    # 1. Search for closest valid left neighbor (L < target_idx)
    left_idx: Optional[int] = None
    for i in range(target_idx - 1, -1, -1):
        if i not in anom_set and np.isfinite(values[i]):
            left_idx = i
            break

    # 2. Search for closest valid right neighbor (R > target_idx)
    right_idx: Optional[int] = None
    for i in range(target_idx + 1, n):
        if i not in anom_set and np.isfinite(values[i]):
            right_idx = i
            break

    # 3. Check for extrapolation boundaries
    if left_idx is None and right_idx is None:
        return None, [], "No valid historical or future observations available; extrapolation is strictly prohibited.", False
    if left_idx is None:
        return None, [], f"Observation at row {target_idx} has no valid preceding observation; extrapolation is strictly prohibited.", False
    if right_idx is None:
        return None, [], f"Observation at row {target_idx} has no valid succeeding observation; extrapolation is strictly prohibited.", False

    # 4. Check gap length limit
    gap_length = right_idx - left_idx - 1
    if gap_length > max_gap_size:
        return (
            None,
            [],
            f"Contiguous gap of {gap_length} samples between row {left_idx} and row {right_idx} "
            f"exceeds configured maximum gap limit of {max_gap_size} samples.",
            False,
        )

    val_l = float(values[left_idx])
    val_r = float(values[right_idx])

    # 5. Compute interpolation weight using timestamps if available and monotonic
    fraction = 0.5
    ts_left_str = None
    ts_right_str = None
    time_weighted = False

    if timestamps is not None and len(timestamps) == n:
        try:
            ts_series = pd.to_datetime(timestamps, errors="coerce")
            t_left = ts_series.iloc[left_idx]
            t_target = ts_series.iloc[target_idx]
            t_right = ts_series.iloc[right_idx]

            if pd.notnull(t_left) and pd.notnull(t_target) and pd.notnull(t_right):
                ts_left_str = str(timestamps.iloc[left_idx])
                ts_right_str = str(timestamps.iloc[right_idx])
                delta_total = (t_right - t_left).total_seconds()
                delta_target = (t_target - t_left).total_seconds()

                if delta_total == 0:
                    # Deterministic duplicate timestamp handling: midpoint average
                    fraction = 0.5
                    time_weighted = True
                elif delta_total > 0 and 0 <= delta_target <= delta_total:
                    fraction = delta_target / delta_total
                    time_weighted = True
                else:
                    # Non-monotonic timestamp sequence: fallback to row indices
                    time_weighted = False
        except Exception:
            time_weighted = False

    if not time_weighted:
        # Fallback to row position proportion
        fraction = (target_idx - left_idx) / (right_idx - left_idx)

    # 6. Calculate candidate reconstructed value
    candidate_value = val_l + (val_r - val_l) * fraction

    if not np.isfinite(candidate_value):
        return None, [], "Interpolated candidate value resulted in a non-finite number.", False

    # 7. Record evidence references
    evidence_refs.append(
        EvidenceReference(
            source_row_index=left_idx,
            timestamp=ts_left_str or (str(timestamps.iloc[left_idx]) if timestamps is not None else None),
            sensor_column=sensor_column,
            value=val_l,
            distance=float(target_idx - left_idx),
            weight=round(1.0 - fraction, 4),
            is_anomaly=(left_idx in anom_set),
        )
    )
    evidence_refs.append(
        EvidenceReference(
            source_row_index=right_idx,
            timestamp=ts_right_str or (str(timestamps.iloc[right_idx]) if timestamps is not None else None),
            sensor_column=sensor_column,
            value=val_r,
            distance=float(right_idx - target_idx),
            weight=round(fraction, 4),
            is_anomaly=(right_idx in anom_set),
        )
    )

    reason = (
        f"Linear interpolation between row #{left_idx} ({val_l:.4f}) and row #{right_idx} ({val_r:.4f}) "
        f"across a gap of {gap_length} samples (fraction={fraction:.3f}, {'time-weighted' if time_weighted else 'index-weighted'})."
    )

    return round(candidate_value, 4), evidence_refs, reason, True
