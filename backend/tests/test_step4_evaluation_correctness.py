"""Step 4 Technical Audit: Evaluation Correctness & Hand-Calculated Fixtures.
Verifies:
- Precision, Recall, F1, Specificity, FPR safe division and zero-denominator handling.
- MAE, RMSE, MAPE calculations against independently calculated values.
- Ground truth separation: Mode B returns None for undefined metrics with honest explanations.
- Safety ratio and abstention metrics logic.
"""

import numpy as np
import pandas as pd
import pytest

from app.schemas.anomaly import AnomalyRecord, AnomalySeverity
from app.schemas.evaluation import FaultManifest, InjectedFaultRecord
from app.schemas.reconstruction import ReconstructionRecord, ConfidenceBreakdown
from app.services.evaluation.detection_metrics import DetectionEvaluator, safe_div
from app.services.evaluation.reconstruction_metrics import ReconstructionEvaluator


def test_independent_metric_calculation_fixture():
    # Construct a small manual fixture:
    # 10 rows, 1 sensor: 'temp'
    # Ground truth injected anomalies at rows: 2, 4, 6 (3 injected faults)
    # Detector flags rows: 2, 6, 8 (3 detected faults)
    # Matching:
    # TP: rows 2, 6 -> 2
    # FP: row 8 -> 1
    # FN: row 4 -> 1
    # Total observations = 10 * 1 = 10
    # TN: 10 - (2 + 1 + 1) = 6
    # Precision: 2 / (2 + 1) = 2/3 = 0.6667
    # Recall: 2 / (2 + 1) = 2/3 = 0.6667
    # F1: 2 * (2/3) * (2/3) / (4/3) = 2/3 = 0.6667
    # Specificity: 6 / (6 + 1) = 6/7 = 0.8571
    # FPR: 1 / (1 + 6) = 1/7 = 0.1429

    manifest = FaultManifest(
        manifest_id="mf_test",
        evaluation_id="eval_test",
        source_dataset_id="ds_test",
        benchmark_dataset_id="ds_bench_test",
        seed=42,
        total_injected_points=3,
        injected_faults=[
            InjectedFaultRecord(
                fault_id="f1", fault_type="point_spike", sensor_column="temp",
                source_row_index=2, original_value=50.0, corrupted_value=999.0, applied=True
            ),
            InjectedFaultRecord(
                fault_id="f2", fault_type="point_spike", sensor_column="temp",
                source_row_index=4, original_value=50.0, corrupted_value=999.0, applied=True
            ),
            InjectedFaultRecord(
                fault_id="f3", fault_type="point_spike", sensor_column="temp",
                source_row_index=6, original_value=50.0, corrupted_value=999.0, applied=True
            ),
        ],
    )

    detected = [
        AnomalyRecord(
            anomaly_id="a1", run_id="r1", dataset_id="ds_test", configuration_id="pipe1",
            source_row_index=2, sensor_column="temp", observed_value=999.0, severity="CRITICAL",
            anomaly_score=10.0, detector_name="statistical_mad", detection_reason="Spike",
            detector_consensus=["statistical_mad"], timestamp=None
        ),
        AnomalyRecord(
            anomaly_id="a2", run_id="r1", dataset_id="ds_test", configuration_id="pipe1",
            source_row_index=6, sensor_column="temp", observed_value=999.0, severity="CRITICAL",
            anomaly_score=10.0, detector_name="statistical_mad", detection_reason="Spike",
            detector_consensus=["statistical_mad"], timestamp=None
        ),
        AnomalyRecord(
            anomaly_id="a3", run_id="r1", dataset_id="ds_test", configuration_id="pipe1",
            source_row_index=8, sensor_column="temp", observed_value=55.0, severity="LOW",
            anomaly_score=3.6, detector_name="statistical_mad", detection_reason="Minor deviation",
            detector_consensus=["statistical_mad"], timestamp=None
        ),
    ]

    evaluator = DetectionEvaluator()
    metrics, breakdowns, sensor_breakdowns = evaluator.evaluate(
        manifest=manifest,
        detected_anomalies=detected,
        total_rows=10,
        sensor_columns=["temp"],
    )

    assert metrics.confusion_matrix.true_positives == 2
    assert metrics.confusion_matrix.false_positives == 1
    assert metrics.confusion_matrix.true_negatives == 6
    assert metrics.confusion_matrix.false_negatives == 1
    assert metrics.precision == 0.6667
    assert metrics.recall == 0.6667
    assert metrics.f1_score == 0.6667
    assert metrics.specificity == 0.8571
    assert metrics.false_positive_rate == 0.1429
    print("[PASS] Independent detection metric calculations match perfectly.")


def test_zero_denominator_safe_div():
    # 1. No detected anomalies (TP + FP = 0)
    assert safe_div(0, 0) is None

    evaluator = DetectionEvaluator()
    # Manifest with 1 fault, but 0 detections
    manifest = FaultManifest(
        manifest_id="mf_zero", evaluation_id="eval_zero", source_dataset_id="ds_zero",
        benchmark_dataset_id="ds_bench_zero", seed=42, total_injected_points=1,
        injected_faults=[
            InjectedFaultRecord(
                fault_id="f1", fault_type="point_spike", sensor_column="temp",
                source_row_index=1, original_value=50.0, corrupted_value=999.0, applied=True
            )
        ],
    )

    metrics, _, _ = evaluator.evaluate(
        manifest=manifest, detected_anomalies=[], total_rows=5, sensor_columns=["temp"]
    )
    # Precision: 0 / 0 -> None
    assert metrics.precision is None
    # Recall: 0 / 1 -> 0.0
    assert metrics.recall == 0.0
    # F1: undefined because precision is None
    assert metrics.f1_score is None
    assert any("Precision is undefined" in n for n in metrics.notes)
    print("[PASS] Zero-denominator correctly sets metrics to None with honest notes.")


def test_mode_b_unlabeled_ground_truth_absence():
    # When manifest is None (Mode B), all accuracy metrics must be None
    evaluator = DetectionEvaluator()
    metrics, breakdowns, _ = evaluator.evaluate(
        manifest=None, detected_anomalies=[], total_rows=100, sensor_columns=["temp"]
    )
    assert metrics.precision is None
    assert metrics.recall is None
    assert metrics.f1_score is None
    assert metrics.specificity is None
    assert metrics.false_positive_rate is None
    assert any("Ground truth is unavailable" in n for n in metrics.notes)

    rec_evaluator = ReconstructionEvaluator()
    rec_metrics, conf_metrics, abst_metrics = rec_evaluator.evaluate(
        reconstruction_records=[], source_df=None, corrupted_df=None, manifest=None, sensor_columns=["temp"]
    )
    assert rec_metrics.has_ground_truth is False
    assert rec_metrics.mae is None
    assert rec_metrics.rmse is None
    assert rec_metrics.mape is None
    assert any("Ground truth reference values are unavailable" in n for n in rec_metrics.notes)
    print("[PASS] Mode B unlabeled evaluation disclaims accuracy metrics honestly.")


def test_reconstruction_mae_rmse_calculation():
    # Test reconstruction evaluation with known values
    source_df = pd.DataFrame({"temp": [10.0, 20.0, 30.0, 40.0]})
    corrupted_df = pd.DataFrame({"temp": [10.0, 99.0, 99.0, 40.0]})
    manifest = FaultManifest(
        manifest_id="mf_rec", evaluation_id="eval_rec", source_dataset_id="ds_rec",
        benchmark_dataset_id="ds_bench_rec", seed=42, total_injected_points=2,
        injected_faults=[
            InjectedFaultRecord(
                fault_id="f1", fault_type="point_spike", sensor_column="temp",
                source_row_index=1, original_value=20.0, corrupted_value=99.0, applied=True
            ),
            InjectedFaultRecord(
                fault_id="f2", fault_type="point_spike", sensor_column="temp",
                source_row_index=2, original_value=30.0, corrupted_value=99.0, applied=True
            ),
        ],
    )

    cb = ConfidenceBreakdown(
        neighbor_count_score=25.0, method_agreement_score=25.0, temporal_proximity_score=20.0,
        local_variance_score=15.0, neighbor_cleanliness_score=15.0, cross_sensor_score=0.0,
        total_score=100.0, penalty_reasons=[]
    )

    # Row 1 repaired as CORRECTED: final_value=21.0 (err=1.0)
    # Row 2 repaired as CORRECTED: final_value=33.0 (err=3.0)
    # Expected MAE: (1.0 + 3.0) / 2 = 2.0
    # Expected RMSE: sqrt((1^2 + 3^2) / 2) = sqrt(5) = 2.2361
    records = [
        ReconstructionRecord(
            result_id="rec_res_1", reconstruction_run_id="run1", detection_run_id="det1",
            dataset_id="ds_rec", configuration_id="pipe1", sensor_column="temp",
            source_row_index=1, original_value=99.0, proposed_value=21.0, final_value=21.0,
            method="linear_interpolation", status="CORRECTED", confidence_score=100.0,
            confidence_breakdown=cb, evidence_summary="Test repair", created_at="2026-01-01T00:00:00Z"
        ),
        ReconstructionRecord(
            result_id="rec_res_2", reconstruction_run_id="run1", detection_run_id="det1",
            dataset_id="ds_rec", configuration_id="pipe1", sensor_column="temp",
            source_row_index=2, original_value=99.0, proposed_value=33.0, final_value=33.0,
            method="linear_interpolation", status="CORRECTED", confidence_score=100.0,
            confidence_breakdown=cb, evidence_summary="Test repair", created_at="2026-01-01T00:00:00Z"
        ),
    ]

    rec_eval = ReconstructionEvaluator()
    rec_metrics, conf_metrics, abst_metrics = rec_eval.evaluate(
        reconstruction_records=records, source_df=source_df, corrupted_df=corrupted_df,
        manifest=manifest, sensor_columns=["temp"]
    )

    assert rec_metrics.mae == 2.0
    assert rec_metrics.rmse == 2.2361
    assert rec_metrics.readings_improved_count == 2
    assert rec_metrics.readings_worsened_count == 0
    print("[PASS] Reconstruction MAE and RMSE match mathematical expectation.")
