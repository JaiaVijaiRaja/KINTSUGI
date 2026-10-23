"""Evidence-based confidence scoring engine for industrial signal reconstruction."""

from typing import List, Optional
import numpy as np

from app.schemas.reconstruction import ConfidenceBreakdown


def calculate_reconstruction_confidence(
    interp_val: Optional[float],
    interp_gap: Optional[int],
    median_val: Optional[float],
    neighbor_count: int,
    min_neighbors_required: int = 3,
    local_std: float = 0.0,
    local_mean: float = 0.0,
    surrounding_anomaly_count: int = 0,
    cross_sensor_agreement: Optional[bool] = None,
    cross_sensor_adjustment: float = 0.0,
    is_valid_proposal: bool = True,
    invalid_reason: Optional[str] = None,
) -> ConfidenceBreakdown:
    """
    Compute a transparent, evidence-based confidence score (0 to 100) and factor breakdown.

    Architectural Invariants & Policies:
    1. Not a Calibrated Probability:
       This score represents a multi-factor evidence index, NOT a calibrated physical probability.
    2. Transparent Scoring Factors:
       - Factor 1: Neighbor observations quorum (0 to 25 pts)
       - Factor 2: Method concordance between independent algorithms (0 to 25 pts)
       - Factor 3: Temporal proximity and gap penalty (0 to 20 pts)
       - Factor 4: Local signal stability / dispersion (0 to 15 pts)
       - Factor 5: Neighbor cleanliness / contamination (0 to 15 pts)
       - Factor 6: Cross-sensor corroboration bonus or conflict deduction (-25 to +15 pts)
    3. Safety Override Invariant:
       If fundamental safety or validity checks fail (e.g. prohibited extrapolation,
       excessive gap size, non-finite result), total confidence score is forced to 0.0
       regardless of partial factor points.
    """
    penalties: List[str] = []

    # If the proposal is structurally invalid, score is strictly 0.0
    if not is_valid_proposal:
        if invalid_reason:
            penalties.append(invalid_reason)
        return ConfidenceBreakdown(
            neighbor_count_score=0.0,
            method_agreement_score=0.0,
            temporal_proximity_score=0.0,
            local_variance_score=0.0,
            neighbor_cleanliness_score=0.0,
            cross_sensor_score=0.0,
            total_score=0.0,
            penalty_reasons=penalties,
        )

    # Factor 1: Neighbor Count Quorum (0 - 25 pts)
    target_quorum = max(min_neighbors_required * 2, 6)
    if neighbor_count >= target_quorum:
        score_neighbor = 25.0
    elif neighbor_count >= min_neighbors_required:
        score_neighbor = round(15.0 + 10.0 * ((neighbor_count - min_neighbors_required) / max(target_quorum - min_neighbors_required, 1)), 2)
    else:
        score_neighbor = round(15.0 * (neighbor_count / max(min_neighbors_required, 1)), 2)
        penalties.append(f"Sub-optimal trusted neighbor count ({neighbor_count} < {target_quorum} ideal)")

    # Factor 2: Method Concordance (0 - 25 pts)
    both_methods = (interp_val is not None and np.isfinite(interp_val) and
                    median_val is not None and np.isfinite(median_val))
    if both_methods:
        std_denom = max(local_std, 0.01)
        rel_diff = abs(interp_val - median_val) / std_denom
        if rel_diff <= 0.5:
            score_method = 25.0
        elif rel_diff <= 1.5:
            score_method = 18.0
        elif rel_diff <= 3.0:
            score_method = 10.0
            penalties.append(f"Moderate divergence between linear interpolation ({interp_val:.3f}) and local median ({median_val:.3f})")
        else:
            score_method = 5.0
            penalties.append(f"Strong divergence between linear interpolation ({interp_val:.3f}) and local median ({median_val:.3f})")
    elif interp_val is not None and np.isfinite(interp_val):
        score_method = 16.0  # single trusted method available
    elif median_val is not None and np.isfinite(median_val):
        score_method = 14.0  # single trusted method available
    else:
        score_method = 0.0
        penalties.append("No primary reconstruction method succeeded")

    # Factor 3: Temporal Proximity / Gap Size (0 - 20 pts)
    gap = interp_gap if interp_gap is not None else 1
    if gap <= 1:
        score_gap = 20.0
    elif gap == 2:
        score_gap = 16.0
    elif gap == 3:
        score_gap = 12.0
    elif gap == 4:
        score_gap = 8.0
    else:
        score_gap = max(2.0, round(20.0 - 4.0 * (gap - 1), 2))
        penalties.append(f"Large reconstruction gap length of {gap} samples")

    # Factor 4: Local Signal Stability / Variance (0 - 15 pts)
    mean_denom = abs(local_mean) if abs(local_mean) > 1e-4 else 1.0
    cv = local_std / mean_denom
    if cv <= 0.05:
        score_var = 15.0
    elif cv <= 0.15:
        score_var = 12.0
    elif cv <= 0.35:
        score_var = 8.0
    else:
        score_var = 4.0
        penalties.append(f"High local signal dispersion (CV={cv:.2f})")

    # Factor 5: Neighbor Cleanliness (0 - 15 pts)
    if surrounding_anomaly_count == 0:
        score_clean = 15.0
    elif surrounding_anomaly_count == 1:
        score_clean = 10.0
        penalties.append("1 neighboring observation in radius is also flagged as an anomaly")
    elif surrounding_anomaly_count == 2:
        score_clean = 5.0
        penalties.append("2 neighboring observations in radius are also flagged as anomalies")
    else:
        score_clean = 0.0
        penalties.append(f"Severe neighborhood contamination ({surrounding_anomaly_count} anomaly neighbors in radius)")

    # Factor 6: Cross-Sensor Adjustment
    score_cross = round(cross_sensor_adjustment, 2)
    if cross_sensor_agreement is True:
        score_cross = max(score_cross, 10.0)
    elif cross_sensor_agreement is False:
        score_cross = min(score_cross, -25.0)
        penalties.append("Cross-sensor regression model strongly contradicts temporal candidate value")

    # Total Score Consolidation
    raw_total = (
        score_neighbor
        + score_method
        + score_gap
        + score_var
        + score_clean
        + score_cross
    )
    total_score = max(0.0, min(100.0, round(raw_total, 2)))

    return ConfidenceBreakdown(
        neighbor_count_score=score_neighbor,
        method_agreement_score=score_method,
        temporal_proximity_score=score_gap,
        local_variance_score=score_var,
        neighbor_cleanliness_score=score_clean,
        cross_sensor_score=score_cross,
        total_score=total_score,
        penalty_reasons=penalties,
    )
