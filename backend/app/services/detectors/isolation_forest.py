from typing import Dict, List, Tuple
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from app.schemas.anomaly import DetectorResultDetail


def detect_isolation_forest(
    df: pd.DataFrame,
    sensor_columns: List[str],
    contamination: float = 0.05,
    random_seed: int = 42,
    min_observations: int = 50,
) -> Tuple[List[DetectorResultDetail], List[str]]:
    """
    Multivariate anomaly detection using scikit-learn's IsolationForest across
    the selected numeric sensor channels.

    Architectural Invariants & Policies:
    1. Usable Observation & Finite Filtering:
       Isolation Forest requires finite 2D floating-point vectors. Rows containing any
       NaN, null, or Inf values across the configured sensor columns are filtered out for model
       fitting, while preserving their exact source row indices (0-indexed). Filtered rows are
       recorded as unassessed non-finite observations.
    2. Minimum Observation Requirement:
       If the number of usable finite observations is less than min_observations, the detector
       strictly abstains from fitting or guessing, returning an advisory warning.
    3. Zero Variance & Degenerate Cases:
       If all sensor columns exhibit zero variance (all identical rows), Isolation Forest is bypassed
       to prevent division by zero or degenerate tree splits.
    4. Determinism & Reproducibility:
       The random_state is explicitly seeded with random_seed, guaranteeing reproducible results
       across repeated runs with identical configurations and data.
    5. Anomaly Scores:
       Scores are extracted from clf.decision_function() where negative values denote anomaly points.
       These scores represent tree partition depths, NOT calibrated probabilities.
    """
    n_rows = len(df)
    warnings: List[str] = []
    results: List[DetectorResultDetail] = []

    if not sensor_columns:
        warning_msg = "No sensor columns provided for Isolation Forest detection."
        warnings.append(warning_msg)
        for _ in range(n_rows):
            results.append(
                DetectorResultDetail(
                    detector_name="isolation_forest",
                    flagged=False,
                    score=None,
                    reason=warning_msg,
                    threshold=0.0,
                )
            )
        return results, warnings

    # Extract numerical matrix for target sensor columns
    sub_df = df[sensor_columns]
    matrix = sub_df.to_numpy(dtype=float, na_value=np.nan)

    # 1. Identify valid finite rows across all sensor dimensions
    finite_mask = np.all(np.isfinite(matrix), axis=1)
    valid_indices = np.where(finite_mask)[0]
    n_valid = len(valid_indices)

    # 2. Check minimum observation requirement
    if n_valid < min_observations:
        warning_msg = (
            f"Insufficient usable finite rows for Isolation Forest "
            f"({n_valid} usable < {min_observations} minimum required)."
        )
        warnings.append(warning_msg)
        for i in range(n_rows):
            if not finite_mask[i]:
                reason = "Row contains non-finite or missing values in sensor channels; excluded from Isolation Forest"
            else:
                reason = warning_msg
            results.append(
                DetectorResultDetail(
                    detector_name="isolation_forest",
                    flagged=False,
                    score=None,
                    reason=reason,
                    threshold=0.0,
                )
            )
        return results, warnings

    # 3. Check for zero variance across all sensors
    valid_matrix = matrix[valid_indices]
    variances = np.nanvar(valid_matrix, axis=0)
    if np.all(variances <= 1e-12):
        warning_msg = "Sensor data has zero variance across all features (constant signal); Isolation Forest bypassed."
        warnings.append(warning_msg)
        for _ in range(n_rows):
            results.append(
                DetectorResultDetail(
                    detector_name="isolation_forest",
                    flagged=False,
                    score=0.0,
                    reason="All sensor features exhibit zero variance (constant signal); Isolation Forest bypassed",
                    threshold=0.0,
                )
            )
        return results, warnings

    # 4. Fit Isolation Forest on finite observations
    try:
        bounded_contamination = max(0.001, min(0.5, float(contamination)))
        clf = IsolationForest(
            contamination=bounded_contamination,
            random_state=int(random_seed),
            n_estimators=100,
        )
        clf.fit(valid_matrix)

        # Predict (-1: anomaly, 1: inlier)
        predictions = clf.predict(valid_matrix)
        # Decision function: negative values indicate anomalies
        decision_scores = clf.decision_function(valid_matrix)

        # Build map from valid index position to row index
        pred_map = {}
        for pos, row_idx in enumerate(valid_indices):
            pred_map[row_idx] = (predictions[pos], decision_scores[pos])

        # 5. Populate per-row results preserving exact original row ordering
        for i in range(n_rows):
            if i in pred_map:
                pred, score = pred_map[i]
                is_anomaly = bool(pred == -1)
                score_val = float(score)
                if is_anomaly:
                    reason = (
                        f"Isolation Forest multi-sensor tree isolation score ({score_val:.4f}) "
                        f"is below zero offset threshold"
                    )
                else:
                    reason = f"Nominal: multi-sensor observation is an inlier (decision score: {score_val:.4f})"

                results.append(
                    DetectorResultDetail(
                        detector_name="isolation_forest",
                        flagged=is_anomaly,
                        score=round(score_val, 4),
                        reason=reason,
                        threshold=0.0,
                    )
                )
            else:
                results.append(
                    DetectorResultDetail(
                        detector_name="isolation_forest",
                        flagged=False,
                        score=None,
                        reason="Row contains non-finite or missing values in sensor channels; excluded from Isolation Forest",
                        threshold=0.0,
                    )
                )

        return results, warnings

    except Exception as e:
        warning_msg = f"Isolation Forest execution encountered unexpected failure: {str(e)}"
        warnings.append(warning_msg)
        for _ in range(n_rows):
            results.append(
                DetectorResultDetail(
                    detector_name="isolation_forest",
                    flagged=False,
                    score=None,
                    reason=warning_msg,
                    threshold=0.0,
                )
            )
        return results, warnings
