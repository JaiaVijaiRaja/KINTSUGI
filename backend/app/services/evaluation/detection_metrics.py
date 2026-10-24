"""Quantitative detection evaluation metrics for KINTSUGI Phase 7."""

from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

from app.schemas.anomaly import AnomalyRecord
from app.schemas.evaluation import (
    ConfusionMatrix,
    DetectionMetrics,
    EventLevelMetrics,
    FaultManifest,
    FaultTypeBreakdown,
    SensorBreakdown,
)


def safe_div(num: float, den: float) -> Optional[float]:
    """Safe division returning None when denominator is zero, preventing arbitrary invented metrics."""
    if den == 0.0:
        return None
    res = num / den
    return round(float(res), 4)


class DetectionEvaluator:
    """Evaluates anomaly detection performance against known ground truth."""

    def evaluate(
        self,
        manifest: Optional[FaultManifest],
        detected_anomalies: List[AnomalyRecord],
        total_rows: int,
        sensor_columns: List[str],
    ) -> Tuple[DetectionMetrics, List[FaultTypeBreakdown], List[SensorBreakdown]]:
        """
        Compute binary classification metrics (TP, FP, TN, FN, Precision, Recall, F1, Specificity, FPR),
        event-level metrics for interval faults, and breakdowns per sensor and fault type.
        """
        # If no manifest exists (e.g. Mode B unlabeled data), return documented None state
        if manifest is None:
            total_labeled = total_rows * len(sensor_columns)
            detected_count = len(detected_anomalies)
            cm = ConfusionMatrix(
                true_positives=0,
                false_positives=0,
                true_negatives=0,
                false_negatives=0,
                total_labeled_observations=total_labeled,
            )
            metrics = DetectionMetrics(
                confusion_matrix=cm,
                precision=None,
                recall=None,
                f1_score=None,
                specificity=None,
                false_positive_rate=None,
                injected_faults_count=0,
                detected_faults_count=detected_count,
                evaluation_unit="sensor_observation_pair",
                event_level=None,
                notes=[
                    "Ground truth is unavailable for unlabeled runs.",
                    "Precision, Recall, F1, Specificity, and FPR cannot be legitimately calculated without known true anomaly labels.",
                ],
            )
            # Build sensor breakdown of detected counts only
            detected_by_col: Dict[str, int] = defaultdict(int)
            for a in detected_anomalies:
                detected_by_col[a.sensor_column] += 1
            s_breakdowns = [
                SensorBreakdown(
                    sensor_column=col,
                    injected_count=0,
                    detected_count=detected_by_col[col],
                    precision=None,
                    recall=None,
                    f1_score=None,
                    mae=None,
                    rmse=None,
                )
                for col in sensor_columns
            ]
            return metrics, [], s_breakdowns

        # Mode A: Ground truth manifest is available
        notes: List[str] = []

        # 1. Map ground truth injected faults (only applied faults)
        # Unit: (source_row_index, sensor_column)
        injected_map: Dict[Tuple[int, str], str] = {}  # (row, col) -> fault_type
        faults_by_type: Dict[str, Set[Tuple[int, str]]] = defaultdict(set)
        intervals_map: Dict[str, List[Tuple[int, str, int]]] = defaultdict(list)  # interval_id -> list of (row, col, step_idx)

        for rec in manifest.injected_faults:
            if rec.applied:
                pair = (rec.source_row_index, rec.sensor_column)
                injected_map[pair] = rec.fault_type
                faults_by_type[rec.fault_type].add(pair)
                if rec.is_interval and rec.interval_id:
                    intervals_map[rec.interval_id].append((rec.source_row_index, rec.sensor_column, rec.interval_index or 0))

        # 2. Map detected anomaly observations
        # Avoid counting multiple detectors on the same observation as multiple detections
        detected_set: Set[Tuple[int, str]] = set()
        for a in detected_anomalies:
            detected_set.add((a.source_row_index, a.sensor_column))

        # 3. Calculate Confusion Matrix across all (row, sensor) pairs in the evaluation domain
        total_sensor_obs = total_rows * len(sensor_columns)
        tp_pairs = detected_set.intersection(injected_map.keys())
        fp_pairs = detected_set - injected_map.keys()
        fn_pairs = set(injected_map.keys()) - detected_set

        tp = len(tp_pairs)
        fp = len(fp_pairs)
        fn = len(fn_pairs)
        # TN = Total observations - (TP + FP + FN)
        tn = max(0, total_sensor_obs - (tp + fp + fn))

        cm = ConfusionMatrix(
            true_positives=tp,
            false_positives=fp,
            true_negatives=tn,
            false_negatives=fn,
            total_labeled_observations=total_sensor_obs,
        )

        # 4. Calculate Rates with strict zero-denominator safeguards
        precision = safe_div(tp, tp + fp)
        if precision is None:
            notes.append("Precision is undefined: No positive anomalies were detected (TP + FP = 0).")

        recall = safe_div(tp, tp + fn)
        if recall is None:
            notes.append("Recall is undefined: No faults were injected into the evaluated dataset (TP + FN = 0).")

        f1: Optional[float] = None
        if precision is not None and recall is not None:
            denom = precision + recall
            if denom > 0:
                f1 = round((2.0 * precision * recall) / denom, 4)
            else:
                f1 = 0.0
        else:
            notes.append("F1 score is undefined because precision or recall is undefined.")

        specificity = safe_div(tn, tn + fp)
        if specificity is None:
            notes.append("Specificity is undefined: TN + FP = 0.")

        fpr = safe_div(fp, fp + tn)
        if fpr is None:
            notes.append("False Positive Rate is undefined: FP + TN = 0.")

        # 5. Event-level metrics for interval faults (drift, frozen, gap)
        event_level: Optional[EventLevelMetrics] = None
        if intervals_map:
            total_events = len(intervals_map)
            detected_events = 0
            latencies: List[int] = []

            for int_id, obs_list in intervals_map.items():
                # Sort by step index
                sorted_obs = sorted(obs_list, key=lambda x: x[2])
                flagged_steps = [item[2] for item in sorted_obs if (item[0], item[1]) in detected_set]
                if flagged_steps:
                    detected_events += 1
                    latencies.append(min(flagged_steps))

            ev_rate = safe_div(detected_events, total_events)
            mean_latency = round(float(sum(latencies) / len(latencies)), 2) if latencies else None
            event_level = EventLevelMetrics(
                total_interval_events=total_events,
                detected_interval_events=detected_events,
                event_detection_rate=ev_rate,
                mean_event_detection_latency_steps=mean_latency,
            )

        det_metrics = DetectionMetrics(
            confusion_matrix=cm,
            precision=precision,
            recall=recall,
            f1_score=f1,
            specificity=specificity,
            false_positive_rate=fpr,
            injected_faults_count=len(injected_map),
            detected_faults_count=len(detected_set),
            evaluation_unit="sensor_observation_pair",
            event_level=event_level,
            notes=notes,
        )

        # 6. Fault-type breakdowns
        fault_breakdowns: List[FaultTypeBreakdown] = []
        all_fault_types = sorted(list(faults_by_type.keys()))
        for ftype in all_fault_types:
            ftype_injected = faults_by_type[ftype]
            ftype_tp = len(detected_set.intersection(ftype_injected))
            ftype_fn = len(ftype_injected - detected_set)
            # False positives are non-injected observations flagged
            # We assign baseline FP proportionally or as overall FP
            ftype_p = safe_div(ftype_tp, ftype_tp + fp) if (ftype_tp + fp) > 0 else None
            ftype_r = safe_div(ftype_tp, len(ftype_injected)) if len(ftype_injected) > 0 else None
            ftype_f1 = None
            if ftype_p is not None and ftype_r is not None and (ftype_p + ftype_r) > 0:
                ftype_f1 = round((2.0 * ftype_p * ftype_r) / (ftype_p + ftype_r), 4)

            fb = FaultTypeBreakdown(
                fault_type=ftype,
                injected_count=len(ftype_injected),
                detected_count=ftype_tp,
                tp=ftype_tp,
                fp=fp,
                fn=ftype_fn,
                precision=ftype_p,
                recall=ftype_r,
                f1_score=ftype_f1,
                reconstructed_count=0,
                mae=None,
                rmse=None,
                notes=None,
            )
            fault_breakdowns.append(fb)

        # 7. Sensor breakdowns
        sensor_breakdowns: List[SensorBreakdown] = []
        for col in sensor_columns:
            col_injected = {pair for pair in injected_map.keys() if pair[1] == col}
            col_detected = {pair for pair in detected_set if pair[1] == col}
            col_tp = len(col_detected.intersection(col_injected))
            col_fp = len(col_detected - col_injected)
            col_fn = len(col_injected - col_detected)

            col_p = safe_div(col_tp, col_tp + col_fp)
            col_r = safe_div(col_tp, len(col_injected))
            col_f1 = None
            if col_p is not None and col_r is not None and (col_p + col_r) > 0:
                col_f1 = round((2.0 * col_p * col_r) / (col_p + col_r), 4)

            sb = SensorBreakdown(
                sensor_column=col,
                injected_count=len(col_injected),
                detected_count=len(col_detected),
                precision=col_p,
                recall=col_r,
                f1_score=col_f1,
                mae=None,
                rmse=None,
                status_counts={},
            )
            sensor_breakdowns.append(sb)

        return det_metrics, fault_breakdowns, sensor_breakdowns


detection_evaluator = DetectionEvaluator()
