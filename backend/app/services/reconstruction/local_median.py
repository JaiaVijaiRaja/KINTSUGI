"""Local neighborhood median reconstruction algorithm for industrial sensor telemetry."""

from typing import List, Optional, Set, Tuple
import numpy as np
import pandas as pd

from app.schemas.reconstruction import EvidenceReference


def reconstruct_local_median(
    values: np.ndarray,
    target_idx: int,
    timestamps: Optional[pd.Series] = None,
    window_radius: int = 5,
    min_observations: int = 3,
    anomaly_indices: Optional[Set[int]] = None,
    sensor_column: str = "sensor",
) -> Tuple[Optional[float], List[EvidenceReference], str, bool]:
    """
    Reconstruct an anomalous sensor reading using the localized median of trusted neighbors.

    Architectural Invariants & Policies:
    1. Exclusion of Target Observation:
       The target observation at target_idx is strictly excluded from its own reconstruction.
    2. Exclusion of Untrusted Anomaly Neighbors:
       Any neighboring observations flagged as anomalies are excluded from the reference set.
    3. Non-Finite Rejection:
       NaN, null, and infinite values in the neighborhood are excluded.
    4. Minimum Trusted Neighbors Quorum:
       Requires at least min_observations valid, non-anomalous neighbors. If the neighborhood
       contains fewer valid observations, the algorithm strictly declines and abstains.
    5. Evidence Logging:
       All participating neighbors are permanently recorded with their distance weights.
    """
    n = len(values)
    anom_set = anomaly_indices or set()
    start_idx = max(0, target_idx - window_radius)
    end_idx = min(n, target_idx + window_radius + 1)

    valid_neighbors: List[Tuple[int, float]] = []
    evidence_refs: List[EvidenceReference] = []

    for i in range(start_idx, end_idx):
        if i == target_idx:
            continue  # target reading participates in neither median nor reference set
        if i in anom_set:
            continue  # do not use unresolved anomalies as trusted references
        val = values[i]
        if np.isfinite(val):
            valid_neighbors.append((i, float(val)))

    if len(valid_neighbors) < min_observations:
        return (
            None,
            [],
            f"Insufficient trusted neighbors in window [rows {start_idx} to {end_idx - 1}] "
            f"({len(valid_neighbors)} available < {min_observations} minimum required).",
            False,
        )

    neighbor_vals = [v for _, v in valid_neighbors]
    estimated_val = float(np.median(neighbor_vals))

    # Weight is inversely proportional to row distance
    total_inv_dist = sum(1.0 / (abs(idx - target_idx)) for idx, _ in valid_neighbors)
    for idx, val in valid_neighbors:
        dist = abs(idx - target_idx)
        weight = (1.0 / dist) / total_inv_dist if total_inv_dist > 0 else (1.0 / len(valid_neighbors))
        evidence_refs.append(
            EvidenceReference(
                source_row_index=idx,
                timestamp=str(timestamps.iloc[idx]) if (timestamps is not None and len(timestamps) == n) else None,
                sensor_column=sensor_column,
                value=val,
                distance=float(dist),
                weight=round(weight, 4),
                is_anomaly=False,
            )
        )

    reason = (
        f"Local neighborhood median from {len(valid_neighbors)} trusted neighbors in radius {window_radius} "
        f"(dispersion std={float(np.std(neighbor_vals)):.4f}, median={estimated_val:.4f})."
    )

    return round(estimated_val, 4), evidence_refs, reason, True
