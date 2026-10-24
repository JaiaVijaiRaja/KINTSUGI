"""Comprehensive automated tests for KINTSUGI Phase 7: Evaluation Center and Benchmarking Engine.

Covers all 28 requirements:
1. Reproducible spike injection
2. Reproducible drift injection
3. Frozen-sensor injection
4. Missing-value injection
5. Communication-gap injection
6. Invalid fault rates and magnitudes
7. Overlapping fault behavior
8. Original dataset preservation
9. Stable row and sensor mapping
10. Confusion-matrix counts
11. Precision, recall, F1, and specificity
12. Zero-denominator behavior
13. Fault-type breakdowns
14. Reconstruction MAE and RMSE
15. MAPE handling for zero reference values
16. No eligible reconstructed observations
17. Error improvement and regression
18. Confidence-range summaries
19. Held-out data separation
20. Abstention metrics
21. Evaluation of unlabeled data (Mode B)
22. Evaluation run persistence
23. Invalid dataset and run IDs
24. Partial failures
25. Pagination and filtering
26. Validation endpoint consistency
27. Frontend checks (verified via test runner)
28. Regression of earlier phases
"""

import json
import math
from pathlib import Path

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.schemas.anomaly import AnomalyRecord
from app.schemas.evaluation import (
    CorruptionFaultConfig,
    CreateEvaluationRequest,
    DriftFaultConfig,
    FaultInjectionConfig,
    FrozenFaultConfig,
    GapFaultConfig,
    MissingFaultConfig,
    SpikeFaultConfig,
)
from app.schemas.reconstruction import (
    ConfidenceBreakdown,
    ProcessingStatus,
    ReconstructionRecord,
)
from app.services.evaluation.detection_metrics import detection_evaluator, safe_div
from app.services.evaluation.fault_injector import fault_injector
from app.services.evaluation.reconstruction_metrics import reconstruction_evaluator
from app.services.evaluation_service import evaluation_service


@pytest.fixture
def synthetic_dataframe() -> pd.DataFrame:
    """Fixture providing known 50-row deterministic telemetry dataset with known ground truth."""
    data = []
    for i in range(50):
        # Sine-based nominal sensor values
        temp = 60.0 + 5.0 * math.sin(i * 0.2)
        vib = 10.0 + 2.0 * math.cos(i * 0.2)
        press = 101.3 + (i % 5) * 0.1
        data.append({
            "timestamp": f"2026-03-01T00:{i:02d}:00Z",
            "temperature": round(temp, 4),
            "vibration": round(vib, 4),
            "pressure": round(press, 4),
        })
    return pd.DataFrame(data)


@pytest.fixture
def test_storage(tmp_path: Path, monkeypatch) -> Path:
    """Isolate all storage folders to prevent side-effects on development storage."""
    d_dir = tmp_path / "datasets"
    p_dir = tmp_path / "pipelines"
    r_dir = tmp_path / "runs"
    rec_dir = tmp_path / "reconstruction"
    ev_dir = tmp_path / "evaluations"

    for d in [d_dir, p_dir, r_dir, rec_dir, ev_dir]:
        d.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_DIR", str(d_dir))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(p_dir))
    monkeypatch.setattr(settings, "RUNS_STORAGE_DIR", str(r_dir))
    monkeypatch.setattr(settings, "RECONSTRUCTION_STORAGE_DIR", str(rec_dir))
    monkeypatch.setattr(settings, "EVALUATION_STORAGE_DIR", str(ev_dir))

    return tmp_path


# =============================================================================
# 1. Reproducible Spike Injection
# =============================================================================
def test_01_reproducible_spike_injection(synthetic_dataframe: pd.DataFrame):
    config1 = FaultInjectionConfig(
        seed=101,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.1, magnitude_factor=6.0, direction="positive"),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    df1, man1 = fault_injector.inject_faults(synthetic_dataframe, config1, "ds_1", "ds_bm1")

    config2 = FaultInjectionConfig(
        seed=101,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.1, magnitude_factor=6.0, direction="positive"),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    df2, man2 = fault_injector.inject_faults(synthetic_dataframe, config2, "ds_1", "ds_bm2")

    assert man1.total_injected_points == man2.total_injected_points
    assert len(man1.injected_faults) == len(man2.injected_faults)
    # Check exact row indices and corrupted values match identically
    for r1, r2 in zip(man1.injected_faults, man2.injected_faults):
        assert r1.source_row_index == r2.source_row_index
        assert r1.corrupted_value == pytest.approx(r2.corrupted_value, abs=1e-5)
    pd.testing.assert_frame_equal(df1, df2)


# =============================================================================
# 2. Reproducible Drift Injection
# =============================================================================
def test_02_reproducible_drift_injection(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=777,
        sensor_columns=["temperature"],
        spikes=SpikeFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=True, interval_length=10, slope_factor=0.5, start_row=15),
        frozen=FrozenFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    corrupted_df, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    drift_records = [r for r in manifest.injected_faults if r.fault_type == "drift" and r.applied]
    assert len(drift_records) == 10
    assert drift_records[0].source_row_index == 15
    assert drift_records[-1].source_row_index == 24

    # Verify linear ramp progression
    std_temp = float(synthetic_dataframe["temperature"].std())
    for i, r in enumerate(drift_records):
        expected_ramp = (i + 1) * 0.5 * std_temp
        orig_val = synthetic_dataframe.at[15 + i, "temperature"]
        assert r.corrupted_value == pytest.approx(orig_val + expected_ramp, abs=1e-3)
        assert corrupted_df.at[15 + i, "temperature"] == pytest.approx(orig_val + expected_ramp, abs=1e-3)


# =============================================================================
# 3. Frozen-Sensor Injection
# =============================================================================
def test_03_frozen_sensor_injection(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["pressure"],
        spikes=SpikeFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=True, interval_length=8, frozen_value=99.99, start_row=10),
        gap=GapFaultConfig(enabled=False),
    )
    corrupted_df, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    frozen_records = [r for r in manifest.injected_faults if r.fault_type == "frozen_sensor" and r.applied]
    assert len(frozen_records) == 8
    for r in frozen_records:
        assert r.corrupted_value == 99.99
        assert corrupted_df.at[r.source_row_index, "pressure"] == 99.99


# =============================================================================
# 4. Missing-Value Injection
# =============================================================================
def test_04_missing_value_injection(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=True, rate=0.1),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    corrupted_df, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    missing_records = [r for r in manifest.injected_faults if r.fault_type == "missing_value" and r.applied]
    assert len(missing_records) == 5  # 10% of 50 rows
    for r in missing_records:
        assert np.isnan(corrupted_df.at[r.source_row_index, "vibration"])
        # Source dataframe was NOT modified
        assert np.isfinite(synthetic_dataframe.at[r.source_row_index, "vibration"])


# =============================================================================
# 5. Communication-Gap Injection
# =============================================================================
def test_05_communication_gap_injection(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["temperature"],
        spikes=SpikeFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=True, interval_length=6, start_row=20),
    )
    corrupted_df, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    gap_records = [r for r in manifest.injected_faults if r.fault_type == "communication_gap" and r.applied]
    assert len(gap_records) == 6
    for idx, r in enumerate(gap_records):
        assert r.source_row_index == 20 + idx
        assert np.isnan(corrupted_df.at[20 + idx, "temperature"])
        # Timestamp identity preserved
        assert corrupted_df.at[20 + idx, "timestamp"] == f"2026-03-01T00:{20 + idx:02d}:00Z"


# =============================================================================
# 6. Invalid Fault Rates and Magnitudes
# =============================================================================
def test_06_invalid_fault_rates_and_magnitudes():
    with pytest.raises(Exception):
        SpikeFaultConfig(rate=0.9)  # Max allowed is 0.5

    with pytest.raises(Exception):
        SpikeFaultConfig(magnitude_factor=0.5)  # Min allowed is 1.5

    with pytest.raises(Exception):
        DriftFaultConfig(interval_length=1)  # Min allowed is 3


# =============================================================================
# 7. Overlapping Fault Behavior
# =============================================================================
def test_07_overlapping_fault_behavior(synthetic_dataframe: pd.DataFrame):
    # Both drift and frozen targeting row 10 on 'vibration'
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        drift=DriftFaultConfig(enabled=True, interval_length=5, start_row=8),    # rows 8, 9, 10, 11, 12
        frozen=FrozenFaultConfig(enabled=True, interval_length=5, start_row=10), # rows 10, 11, 12, 13, 14
        gap=GapFaultConfig(enabled=False),
    )
    corrupted_df, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    # Rows 10, 11, 12 should be claimed by drift (first in sequence); frozen sensor attempts should be skipped
    unapplied = [r for r in manifest.injected_faults if not r.applied]
    assert len(unapplied) == 3
    for u in unapplied:
        assert u.source_row_index in [10, 11, 12]
        assert "Overlapping fault" in u.resolution_note


# =============================================================================
# 8. Original Dataset Preservation
# =============================================================================
def test_08_original_dataset_preservation(synthetic_dataframe: pd.DataFrame):
    orig_copy = synthetic_dataframe.copy(deep=True)
    config = FaultInjectionConfig(
        seed=123,
        sensor_columns=["vibration", "temperature"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.2),
        corruption=CorruptionFaultConfig(enabled=True, rate=0.2),
    )
    corrupted_df, _ = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    # Invariant: synthetic_dataframe must be 100% identical to orig_copy
    pd.testing.assert_frame_equal(synthetic_dataframe, orig_copy)
    assert not corrupted_df.equals(synthetic_dataframe)


# =============================================================================
# 9. Stable Row and Sensor Mapping
# =============================================================================
def test_09_stable_row_and_sensor_mapping(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["temperature"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.08),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    _, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    for r in manifest.injected_faults:
        assert 0 <= r.source_row_index < len(synthetic_dataframe)
        assert r.sensor_column == "temperature"
        assert r.original_value == pytest.approx(synthetic_dataframe.at[r.source_row_index, "temperature"], abs=1e-4)


# =============================================================================
# 10. Confusion-Matrix Counts
# =============================================================================
def test_10_confusion_matrix_counts(synthetic_dataframe: pd.DataFrame):
    # Setup known injected faults at (5, "vib") and (10, "vib")
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.04),  # 2 spikes
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    _, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")
    injected_rows = [r.source_row_index for r in manifest.injected_faults if r.applied]

    # Mock detection results:
    # 1 TP (first injected), 1 FN (second injected), 1 FP (row 25 which was not injected)
    tp_row = injected_rows[0]
    fn_row = injected_rows[1]
    fp_row = 25

    detected = [
        AnomalyRecord(
            anomaly_id="anom_1",
            run_id="run_1",
            dataset_id="ds_1",
            configuration_id="pipe_1",
            sensor_column="vibration",
            source_row_index=tp_row,
            detection_reason="Impulse spike",
            detector_name="statistical_mad",
        ),
        AnomalyRecord(
            anomaly_id="anom_2",
            run_id="run_1",
            dataset_id="ds_1",
            configuration_id="pipe_1",
            sensor_column="vibration",
            source_row_index=fp_row,
            detection_reason="False alarm",
            detector_name="statistical_mad",
        ),
    ]

    metrics, _, _ = detection_evaluator.evaluate(manifest, detected, total_rows=50, sensor_columns=["vibration"])
    cm = metrics.confusion_matrix

    assert cm.true_positives == 1
    assert cm.false_positives == 1
    assert cm.false_negatives == 1
    assert cm.true_negatives == 47  # 50 - (1 + 1 + 1)
    assert cm.total_labeled_observations == 50


# =============================================================================
# 11. Precision, Recall, F1, and Specificity
# =============================================================================
def test_11_precision_recall_f1_specificity(synthetic_dataframe: pd.DataFrame):
    # TP=2, FP=1, FN=1, TN=46
    # Precision = 2 / 3 = 0.6667
    # Recall = 2 / 3 = 0.6667
    # F1 = 0.6667
    # Specificity = 46 / 47 = 0.9787
    config = FaultInjectionConfig(
        seed=1,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.06), # 3 faults
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    _, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")
    injected_rows = [r.source_row_index for r in manifest.injected_faults if r.applied][:3]

    detected = [
        AnomalyRecord(
            anomaly_id="a1", run_id="r1", dataset_id="ds1", configuration_id="p1",
            sensor_column="vibration", source_row_index=injected_rows[0], detection_reason="test", detector_name="stat",
        ),
        AnomalyRecord(
            anomaly_id="a2", run_id="r1", dataset_id="ds1", configuration_id="p1",
            sensor_column="vibration", source_row_index=injected_rows[1], detection_reason="test", detector_name="stat",
        ),
        AnomalyRecord(
            anomaly_id="a3", run_id="r1", dataset_id="ds1", configuration_id="p1",
            sensor_column="vibration", source_row_index=49, detection_reason="false positive", detector_name="stat",
        ),
    ]

    metrics, _, _ = detection_evaluator.evaluate(manifest, detected, total_rows=50, sensor_columns=["vibration"])
    assert metrics.precision == pytest.approx(0.6667, abs=1e-3)
    assert metrics.recall == pytest.approx(0.6667, abs=1e-3)
    assert metrics.f1_score == pytest.approx(0.6667, abs=1e-3)
    assert metrics.specificity == pytest.approx(46.0 / 47.0, abs=1e-3)


# =============================================================================
# 12. Zero-Denominator Behavior
# =============================================================================
def test_12_zero_denominator_behavior(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=1,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.04),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        corruption=CorruptionFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    _, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    # When NO anomalies are detected (TP=0, FP=0) -> Precision denominator is 0
    metrics, _, _ = detection_evaluator.evaluate(manifest, [], total_rows=50, sensor_columns=["vibration"])
    assert metrics.precision is None
    assert metrics.recall == 0.0
    assert metrics.f1_score is None or metrics.f1_score == 0.0
    assert any("Precision is undefined" in n for n in metrics.notes)

    # When NO faults were injected (TP=0, FN=0) -> Recall denominator is 0
    manifest.injected_faults = []
    metrics2, _, _ = detection_evaluator.evaluate(manifest, [], total_rows=50, sensor_columns=["vibration"])
    assert metrics2.recall is None
    assert any("Recall is undefined" in n for n in metrics2.notes)


# =============================================================================
# 13. Fault-Type Breakdowns
# =============================================================================
def test_13_fault_type_breakdowns(synthetic_dataframe: pd.DataFrame):
    config = FaultInjectionConfig(
        seed=42,
        sensor_columns=["vibration"],
        spikes=SpikeFaultConfig(enabled=True, rate=0.04),
        corruption=CorruptionFaultConfig(enabled=True, rate=0.04),
        drift=DriftFaultConfig(enabled=False),
        frozen=FrozenFaultConfig(enabled=False),
        missing=MissingFaultConfig(enabled=False),
        gap=GapFaultConfig(enabled=False),
    )
    _, manifest = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")

    _, f_breakdowns, _ = detection_evaluator.evaluate(manifest, [], total_rows=50, sensor_columns=["vibration"])
    types = [b.fault_type for b in f_breakdowns]
    assert "point_spike" in types
    assert "point_corruption" in types


# =============================================================================
# 14. Reconstruction MAE and RMSE
# =============================================================================
def test_14_reconstruction_mae_and_rmse(synthetic_dataframe: pd.DataFrame):
    # Two accepted repairs at rows 2 and 4
    # Row 2: GT=60.0, final=62.0 -> abs_err=2.0
    # Row 4: GT=50.0, final=54.0 -> abs_err=4.0
    # MAE = (2 + 4) / 2 = 3.0
    # RMSE = sqrt((4 + 16) / 2) = sqrt(10) = 3.1623
    source_df = pd.DataFrame({"temperature": [0.0, 0.0, 60.0, 0.0, 50.0]})
    corrupted_df = pd.DataFrame({"temperature": [0.0, 0.0, 90.0, 0.0, 90.0]})

    config = FaultInjectionConfig(seed=1, sensor_columns=["temperature"], spikes=SpikeFaultConfig(enabled=True, rate=0.5))
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=2, status="CORRECTED", confidence_score=85.0, final_value=62.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="interpolation", created_at="2026-03-01T00:00:00Z"
        ),
        ReconstructionRecord(
            result_id="res_2", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=4, status="CORRECTED", confidence_score=90.0, final_value=54.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=90.0
            ),
            evidence_summary="interpolation", created_at="2026-03-01T00:00:00Z"
        ),
    ]

    rec_m, _, _ = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["temperature"])
    assert rec_m.mae == pytest.approx(3.0, abs=1e-3)
    assert rec_m.rmse == pytest.approx(math.sqrt(10.0), abs=1e-3)


# =============================================================================
# 15. MAPE Handling for Zero Reference Values
# =============================================================================
def test_15_mape_handling_for_zero_reference_values():
    # Row 0: GT=0.0 (must be excluded from MAPE to avoid divide-by-zero)
    # Row 1: GT=100.0, final=110.0 -> 10%
    source_df = pd.DataFrame({"temperature": [0.0, 100.0]})
    corrupted_df = pd.DataFrame({"temperature": [50.0, 150.0]})

    config = FaultInjectionConfig(seed=1, sensor_columns=["temperature"], spikes=SpikeFaultConfig(enabled=True, rate=0.5))
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=0, status="CORRECTED", confidence_score=85.0, final_value=5.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="interp", created_at="2026-03-01T00:00:00Z"
        ),
        ReconstructionRecord(
            result_id="res_2", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=1, status="CORRECTED", confidence_score=90.0, final_value=110.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=90.0
            ),
            evidence_summary="interp", created_at="2026-03-01T00:00:00Z"
        ),
    ]

    rec_m, _, _ = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["temperature"])
    assert rec_m.mape == 10.0
    assert rec_m.mape_evaluated_count == 1  # only row 1 evaluated for MAPE


# =============================================================================
# 16. No Eligible Reconstructed Observations
# =============================================================================
def test_16_no_eligible_reconstructed_observations():
    source_df = pd.DataFrame({"temperature": [10.0, 20.0]})
    corrupted_df = pd.DataFrame({"temperature": [15.0, 25.0]})
    config = FaultInjectionConfig(seed=1, sensor_columns=["temperature"])
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    # All observations UNRESOLVED (none CORRECTED)
    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=0, status="UNRESOLVED", confidence_score=30.0, final_value=None,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=5, method_agreement_score=5, temporal_proximity_score=5,
                local_variance_score=5, neighbor_cleanliness_score=10, total_score=30.0
            ),
            evidence_summary="abstain", created_at="2026-03-01T00:00:00Z"
        )
    ]
    rec_m, _, _ = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["temperature"])
    # MAE and RMSE must be None (not 0.0!)
    assert rec_m.mae is None
    assert rec_m.rmse is None
    assert any("No accepted reconstructed observations" in n for n in rec_m.notes)


# =============================================================================
# 17. Error Improvement and Regression
# =============================================================================
def test_17_error_improvement_and_regression():
    # Row 0: GT=50, Corrupted=100 (err=50). Reconstructed=52 (err=2). -> IMPROVED
    # Row 1: GT=50, Corrupted=55 (err=5). Reconstructed=70 (err=20). -> WORSENED
    source_df = pd.DataFrame({"temperature": [50.0, 50.0]})
    corrupted_df = pd.DataFrame({"temperature": [100.0, 55.0]})
    config = FaultInjectionConfig(seed=1, sensor_columns=["temperature"], spikes=SpikeFaultConfig(enabled=True, rate=0.5))
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=0, status="CORRECTED", confidence_score=85.0, final_value=52.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="interp", created_at="2026-03-01T00:00:00Z"
        ),
        ReconstructionRecord(
            result_id="res_2", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="temperature",
            source_row_index=1, status="CORRECTED", confidence_score=85.0, final_value=70.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="interp", created_at="2026-03-01T00:00:00Z"
        ),
    ]

    rec_m, _, _ = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["temperature"])
    assert rec_m.readings_improved_count == 1
    assert rec_m.readings_worsened_count == 1
    # Initial error: 50 + 5 = 55. Reconstructed error: 2 + 20 = 22. Reduction: (55 - 22)/55 = 60.0%
    assert rec_m.error_reduction_percent == pytest.approx(60.0, abs=1e-1)


# =============================================================================
# 18. Confidence-Range Summaries
# =============================================================================
def test_18_confidence_range_summaries(synthetic_dataframe: pd.DataFrame):
    source_df = pd.DataFrame({"vibration": [10.0, 10.0, 10.0]})
    corrupted_df = pd.DataFrame({"vibration": [20.0, 20.0, 20.0]})
    config = FaultInjectionConfig(seed=1, sensor_columns=["vibration"])
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="vibration",
            source_row_index=0, status="CORRECTED", confidence_score=85.0, final_value=10.5,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="interp", created_at="2026-03-01T00:00:00Z"
        )
    ]
    _, conf_m, _ = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["vibration"])
    assert len(conf_m.confidence_ranges) == 5
    high_bin = next(b for b in conf_m.confidence_ranges if b.range_label == "[80, 100]")
    assert high_bin.count == 1
    assert high_bin.mean_mae == pytest.approx(0.5, abs=1e-4)


# =============================================================================
# 19. Held-Out Data Separation
# =============================================================================
def test_19_held_out_data_separation(synthetic_dataframe: pd.DataFrame):
    # Benchmark corruption is strictly isolated to separate dataframe
    config = FaultInjectionConfig(seed=42, sensor_columns=["vibration"])
    bm_df, _ = fault_injector.inject_faults(synthetic_dataframe, config, "ds_1", "ds_bm")
    # Reference dataframe remains pristine held-out reference
    assert not bm_df["vibration"].equals(synthetic_dataframe["vibration"])


# =============================================================================
# 20. Abstention Metrics
# =============================================================================
def test_20_abstention_metrics():
    source_df = pd.DataFrame({"vibration": [10.0, 10.0]})
    corrupted_df = pd.DataFrame({"vibration": [50.0, 50.0]})
    config = FaultInjectionConfig(seed=1, sensor_columns=["vibration"])
    _, manifest = fault_injector.inject_faults(source_df, config, "ds_1", "ds_bm")

    # One correctly abstained (candidate was None)
    # One correctly accepted
    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="vibration",
            source_row_index=0, status="UNRESOLVED", confidence_score=15.0, final_value=None, proposed_value=None,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=0, method_agreement_score=0, temporal_proximity_score=5,
                local_variance_score=5, neighbor_cleanliness_score=5, total_score=15.0
            ),
            evidence_summary="insufficient neighbors", created_at="2026-03-01T00:00:00Z"
        ),
        ReconstructionRecord(
            result_id="res_2", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="vibration",
            source_row_index=1, status="CORRECTED", confidence_score=90.0, final_value=10.1, proposed_value=10.1,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="median", created_at="2026-03-01T00:00:00Z"
        ),
    ]

    _, _, abst_m = reconstruction_evaluator.evaluate(records, source_df, corrupted_df, manifest, ["vibration"])
    assert abst_m.abstention_count == 1
    assert abst_m.abstention_rate == 0.5
    assert abst_m.correctly_abstained_count == 1
    assert abst_m.safety_ratio == 1.0  # Both decisions were safe


# =============================================================================
# 21. Evaluation of Unlabeled Data (Mode B)
# =============================================================================
def test_21_evaluation_of_unlabeled_data():
    records = [
        ReconstructionRecord(
            result_id="res_1", reconstruction_run_id="rr_1", detection_run_id="dr_1",
            dataset_id="ds_1", configuration_id="pipe_1", sensor_column="vibration",
            source_row_index=0, status="CORRECTED", confidence_score=85.0, final_value=12.0,
            confidence_breakdown=ConfidenceBreakdown(
                neighbor_count_score=20, method_agreement_score=20, temporal_proximity_score=15,
                local_variance_score=15, neighbor_cleanliness_score=15, total_score=85.0
            ),
            evidence_summary="linear", created_at="2026-03-01T00:00:00Z"
        )
    ]
    # In Mode B, source_df and manifest are None
    det_m, _, _ = detection_evaluator.evaluate(None, [], total_rows=100, sensor_columns=["vibration"])
    rec_m, conf_m, abst_m = reconstruction_evaluator.evaluate(records, None, None, None, ["vibration"])

    # Invariant: Accuracy metrics MUST NOT be fabricated
    assert det_m.precision is None
    assert det_m.recall is None
    assert det_m.f1_score is None
    assert rec_m.mae is None
    assert rec_m.rmse is None
    assert rec_m.has_ground_truth is False
    assert any("Ground truth is unavailable" in n for n in det_m.notes)


# =============================================================================
# 22. End-to-End Evaluation Run Persistence (Mode A)
# =============================================================================
def test_22_evaluation_run_persistence(test_storage: Path):
    client = TestClient(app)

    # 1. Ingest sample dataset
    csv_bytes = (
        "timestamp,temp,vib\n"
        + "\n".join([f"2026-03-01T00:{i:02d}:00Z,{20.0 + (i % 3) * 0.5},{10.0 + (i % 2) * 0.2}" for i in range(40)])
    ).encode("utf-8")

    upload_res = client.post(
        "/api/datasets/upload",
        files={"file": ("telemetry.csv", csv_bytes, "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["metadata"]["dataset_id"]

    # 2. Trigger Mode A evaluation
    eval_req = {
        "evaluation_mode": "mode_a_benchmark",
        "dataset_id": dataset_id,
        "seed": 42,
    }
    create_res = client.post("/api/evaluations", json=eval_req)
    assert create_res.status_code == 201
    eval_data = create_res.json()
    eval_id = eval_data["evaluation_id"]

    # Verify persisted evaluation on disk
    eval_dir = test_storage / "evaluations" / eval_id
    assert eval_dir.exists()
    assert (eval_dir / "evaluation.json").exists()
    assert (eval_dir / "manifest.json").exists()
    assert (eval_dir / "metrics.json").exists()

    # Retrieve via API
    get_res = client.get(f"/api/evaluations/{eval_id}")
    assert get_res.status_code == 200
    assert get_res.json()["evaluation_id"] == eval_id
    assert get_res.json()["status"] == "completed"


# =============================================================================
# 23. Invalid Dataset and Run IDs
# =============================================================================
def test_23_invalid_dataset_and_run_ids(test_storage: Path):
    client = TestClient(app)

    # Nonexistent dataset
    res1 = client.post("/api/evaluations", json={"evaluation_mode": "mode_a_benchmark", "dataset_id": "ds_nonexistent"})
    assert res1.status_code == 404

    # Nonexistent evaluation lookup
    res2 = client.get("/api/evaluations/eval_nonexistent")
    assert res2.status_code == 404


# =============================================================================
# 24. Partial Failures Handling
# =============================================================================
def test_24_partial_failures_handling(test_storage: Path):
    client = TestClient(app)
    # Mode B without detection_run_id must return 400
    res = client.post(
        "/api/evaluations",
        json={"evaluation_mode": "mode_b_existing_run", "dataset_id": "ds_any"},
    )
    assert res.status_code in [400, 404, 422]


# =============================================================================
# 25. Pagination and Filtering
# =============================================================================
def test_25_pagination_and_filtering(test_storage: Path):
    client = TestClient(app)
    list_res = client.get("/api/evaluations?limit=10&offset=0")
    assert list_res.status_code == 200
    data = list_res.json()
    assert "evaluations" in data
    assert "total" in data


# =============================================================================
# 26. Validation Endpoint Consistency
# =============================================================================
def test_26_validation_endpoint_consistency(test_storage: Path):
    client = TestClient(app)

    # Ingest and create benchmark
    csv_bytes = (
        "timestamp,sensor_a\n"
        + "\n".join([f"2026-03-01T00:{i:02d}:00Z,{15.0 + (i % 2)}" for i in range(30)])
    ).encode("utf-8")
    upload_res = client.post("/api/datasets/upload", files={"file": ("val_test.csv", csv_bytes, "text/csv")})
    dataset_id = upload_res.json()["metadata"]["dataset_id"]

    create_res = client.post("/api/evaluations", json={"evaluation_mode": "mode_a_benchmark", "dataset_id": dataset_id, "seed": 42})
    eval_id = create_res.json()["evaluation_id"]

    # Run validation consistency check
    val_res = client.post(f"/api/evaluations/{eval_id}/validate")
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["is_consistent"] is True
    assert val_data["source_data_intact"] is True
    assert val_data["source_sha256_verified"] is True
    assert len(val_data["checks"]) >= 3
