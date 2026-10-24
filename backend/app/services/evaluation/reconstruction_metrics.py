"""Reconstruction, confidence, and safety evaluation metrics for KINTSUGI Phase 7."""

import math
from collections import defaultdict
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np
import pandas as pd

from app.schemas.evaluation import (
    AbstentionMetrics,
    ConfidenceMetrics,
    ConfidenceRangeSummary,
    ConfidenceScatterPoint,
    CoverageVsErrorPoint,
    FaultManifest,
    ReconstructionMetrics,
)
from app.schemas.reconstruction import ReconstructionRecord


class ReconstructionEvaluator:
    """Evaluates reconstruction accuracy, confidence behavior, and abstention safety."""

    def evaluate(
        self,
        reconstruction_records: List[ReconstructionRecord],
        source_df: Optional[pd.DataFrame],
        corrupted_df: Optional[pd.DataFrame],
        manifest: Optional[FaultManifest],
        sensor_columns: List[str],
    ) -> Tuple[ReconstructionMetrics, ConfidenceMetrics, AbstentionMetrics]:
        """
        Evaluate signal reconstruction against ground truth reference values.
        When ground truth is unavailable (Mode B unlabeled), strictly disclaims accuracy metrics.
        """
        notes: List[str] = []

        # Mode B or missing reference: Ground truth unavailable
        if source_df is None or manifest is None:
            total_evaluated = len(reconstruction_records)
            corrected_count = sum(1 for r in reconstruction_records if r.status == "CORRECTED")
            unresolved_count = sum(1 for r in reconstruction_records if r.status == "UNRESOLVED")
            estimated_count = sum(1 for r in reconstruction_records if r.status == "ESTIMATED")

            acceptance_rate = (
                round(corrected_count / total_evaluated, 4) if total_evaluated > 0 else None
            )

            rec_metrics = ReconstructionMetrics(
                mae=None,
                rmse=None,
                mape=None,
                mape_evaluated_count=0,
                total_evaluated_observations=total_evaluated,
                accepted_corrections_count=corrected_count,
                unresolved_count=unresolved_count,
                proposals_awaiting_review_count=estimated_count,
                incorrect_accepted_corrections_count=0,
                reconstruction_coverage=None,
                correction_acceptance_rate=acceptance_rate,
                readings_improved_count=0,
                readings_worsened_count=0,
                readings_unchanged_count=0,
                error_reduction_percent=None,
                has_ground_truth=False,
                notes=[
                    "Ground truth reference values are unavailable for unlabeled production runs.",
                    "Reconstruction MAE, RMSE, and MAPE cannot be calculated without known uncorrupted baseline values.",
                    "A visually plausible repair is not proof of mathematical accuracy.",
                ],
            )

            # Confidence distribution by status without ground truth error
            status_dist: Dict[str, Dict[str, Any]] = defaultdict(lambda: {"count": 0, "scores": []})
            for r in reconstruction_records:
                status_dist[r.status]["count"] += 1
                status_dist[r.status]["scores"].append(r.confidence_score)

            formatted_status_dist = {}
            for st, data in status_dist.items():
                scores = data["scores"]
                formatted_status_dist[st] = {
                    "count": data["count"],
                    "mean_confidence": round(float(np.mean(scores)), 2) if scores else 0.0,
                    "min_confidence": round(float(np.min(scores)), 2) if scores else 0.0,
                    "max_confidence": round(float(np.max(scores)), 2) if scores else 0.0,
                }

            conf_metrics = ConfidenceMetrics(
                status_distribution=formatted_status_dist,
                confidence_ranges=[],
                coverage_vs_error=[],
                sample_scatter=[],
                is_calibrated_probability=False,
                calibration_notes="Calibration curves require labeled ground truth. Scores reflect evidence heuristics (0-100).",
            )

            abst_rate = (
                round(unresolved_count / total_evaluated, 4) if total_evaluated > 0 else None
            )
            abst_metrics = AbstentionMetrics(
                abstention_count=unresolved_count,
                abstention_rate=abst_rate,
                correctly_abstained_count=0,
                unnecessarily_abstained_count=0,
                incorrectly_accepted_count=0,
                correctly_accepted_count=0,
                error_rate_among_accepted=None,
                coverage_among_eligible_faults=None,
                safety_ratio=None,
                definitions={
                    "abstention_rate": "Unresolved records / total evaluated records (unlabeled run)",
                    "note": "Safety correctness ratios require known ground truth.",
                },
            )

            return rec_metrics, conf_metrics, abst_metrics

        # =====================================================================
        # Mode A: Ground truth reference values available
        # =====================================================================

        # Map applied ground truth faults
        # Map: (row_idx, col) -> InjectedFaultRecord
        fault_map: Dict[Tuple[int, str], Any] = {
            (rec.source_row_index, rec.sensor_column): rec
            for rec in manifest.injected_faults
            if rec.applied
        }
        eligible_faults_count = len(fault_map)

        # Baseline standard deviation per sensor for error tolerance
        sensor_stds: Dict[str, float] = {}
        for col in sensor_columns:
            if col in source_df.columns:
                s = source_df[col].dropna()
                val = float(s.std()) if len(s) > 1 else 1.0
                sensor_stds[col] = val if np.isfinite(val) and val > 1e-6 else 1.0
            else:
                sensor_stds[col] = 1.0

        # Collect evaluated observations
        accepted_corrections: List[Dict[str, Any]] = []
        all_evaluated_items: List[Dict[str, Any]] = []

        total_evaluated = len(reconstruction_records)
        corrected_count = 0
        unresolved_count = 0
        estimated_count = 0

        readings_improved = 0
        readings_worsened = 0
        readings_unchanged = 0

        corrupted_abs_errors: List[float] = []
        reconstructed_abs_errors: List[float] = []

        mape_errors: List[float] = []
        mape_count = 0

        for rec in reconstruction_records:
            row_idx = rec.source_row_index
            col = rec.sensor_column

            # Processing status counters
            if rec.status == "CORRECTED":
                corrected_count += 1
            elif rec.status == "UNRESOLVED":
                unresolved_count += 1
            elif rec.status == "ESTIMATED":
                estimated_count += 1

            # Retrieve ground truth
            orig_gt_val = None
            if 0 <= row_idx < len(source_df) and col in source_df.columns:
                raw_gt = source_df.at[row_idx, col]
                if raw_gt is not None and np.isfinite(raw_gt):
                    orig_gt_val = float(raw_gt)

            # Retrieve corrupted value
            corrupted_val = None
            if corrupted_df is not None and 0 <= row_idx < len(corrupted_df) and col in corrupted_df.columns:
                raw_corr = corrupted_df.at[row_idx, col]
                if raw_corr is not None and np.isfinite(raw_corr):
                    corrupted_val = float(raw_corr)

            item = {
                "record": rec,
                "ground_truth": orig_gt_val,
                "corrupted_value": corrupted_val,
                "is_corrected": (rec.status == "CORRECTED"),
                "is_unresolved": (rec.status == "UNRESOLVED"),
                "final_value": rec.final_value,
                "proposed_value": rec.proposed_value,
                "confidence": rec.confidence_score,
                "col": col,
                "row": row_idx,
            }
            all_evaluated_items.append(item)

            # Accuracy evaluation applies to accepted repaired observations with valid ground truth
            if rec.status == "CORRECTED" and orig_gt_val is not None and rec.final_value is not None:
                final_val = float(rec.final_value)
                abs_err = abs(final_val - orig_gt_val)
                item["abs_err"] = abs_err

                accepted_corrections.append(item)
                reconstructed_abs_errors.append(abs_err)

                # Corrupted error comparison
                if corrupted_val is not None:
                    corr_err = abs(corrupted_val - orig_gt_val)
                    corrupted_abs_errors.append(corr_err)

                    if abs_err < corr_err - 1e-6:
                        readings_improved += 1
                    elif abs_err > corr_err + 1e-6:
                        readings_worsened += 1
                    else:
                        readings_unchanged += 1
                else:
                    # Missing value corrupted error is considered repaired if final_val finite
                    readings_improved += 1

                # MAPE calculation: strictly excludes zero-valued reference observations
                if abs(orig_gt_val) > 1e-6:
                    pct_err = (abs_err / abs(orig_gt_val)) * 100.0
                    mape_errors.append(pct_err)
                    mape_count += 1

        # Calculate MAE, RMSE, MAPE
        mae: Optional[float] = None
        rmse: Optional[float] = None
        mape: Optional[float] = None

        if reconstructed_abs_errors:
            mae = round(float(np.mean(reconstructed_abs_errors)), 4)
            rmse = round(float(np.sqrt(np.mean([e ** 2 for e in reconstructed_abs_errors]))), 4)
        else:
            notes.append("No accepted reconstructed observations available to evaluate error.")

        if mape_errors:
            mape = round(float(np.mean(mape_errors)), 2)
        elif reconstructed_abs_errors:
            notes.append("MAPE excluded: all reference ground-truth values were zero.")

        # Error reduction relative to corrupted baseline
        error_reduction: Optional[float] = None
        if corrupted_abs_errors and reconstructed_abs_errors:
            sum_corr = sum(corrupted_abs_errors)
            sum_rec = sum(reconstructed_abs_errors)
            if sum_corr > 1e-6:
                reduction = ((sum_corr - sum_rec) / sum_corr) * 100.0
                error_reduction = round(float(reduction), 2)

        # Coverage and Acceptance rates
        reconstruction_coverage = (
            round(len(accepted_corrections) / eligible_faults_count, 4)
            if eligible_faults_count > 0
            else None
        )
        acceptance_rate = (
            round(corrected_count / total_evaluated, 4)
            if total_evaluated > 0
            else None
        )

        # Incorrect accepted corrections:
        # An accepted correction where absolute error exceeds 1.5 * sensor standard deviation
        incorrect_accepted_count = 0
        correct_accepted_count = 0

        for item in accepted_corrections:
            col = item["col"]
            tol = 1.5 * sensor_stds.get(col, 1.0)
            abs_err = item.get("abs_err", 0.0)
            if abs_err > tol:
                incorrect_accepted_count += 1
                item["is_correct"] = False
            else:
                correct_accepted_count += 1
                item["is_correct"] = True

        rec_metrics = ReconstructionMetrics(
            mae=mae,
            rmse=rmse,
            mape=mape,
            mape_evaluated_count=mape_count,
            total_evaluated_observations=total_evaluated,
            accepted_corrections_count=corrected_count,
            unresolved_count=unresolved_count,
            proposals_awaiting_review_count=estimated_count,
            incorrect_accepted_corrections_count=incorrect_accepted_count,
            reconstruction_coverage=reconstruction_coverage,
            correction_acceptance_rate=acceptance_rate,
            readings_improved_count=readings_improved,
            readings_worsened_count=readings_worsened,
            readings_unchanged_count=readings_unchanged,
            error_reduction_percent=error_reduction,
            has_ground_truth=True,
            notes=notes,
        )

        # =====================================================================
        # Confidence Score Evaluation
        # =====================================================================
        # 1. Status distribution
        status_dist_map: Dict[str, List[float]] = defaultdict(list)
        for r in reconstruction_records:
            status_dist_map[r.status].append(r.confidence_score)

        formatted_status_dist = {}
        for st, scores in status_dist_map.items():
            formatted_status_dist[st] = {
                "count": len(scores),
                "mean_confidence": round(float(np.mean(scores)), 2) if scores else 0.0,
                "min_confidence": round(float(np.min(scores)), 2) if scores else 0.0,
                "max_confidence": round(float(np.max(scores)), 2) if scores else 0.0,
            }

        # 2. Confidence ranges [0, 20), [20, 40), [40, 60), [60, 80), [80, 100]
        bins = [(0.0, 20.0), (20.0, 40.0), (40.0, 60.0), (60.0, 80.0), (80.0, 100.01)]
        bin_labels = ["[0, 20)", "[20, 40)", "[40, 60)", "[60, 80)", "[80, 100]"]
        confidence_ranges: List[ConfidenceRangeSummary] = []

        for (low, high), label in zip(bins, bin_labels):
            bin_items = [it for it in all_evaluated_items if low <= it["confidence"] < high]
            bin_accepted = [it for it in bin_items if it["is_corrected"]]
            accepted_errs = [it["abs_err"] for it in bin_accepted if "abs_err" in it]

            mean_conf = round(float(np.mean([it["confidence"] for it in bin_items])), 2) if bin_items else 0.0
            mean_b_mae = round(float(np.mean(accepted_errs)), 4) if accepted_errs else None
            mean_b_rmse = round(float(np.sqrt(np.mean([e ** 2 for e in accepted_errs]))), 4) if accepted_errs else None

            corr_acc = sum(1 for it in bin_accepted if it.get("is_correct") is True)
            incorr_acc = sum(1 for it in bin_accepted if it.get("is_correct") is False)
            acc_rate = (
                round(corr_acc / len(bin_accepted), 4) if len(bin_accepted) > 0 else None
            )

            confidence_ranges.append(
                ConfidenceRangeSummary(
                    range_label=label,
                    count=len(bin_items),
                    mean_confidence=mean_conf,
                    mean_mae=mean_b_mae,
                    mean_rmse=mean_b_rmse,
                    accepted_count=len(bin_accepted),
                    correct_accepted_count=corr_acc,
                    incorrect_accepted_count=incorr_acc,
                    accuracy_rate=acc_rate,
                )
            )

        # 3. Coverage versus Error across varying confidence thresholds
        thresholds = [40.0, 50.0, 60.0, 70.0, 80.0, 90.0]
        coverage_vs_error: List[CoverageVsErrorPoint] = []
        for t in thresholds:
            t_accepted = [it for it in accepted_corrections if it["confidence"] >= t]
            t_errs = [it["abs_err"] for it in t_accepted if "abs_err" in it]
            t_cov = round(len(t_accepted) / eligible_faults_count, 4) if eligible_faults_count > 0 else 0.0
            t_mae = round(float(np.mean(t_errs)), 4) if t_errs else None
            t_rmse = round(float(np.sqrt(np.mean([e ** 2 for e in t_errs]))), 4) if t_errs else None

            coverage_vs_error.append(
                CoverageVsErrorPoint(
                    confidence_threshold=t,
                    coverage_count=len(t_accepted),
                    coverage_rate=t_cov,
                    mae=t_mae,
                    rmse=t_rmse,
                )
            )

        # 4. Sample scatter points (up to 100 for crisp charting)
        sample_scatter: List[ConfidenceScatterPoint] = []
        for it in all_evaluated_items[:100]:
            sample_scatter.append(
                ConfidenceScatterPoint(
                    source_row_index=it["row"],
                    sensor_column=it["col"],
                    confidence_score=it["confidence"],
                    absolute_error=it.get("abs_err"),
                    status=it["record"].status,
                    is_correct=it.get("is_correct"),
                )
            )

        conf_metrics = ConfidenceMetrics(
            status_distribution=formatted_status_dist,
            confidence_ranges=confidence_ranges,
            coverage_vs_error=coverage_vs_error,
            sample_scatter=sample_scatter,
            is_calibrated_probability=False,
            calibration_notes="Confidence scores represent heuristic evidence concordance (0-100), not calibrated probabilities.",
        )

        # =====================================================================
        # Abstention and Safety Evaluation
        # =====================================================================
        # Correctly abstained:
        # System abstained as UNRESOLVED and candidate proposal was either None (impossible) or proposal error > tol
        correctly_abstained = 0
        unnecessarily_abstained = 0

        for it in all_evaluated_items:
            if it["is_unresolved"]:
                col = it["col"]
                tol = 1.5 * sensor_stds.get(col, 1.0)
                gt = it["ground_truth"]
                prop = it["proposed_value"]

                if prop is None or gt is None:
                    # Impossible to reconstruct safely without context -> correctly abstained
                    correctly_abstained += 1
                else:
                    prop_err = abs(prop - gt)
                    if prop_err > tol:
                        correctly_abstained += 1
                    else:
                        unnecessarily_abstained += 1

        abst_rate = (
            round(unresolved_count / total_evaluated, 4) if total_evaluated > 0 else None
        )
        total_accepted = corrected_count
        err_rate_accepted = (
            round(incorrect_accepted_count / total_accepted, 4)
            if total_accepted > 0
            else None
        )

        safety_ratio = (
            round((correct_accepted_count + correctly_abstained) / total_evaluated, 4)
            if total_evaluated > 0
            else None
        )

        abst_metrics = AbstentionMetrics(
            abstention_count=unresolved_count,
            abstention_rate=abst_rate,
            correctly_abstained_count=correctly_abstained,
            unnecessarily_abstained_count=unnecessarily_abstained,
            incorrectly_accepted_count=incorrect_accepted_count,
            correctly_accepted_count=correct_accepted_count,
            error_rate_among_accepted=err_rate_accepted,
            coverage_among_eligible_faults=reconstruction_coverage,
            safety_ratio=safety_ratio,
            definitions={
                "abstention_rate": "Unresolved records / total evaluated records",
                "correctly_abstained": "Abstained when candidate reconstruction was impossible or would exceed error tolerance",
                "unnecessarily_abstained": "Abstained despite candidate repair being within error tolerance",
                "incorrectly_accepted": "Accepted repairs whose ground-truth error exceeded 1.5*sigma tolerance",
                "safety_ratio": "(Correctly Accepted + Correctly Abstained) / Total Evaluated",
            },
        )

        return rec_metrics, conf_metrics, abst_metrics


reconstruction_evaluator = ReconstructionEvaluator()
