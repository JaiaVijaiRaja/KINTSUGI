"""Cross-sensor validation and correlation evaluation for multi-sensor industrial telemetry."""

from typing import Dict, List, Optional, Set, Tuple
import numpy as np
import pandas as pd

from app.schemas.reconstruction import EvidenceReference


def evaluate_cross_sensor_validation(
    df: pd.DataFrame,
    target_sensor: str,
    target_idx: int,
    candidate_val: Optional[float],
    anomaly_map: Optional[Dict[str, Set[int]]] = None,
    min_correlation_threshold: float = 0.70,
    min_nominal_samples: int = 10,
) -> Tuple[Optional[float], Optional[bool], float, List[EvidenceReference], str]:
    """
    Evaluate multi-sensor corroboration for a candidate reconstructed value.

    Architectural Invariants & Policies:
    1. No Fabricated Physical Relationships:
       Cross-sensor evidence is evaluated ONLY when an empirical Pearson correlation (|r| >= 0.70)
       can be demonstrated on verified nominal (non-anomalous) historical telemetry.
    2. Disclaim Unestablished Relationships:
       If correlation is weak or nominal data is insufficient, the system strictly declines
       to claim cross-sensor validation rather than making unfounded assumptions.
    3. Untrusted Sensor Guard:
       If the corroborating sensor at target_idx is itself flagged as an anomaly or is non-finite,
       it is disqualified from providing evidence.
    4. Conflict Flagging:
       If cross-sensor regression strongly contradicts the candidate value (> 3.5x residual std),
       an evidence conflict is flagged and penalizes confidence.
    """
    anom_map = anomaly_map or {}
    target_anoms = anom_map.get(target_sensor, set())

    # Identify numeric sensor channels other than target
    candidate_sensors = [
        col for col in df.columns
        if col != target_sensor and pd.api.types.is_numeric_dtype(df[col])
    ]

    if not candidate_sensors:
        return (
            None,
            None,
            0.0,
            [],
            "Single sensor channel; no secondary sensor telemetry available for cross-validation.",
        )

    best_sensor: Optional[str] = None
    best_r: float = 0.0
    best_model: Optional[Tuple[float, float, float]] = None  # alpha, beta, sigma_res

    target_values = df[target_sensor].to_numpy(dtype=float, na_value=np.nan)

    for sensor in candidate_sensors:
        s_anoms = anom_map.get(sensor, set())
        sensor_values = df[sensor].to_numpy(dtype=float, na_value=np.nan)

        # Identify nominal rows where NEITHER sensor is anomalous and both are finite
        nominal_mask = (
            np.isfinite(target_values)
            & np.isfinite(sensor_values)
            & ~np.isin(np.arange(len(df)), list(target_anoms))
            & ~np.isin(np.arange(len(df)), list(s_anoms))
        )

        n_nom = np.sum(nominal_mask)
        if n_nom < min_nominal_samples:
            continue

        x_nom = sensor_values[nominal_mask]
        y_nom = target_values[nominal_mask]

        # Check zero variance
        if np.std(x_nom) <= 1e-9 or np.std(y_nom) <= 1e-9:
            continue

        # Pearson correlation
        corr = float(np.corrcoef(x_nom, y_nom)[0, 1])
        if np.isnan(corr):
            continue

        if abs(corr) >= min_correlation_threshold and abs(corr) > abs(best_r):
            # Fit linear model: y = alpha * x + beta
            alpha, beta = np.polyfit(x_nom, y_nom, 1)
            residuals = y_nom - (alpha * x_nom + beta)
            sigma_res = float(np.std(residuals))
            best_sensor = sensor
            best_r = corr
            best_model = (float(alpha), float(beta), sigma_res)

    if best_sensor is None or best_model is None:
        return (
            None,
            None,
            0.0,
            [],
            f"No secondary sensor demonstrated reliable correlation (|r| >= {min_correlation_threshold:.2f}); cross-sensor validation not claimed.",
        )

    # Evaluate best sensor at target_idx
    best_s_anoms = anom_map.get(best_sensor, set())
    sensor_val_at_target = df[best_sensor].iloc[target_idx]

    try:
        s_val = float(sensor_val_at_target)
    except (ValueError, TypeError):
        s_val = np.nan

    if not np.isfinite(s_val):
        return (
            None,
            None,
            0.0,
            [],
            f"Correlating sensor '{best_sensor}' (r={best_r:.3f}) was missing or non-finite at row #{target_idx}.",
        )

    if target_idx in best_s_anoms:
        return (
            None,
            None,
            -10.0,  # penalty for correlated neighbor also experiencing anomaly
            [],
            f"Correlating sensor '{best_sensor}' was also flagged as an anomaly at row #{target_idx}; cross-sensor evidence disqualified.",
        )

    alpha, beta, sigma_res = best_model
    predicted_cross_val = float(alpha * s_val + beta)
    sigma_bound = max(sigma_res, 0.01)

    evidence_ref = EvidenceReference(
        source_row_index=target_idx,
        timestamp=str(df.index[target_idx]) if hasattr(df.index, "name") else None,
        sensor_column=best_sensor,
        value=round(s_val, 4),
        distance=0.0,
        weight=round(abs(best_r), 4),
        is_anomaly=False,
    )

    if candidate_val is None:
        return (
            round(predicted_cross_val, 4),
            True,
            10.0,
            [evidence_ref],
            f"Cross-sensor model '{best_sensor}' (r={best_r:.3f}) estimated {predicted_cross_val:.4f} based on reading {s_val:.4f}.",
        )

    diff = abs(predicted_cross_val - candidate_val)

    if diff <= 2.0 * sigma_bound:
        # Corroborating consensus
        return (
            round(predicted_cross_val, 4),
            True,
            10.0,
            [evidence_ref],
            f"Cross-sensor '{best_sensor}' (r={best_r:.3f}) corroborates proposal {candidate_val:.4f} "
            f"(predicted={predicted_cross_val:.4f}, diff={diff:.4f} <= 2.0x residual std {sigma_bound:.4f}).",
        )
    elif diff > 3.5 * sigma_bound:
        # Severe evidence conflict
        return (
            round(predicted_cross_val, 4),
            False,
            -25.0,
            [evidence_ref],
            f"Cross-sensor evidence conflict: sensor '{best_sensor}' (r={best_r:.3f}) predicted {predicted_cross_val:.4f}, "
            f"conflicting with candidate {candidate_val:.4f} (diff={diff:.4f} > 3.5x residual std {sigma_bound:.4f}).",
        )
    else:
        # Moderate agreement / neutral
        return (
            round(predicted_cross_val, 4),
            None,
            0.0,
            [evidence_ref],
            f"Cross-sensor '{best_sensor}' (r={best_r:.3f}) predicted {predicted_cross_val:.4f} (diff={diff:.4f} within 3.5x residual std).",
        )
