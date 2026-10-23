import math
from typing import List, Optional
import numpy as np
import pandas as pd

from app.schemas.anomaly import DetectorResultDetail


def detect_statistical_mad(
    series: pd.Series,
    window_size: int = 30,
    mad_threshold: float = 3.5,
    min_observations: int = 10,
) -> List[DetectorResultDetail]:
    """
    Robust statistical anomaly detection using a localized trailing rolling window median
    and Median Absolute Deviation (MAD).

    Architectural Invariants & Policies:
    1. Trailing Window Baseline:
       For index i, the evaluation window spans [max(0, i - window_size + 1) : i + 1].
       The current observation participates in the localized window baseline. Because the median
       and MAD have a 50% breakdown point, isolated transient spikes cannot distort the baseline.
    2. Edge Window & Insufficient History Policy:
       If the count of valid finite observations in the localized window is less than min_observations,
       the detector abstains from flagging the observation and records insufficient history.
    3. Missing and Non-Finite Values:
       NaN, null, and infinite values in the input series are preserved as-is. They are excluded from
       the numeric dispersion calculation and recorded as unassessed non-finite observations.
    4. Zero-MAD & Constant-Signal Policy:
       When over 50% of the observations in the window are identical, MAD evaluates to 0.0.
       - If the current value matches the median within floating-point tolerance (<= 1e-9), it is NOT flagged.
         This prevents false positive cascades across constant or frozen physical signals.
       - If the current value deviates from the constant median by more than 1e-9, it represents an unambiguous
         step or impulse away from a zero-dispersion baseline and is flagged with score = 999.0.
    5. No Probability Claims:
       The resulting score (deviation / MAD) is a multiples-of-dispersion distance metric,
       not a calibrated probability.
    """
    results: List[DetectorResultDetail] = []
    n = len(series)
    values = series.to_numpy(dtype=float, na_value=np.nan)

    for i in range(n):
        val = values[i]

        # 1. Non-finite / missing check for current observation
        if not np.isfinite(val):
            results.append(
                DetectorResultDetail(
                    detector_name="statistical_mad",
                    flagged=False,
                    score=None,
                    reason="Observation is missing or non-finite (NaN/Inf); statistical outlier detection requires finite scalar",
                    threshold=mad_threshold,
                    baseline=None,
                    dispersion=None,
                )
            )
            continue

        # 2. Extract trailing window
        start_idx = max(0, i - window_size + 1)
        window = values[start_idx : i + 1]
        valid_window = window[np.isfinite(window)]

        # 3. Insufficient observation history check
        if len(valid_window) < min_observations:
            results.append(
                DetectorResultDetail(
                    detector_name="statistical_mad",
                    flagged=False,
                    score=None,
                    reason=f"Insufficient valid historical observations in trailing window ({len(valid_window)} < {min_observations})",
                    threshold=mad_threshold,
                    baseline=None,
                    dispersion=None,
                )
            )
            continue

        # 4. Compute Median and MAD
        med = float(np.median(valid_window))
        abs_deviations = np.abs(valid_window - med)
        mad = float(np.median(abs_deviations))

        # 5. Zero-MAD handling (constant signal window)
        if mad <= 1e-12:
            diff = abs(val - med)
            if diff <= 1e-9:
                results.append(
                    DetectorResultDetail(
                        detector_name="statistical_mad",
                        flagged=False,
                        score=0.0,
                        reason="Observation matches window median in zero-dispersion window",
                        threshold=mad_threshold,
                        baseline=med,
                        dispersion=0.0,
                    )
                )
            else:
                # Sudden deviation from completely constant baseline
                score = 999.0
                results.append(
                    DetectorResultDetail(
                        detector_name="statistical_mad",
                        flagged=True,
                        score=score,
                        reason=(
                            f"Observation {val:.4f} deviated by {diff:.4f} from constant window "
                            f"median {med:.4f} where dispersion (MAD) is zero"
                        ),
                        threshold=mad_threshold,
                        baseline=med,
                        dispersion=0.0,
                    )
                )
            continue

        # 6. Standard MAD distance calculation
        diff = abs(val - med)
        score = float(diff / mad)
        flagged = bool(score > mad_threshold)

        if flagged:
            reason = (
                f"Observation {val:.4f} deviated {diff:.4f} from rolling median {med:.4f}, "
                f"exceeding {mad_threshold:.1f}x rolling MAD ({mad:.4f}); score={score:.2f}"
            )
        else:
            reason = (
                f"Nominal: observation {val:.4f} deviation {diff:.4f} is within {mad_threshold:.1f}x "
                f"rolling MAD ({mad:.4f}); score={score:.2f}"
            )

        results.append(
            DetectorResultDetail(
                detector_name="statistical_mad",
                flagged=flagged,
                score=round(score, 4),
                reason=reason,
                threshold=mad_threshold,
                baseline=round(med, 4),
                dispersion=round(mad, 4),
            )
        )

    return results
