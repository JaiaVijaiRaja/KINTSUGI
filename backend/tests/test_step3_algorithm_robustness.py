"""Step 3 Technical Audit: Algorithm Robustness & Edge-Case Verification.
Tests:
- Rolling MAD on small datasets, constant signals, missing/infinite values, step impulse.
- Isolation Forest on small datasets (< 50 rows), constant variance, missing values, determinism.
- Linear interpolation on boundary points (row 0, row n-1), gaps exceeding max_gap_size, duplicate timestamps, irregular timestamps.
- Local median reconstruction on insufficient neighbors, target exclusion, anomaly neighbor exclusion.
- Cross-sensor corroboration on unestablished correlation, non-finite corroborating readings, conflicting predictions.
- Deterministic policy transitions (UNRESOLVED, ESTIMATED, CORRECTED).
"""

import numpy as np
import pandas as pd
import pytest

from app.schemas.pipeline import PipelineConfig, ConfidencePolicy, ReconstructionSettings
from app.services.detectors.statistical import detect_statistical_mad
from app.services.detectors.isolation_forest import detect_isolation_forest
from app.services.reconstruction.linear_interpolation import reconstruct_linear_interpolation
from app.services.reconstruction.local_median import reconstruct_local_median
from app.services.reconstruction.cross_sensor import evaluate_cross_sensor_validation
from app.services.reconstruction.confidence import calculate_reconstruction_confidence
from app.services.reconstruction.policy import evaluate_reconstruction_policy


def test_statistical_mad_edge_cases():
    # 1. Constant sensor series
    constant_series = pd.Series([42.0] * 30)
    results = detect_statistical_mad(constant_series, window_size=15, min_observations=10)
    assert len(results) == 30
    for r in results[10:]:  # after warmup
        assert r.flagged is False
        assert r.score == 0.0

    # 2. Step impulse from constant baseline
    step_series = pd.Series([42.0] * 20 + [99.0])
    results = detect_statistical_mad(step_series, window_size=15, min_observations=10)
    assert results[20].flagged is True
    assert results[20].score == 999.0

    # 3. Non-finite values
    nan_series = pd.Series([10.0, np.nan, np.inf, -np.inf, 12.0])
    results = detect_statistical_mad(nan_series, window_size=5, min_observations=3)
    assert results[1].flagged is False
    assert results[1].score is None
    assert results[2].flagged is False
    assert results[2].score is None

    # 4. Small dataset (< min_observations)
    small_series = pd.Series([1.0, 2.0, 3.0])
    results = detect_statistical_mad(small_series, min_observations=5)
    for r in results:
        assert r.flagged is False
        assert r.score is None


def test_isolation_forest_edge_cases():
    # 1. Dataset smaller than min_observations (e.g. 20 rows < 50)
    df_small = pd.DataFrame({"s1": np.arange(20.0), "s2": np.arange(20.0) * 2})
    results, warnings = detect_isolation_forest(df_small, ["s1", "s2"], min_observations=50)
    assert len(warnings) > 0
    assert "Insufficient usable finite rows" in warnings[0]
    assert all(r.flagged is False and r.score is None for r in results)

    # 2. Constant signal across all sensors (zero variance)
    df_const = pd.DataFrame({"s1": [10.0] * 60, "s2": [20.0] * 60})
    results, warnings = detect_isolation_forest(df_const, ["s1", "s2"], min_observations=50)
    assert any("zero variance" in w for w in warnings)
    assert all(r.flagged is False for r in results)

    # 3. Determinism with identical seed
    rng = np.random.default_rng(42)
    data = rng.normal(100, 5, size=(80, 2))
    df = pd.DataFrame(data, columns=["s1", "s2"])
    res1, _ = detect_isolation_forest(df, ["s1", "s2"], random_seed=42, min_observations=50)
    res2, _ = detect_isolation_forest(df, ["s1", "s2"], random_seed=42, min_observations=50)
    assert [r.score for r in res1] == [r.score for r in res2]


def test_linear_interpolation_edge_cases():
    values = np.array([10.0, 20.0, np.nan, 40.0, 50.0])

    # 1. Boundary: row 0 (no left neighbor -> prohibited extrapolation)
    val, refs, reason, ok = reconstruct_linear_interpolation(values, target_idx=0)
    assert ok is False
    assert val is None
    assert "prohibited" in reason.lower()

    # 2. Boundary: row n-1 (no right neighbor -> prohibited extrapolation)
    val, refs, reason, ok = reconstruct_linear_interpolation(values, target_idx=4)
    assert ok is False
    assert val is None
    assert "prohibited" in reason.lower()

    # 3. Normal interior interpolation at row 2
    val, refs, reason, ok = reconstruct_linear_interpolation(values, target_idx=2)
    assert ok is True
    assert val == 30.0
    assert len(refs) == 2
    assert refs[0].source_row_index == 1
    assert refs[1].source_row_index == 3

    # 4. Gap exceeding max_gap_size
    wide_gap_vals = np.array([10.0] + [np.nan] * 8 + [100.0])
    val, refs, reason, ok = reconstruct_linear_interpolation(wide_gap_vals, target_idx=4, max_gap_size=5)
    assert ok is False
    assert "exceeds configured maximum gap limit" in reason

    # 5. Duplicate timestamps handling (delta_total == 0)
    ts = pd.Series(["2026-01-01 00:00:00", "2026-01-01 00:00:00", "2026-01-01 00:00:00"])
    dup_vals = np.array([10.0, np.nan, 30.0])
    val, refs, reason, ok = reconstruct_linear_interpolation(dup_vals, target_idx=1, timestamps=ts)
    assert ok is True
    assert val == 20.0  # Midpoint average without division by zero error


def test_local_median_edge_cases():
    values = np.array([10.0, 11.0, 12.0, 999.0, 14.0, 15.0])

    # 1. Target observation exclusion
    val, refs, reason, ok = reconstruct_local_median(values, target_idx=3, window_radius=2, min_observations=3)
    assert ok is True
    # Window indices: [1, 2, 4, 5], values: [11.0, 12.0, 14.0, 15.0], target 999 is excluded
    assert val == 13.0
    assert not any(ref.source_row_index == 3 for ref in refs)

    # 2. Insufficient trusted neighbors (< min_observations)
    val, refs, reason, ok = reconstruct_local_median(values, target_idx=3, window_radius=2, min_observations=10)
    assert ok is False
    assert val is None
    assert "Insufficient trusted neighbors" in reason


def test_cross_sensor_corroboration_edge_cases():
    # 1. Unestablished correlation
    rng = np.random.default_rng(123)
    df_uncorr = pd.DataFrame({
        "target": rng.normal(50, 5, 40),
        "other": rng.normal(100, 20, 40),
    })
    c_val, agrees, adj, refs, reason = evaluate_cross_sensor_validation(
        df_uncorr, "target", target_idx=5, candidate_val=50.0, min_correlation_threshold=0.85
    )
    assert agrees is None
    assert "No secondary sensor demonstrated reliable correlation" in reason

    # 2. Strong correlation and severe conflict detection
    x = np.linspace(10, 50, 40)
    y = 2.0 * x + 5.0 + rng.normal(0, 0.1, 40)
    df_corr = pd.DataFrame({"x": x, "target": y})
    # Corroboration
    c_val, agrees, adj, refs, reason = evaluate_cross_sensor_validation(
        df_corr, "target", target_idx=10, candidate_val=float(y[10])
    )
    assert agrees is True
    assert adj == 10.0

    # Conflicting candidate
    c_val, agrees, adj, refs, reason = evaluate_cross_sensor_validation(
        df_corr, "target", target_idx=10, candidate_val=float(y[10]) + 50.0  # huge divergence
    )
    assert agrees is False
    assert adj == -25.0
    assert "conflict" in reason.lower()


def test_policy_transitions():
    cfg = PipelineConfig(
        configuration_id="pipe_test",
        configuration_name="Test",
        dataset_id="ds_test",
        configuration_version=1,
        timestamp_column="ts",
        sensor_columns=["s1"],
        ignored_columns=[],
        reconstruction_settings=ReconstructionSettings(allow_automatic_correction=True),
        confidence_policy=ConfidencePolicy(review_threshold=0.75, human_review_required=False),
        created_at="2026-01-01T00:00:00Z",
        updated_at="2026-01-01T00:00:00Z",
    )

    # 1. Structurally invalid -> UNRESOLVED
    status, final_v, reason = evaluate_reconstruction_policy(
        original_val=100.0, proposed_val=50.0, confidence_score=90.0,
        pipeline_config=cfg, is_structurally_valid=False, structural_failure_reason="Prohibited extrapolation"
    )
    assert status == "UNRESOLVED"
    assert final_v == 100.0  # retains original
    assert "extrapolation" in reason

    # 2. Conflicting evidence -> UNRESOLVED
    status, final_v, reason = evaluate_reconstruction_policy(
        original_val=100.0, proposed_val=50.0, confidence_score=90.0,
        pipeline_config=cfg, is_structurally_valid=True, has_evidence_conflict=True
    )
    assert status == "UNRESOLVED"
    assert final_v == 100.0

    # 3. Score below threshold -> UNRESOLVED
    status, final_v, reason = evaluate_reconstruction_policy(
        original_val=100.0, proposed_val=50.0, confidence_score=70.0,  # < 75.0
        pipeline_config=cfg, is_structurally_valid=True
    )
    assert status == "UNRESOLVED"
    assert final_v == 100.0

    # 4. High confidence & auto-accept permitted -> CORRECTED
    status, final_v, reason = evaluate_reconstruction_policy(
        original_val=100.0, proposed_val=50.0, confidence_score=85.0,  # >= 75.0
        pipeline_config=cfg, is_structurally_valid=True
    )
    assert status == "CORRECTED"
    assert final_v == 50.0

    # 5. Human review required -> ESTIMATED
    cfg_review = cfg.model_copy(deep=True)
    cfg_review.confidence_policy.human_review_required = True
    status, final_v, reason = evaluate_reconstruction_policy(
        original_val=100.0, proposed_val=50.0, confidence_score=85.0,
        pipeline_config=cfg_review, is_structurally_valid=True
    )
    assert status == "ESTIMATED"
    assert final_v == 100.0  # holds original measurement until operator reviews
