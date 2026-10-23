import uuid
from typing import Dict, List, Optional
from app.schemas.anomaly import AnomalyRecord, AnomalySeverity, ConsensusType, DetectorResultDetail


def aggregate_observation_anomaly(
    run_id: str,
    dataset_id: str,
    configuration_id: str,
    sensor_column: str,
    source_row_index: int,
    timestamp_val: Optional[str],
    original_value: Optional[float],
    stat_result: Optional[DetectorResultDetail],
    iso_result: Optional[DetectorResultDetail],
) -> Optional[AnomalyRecord]:
    """
    Explicit aggregation policy for multi-detector results on a single sensor observation.

    Aggregation Policy Specification:
    1. Independent Detector Audit:
       Each enabled detector evaluates the observation independently. Their discrete scores,
       baselines, and reasoning are permanently retained in detector_details.
    2. Consensus Classification:
       - MULTI_DETECTOR: Both Statistical MAD and Isolation Forest flagged the observation.
       - SINGLE_DETECTOR: Exactly one detector flagged the observation.
       - None: Neither detector flagged the observation (not recorded as an anomaly).
    3. Documented Severity Rubric:
       - CRITICAL: Consensus agreement (MULTI_DETECTOR) where statistical deviation > 2.0x threshold
         or Isolation Forest partition score < -0.15.
       - HIGH: Any MULTI_DETECTOR flag, OR a single-detector flag with extreme deviation
         (MAD score > 2.0x threshold or IF score < -0.15).
       - MEDIUM: A single detector flag at nominal threshold margins.
       - LOW: Borderline flag near the threshold boundary.
    4. Mathematical Suspicion vs Fault Disclaimer:
       Detector agreement indicates corroborating mathematical suspicion across localized
       dispersion and recursive tree partitioning; it does NOT constitute physical proof of a hardware fault.
    """
    flagged_detectors: List[str] = []
    detector_details: Dict[str, DetectorResultDetail] = {}

    if stat_result is not None:
        detector_details["statistical_mad"] = stat_result
        if stat_result.flagged:
            flagged_detectors.append("statistical_mad")

    if iso_result is not None:
        detector_details["isolation_forest"] = iso_result
        if iso_result.flagged:
            flagged_detectors.append("isolation_forest")

    # If neither detector flagged this observation, it is nominal (no anomaly record)
    if not flagged_detectors:
        return None

    # Determine consensus status
    if len(flagged_detectors) >= 2:
        consensus: ConsensusType = "MULTI_DETECTOR"
        primary_detector = "multi_detector"
        primary_score = stat_result.score if (stat_result and stat_result.score is not None) else (iso_result.score if iso_result else None)

        # Check for extreme deviation in either detector
        extreme_stat = bool(stat_result and stat_result.score and stat_result.threshold and stat_result.score >= 2.0 * stat_result.threshold)
        extreme_iso = bool(iso_result and iso_result.score and iso_result.score <= -0.15)

        if extreme_stat or extreme_iso:
            severity: AnomalySeverity = "CRITICAL"
        else:
            severity: AnomalySeverity = "HIGH"

        reason = (
            f"Corroborating multi-detector consensus: observation flagged simultaneously by "
            f"{' and '.join(flagged_detectors)}. "
            f"MAD score: {stat_result.score if stat_result else 'N/A'}, "
            f"IF score: {iso_result.score if iso_result else 'N/A'}."
        )

    else:
        consensus = "SINGLE_DETECTOR"
        single_det = flagged_detectors[0]
        primary_detector = single_det

        if single_det == "statistical_mad" and stat_result:
            primary_score = stat_result.score
            reason = stat_result.reason
            if stat_result.score and stat_result.threshold and stat_result.score >= 2.0 * stat_result.threshold:
                severity = "HIGH"
            elif stat_result.score and stat_result.threshold and stat_result.score <= stat_result.threshold * 1.15:
                severity = "LOW"
            else:
                severity = "MEDIUM"

        elif single_det == "isolation_forest" and iso_result:
            primary_score = iso_result.score
            reason = iso_result.reason
            if iso_result.score and iso_result.score <= -0.15:
                severity = "HIGH"
            elif iso_result.score and iso_result.score >= -0.02:
                severity = "LOW"
            else:
                severity = "MEDIUM"
        else:
            primary_score = None
            reason = "Flagged by single detector"
            severity = "MEDIUM"

    anomaly_id = f"anom_{uuid.uuid4().hex[:12]}"

    return AnomalyRecord(
        anomaly_id=anomaly_id,
        run_id=run_id,
        dataset_id=dataset_id,
        configuration_id=configuration_id,
        sensor_column=sensor_column,
        source_row_index=source_row_index,
        timestamp=str(timestamp_val) if timestamp_val is not None else None,
        original_value=float(original_value) if (original_value is not None and not math_isnan(original_value)) else None,
        detector_name=primary_detector,
        detector_score=round(float(primary_score), 4) if primary_score is not None else None,
        detection_reason=reason,
        severity=severity,
        flagged_status="FLAGGED",
        consensus=consensus,
        detectors_flagged=flagged_detectors,
        detector_details=detector_details,
    )


def math_isnan(val: float) -> bool:
    try:
        import math
        return math.isnan(val)
    except Exception:
        return False
