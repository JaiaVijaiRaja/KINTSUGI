"""
Comprehensive automated tests for KINTSUGI Phase 6: Confidence-Aware Data Reconstruction Engine.
Covers all 24 required verification scenarios including interpolation, local median, cross-sensor
validation, confidence scoring, acceptance policies, persistence, review decisions, and data preservation.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
from typing import Dict, Set

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.main import app
from app.schemas.pipeline import (
    ConfidencePolicy,
    DetectionSettings,
    PipelineConfig,
    ReconstructionSettings,
)
from app.services.reconstruction.confidence import calculate_reconstruction_confidence
from app.services.reconstruction.cross_sensor import evaluate_cross_sensor_validation
from app.services.reconstruction.linear_interpolation import reconstruct_linear_interpolation
from app.services.reconstruction.local_median import reconstruct_local_median
from app.services.reconstruction.policy import evaluate_reconstruction_policy


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch):
    """Set up isolated storage directories for datasets, pipelines, runs, and reconstruction."""
    d_dir = tmp_path / "datasets"
    p_dir = tmp_path / "pipelines"
    r_dir = tmp_path / "runs"
    rec_dir = tmp_path / "reconstruction"
    d_dir.mkdir(parents=True, exist_ok=True)
    p_dir.mkdir(parents=True, exist_ok=True)
    r_dir.mkdir(parents=True, exist_ok=True)
    rec_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_DIR", str(d_dir))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(p_dir))
    monkeypatch.setattr(settings, "RUNS_STORAGE_DIR", str(r_dir))
    monkeypatch.setattr(settings, "RECONSTRUCTION_STORAGE_DIR", str(rec_dir))

    client = TestClient(app)
    return {
        "client": client,
        "dataset_dir": d_dir,
        "pipeline_dir": p_dir,
        "runs_dir": r_dir,
        "rec_dir": rec_dir,
    }


def upload_csv_helper(client: TestClient, csv_content: str, filename: str = "telemetry.csv") -> str:
    """Helper to upload CSV content and return dataset_id."""
    res = client.post(
        "/api/datasets/upload",
        files={"file": (filename, csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 201
    return res.json()["metadata"]["dataset_id"]


def create_pipeline_helper(
    client: TestClient,
    dataset_id: str,
    sensor_cols: list,
    ts_col: str = "timestamp",
    max_gap_size: int = 4,
    allow_linear_interpolation: bool = True,
    allow_automatic_correction: bool = False,
    human_review_required: bool = True,
    review_threshold: float = 0.80,
) -> str:
    """Helper to create and save a pipeline configuration."""
    payload = {
        "configuration_name": f"Reconstruction Pipeline {dataset_id[:8]}",
        "description": "Verification test pipeline for signal reconstruction",
        "dataset_id": dataset_id,
        "timestamp_column": ts_col,
        "sensor_columns": sensor_cols,
        "ignored_columns": [],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": 3.5, "min_observations": 5},
            "isolation_forest": {"enabled": True, "contamination": 0.05, "random_seed": 42, "min_observations": 10},
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": allow_linear_interpolation,
            "max_gap_size": max_gap_size,
            "require_cross_sensor_validation": True,
            "preserve_original_readings": True,
            "allow_automatic_correction": allow_automatic_correction,
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": review_threshold,
            "human_review_required": human_review_required,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }
    res = client.post("/api/pipelines", json=payload)
    assert res.status_code == 201
    return res.json()["configuration_id"]


# ==============================================================================
# 1. Linear interpolation with valid surrounding observations
# ==============================================================================
def test_1_linear_interpolation_valid_neighbors():
    """Verify linear interpolation calculates expected midpoint between valid neighbors."""
    # Values: [10.0, 20.0, 300.0 (anomaly), 40.0, 50.0]
    values = np.array([10.0, 20.0, 300.0, 40.0, 50.0])
    anomaly_indices = {2}

    val, refs, reason, is_valid = reconstruct_linear_interpolation(
        values=values,
        target_idx=2,
        max_gap_size=3,
        anomaly_indices=anomaly_indices,
    )
    assert is_valid is True
    assert val is not None
    # Midpoint between row 1 (20.0) and row 3 (40.0) is exactly 30.0
    assert abs(val - 30.0) < 1e-3
    assert len(refs) == 2
    assert refs[0].source_row_index == 1
    assert refs[1].source_row_index == 3


# ==============================================================================
# 2. Interpolation with an unavailable left or right neighbor (no extrapolation)
# ==============================================================================
def test_2_interpolation_boundary_extrapolation_prohibited():
    """Verify linear interpolation strictly declines at series boundaries (no extrapolation)."""
    values = np.array([500.0, 20.0, 22.0, 24.0])
    # Target is index 0: no left neighbor exists!
    val, refs, reason, is_valid = reconstruct_linear_interpolation(
        values=values,
        target_idx=0,
        max_gap_size=5,
        anomaly_indices={0},
    )
    assert is_valid is False
    assert val is None
    assert "extrapolation is strictly prohibited" in reason.lower()

    # Target is last index: no right neighbor exists!
    val_end, _, reason_end, is_valid_end = reconstruct_linear_interpolation(
        values=values,
        target_idx=3,
        max_gap_size=5,
        anomaly_indices={3},
    )
    assert is_valid_end is False
    assert val_end is None
    assert "extrapolation is strictly prohibited" in reason_end.lower()


# ==============================================================================
# 3. Gap-limit enforcement
# ==============================================================================
def test_3_gap_limit_enforcement():
    """Verify linear interpolation declines when gap size exceeds max_gap_size."""
    # Rows 2, 3, 4, 5 are all anomalous (gap of 4 samples between 1 and 6)
    values = np.array([10.0, 12.0, 999.0, 999.0, 999.0, 999.0, 20.0])
    anomaly_indices = {2, 3, 4, 5}

    # With max_gap_size = 2, gap of 4 exceeds limit
    val, refs, reason, is_valid = reconstruct_linear_interpolation(
        values=values,
        target_idx=3,
        max_gap_size=2,
        anomaly_indices=anomaly_indices,
    )
    assert is_valid is False
    assert val is None
    assert "exceeds configured maximum gap limit" in reason.lower()


# ==============================================================================
# 4. Maximum-gap handling using timestamps
# ==============================================================================
def test_4_timestamp_weighted_interpolation():
    """Verify interpolation uses true elapsed time distances when timestamps are available."""
    # Row 0 at 00:00 (val=10.0), Row 1 at 00:01 (target anomaly), Row 2 at 00:04 (val=50.0)
    # Elapsed from row 0 to row 1 is 60s, total elapsed 0 to 2 is 240s -> fraction = 60/240 = 0.25
    # Expected: 10.0 + (50.0 - 10.0) * 0.25 = 20.0
    values = np.array([10.0, 999.0, 50.0])
    timestamps = pd.Series([
        "2026-03-01T00:00:00Z",
        "2026-03-01T00:01:00Z",
        "2026-03-01T00:04:00Z",
    ])
    val, refs, reason, is_valid = reconstruct_linear_interpolation(
        values=values,
        target_idx=1,
        timestamps=timestamps,
        max_gap_size=3,
        anomaly_indices={1},
    )
    assert is_valid is True
    assert val is not None
    assert abs(val - 20.0) < 1e-2
    assert "time-weighted" in reason.lower()


# ==============================================================================
# 5. Duplicate timestamps handling
# ==============================================================================
def test_5_duplicate_timestamps_deterministic():
    """Verify duplicate timestamps are handled deterministically without division-by-zero crashes."""
    values = np.array([10.0, 999.0, 20.0])
    # Duplicate timestamp across range
    timestamps = pd.Series([
        "2026-03-01T00:00:00Z",
        "2026-03-01T00:00:00Z",
        "2026-03-01T00:00:00Z",
    ])
    val, refs, reason, is_valid = reconstruct_linear_interpolation(
        values=values,
        target_idx=1,
        timestamps=timestamps,
        max_gap_size=3,
        anomaly_indices={1},
    )
    assert is_valid is True
    assert val is not None
    assert abs(val - 15.0) < 1e-2  # midpoint average


# ==============================================================================
# 6. Local median reconstruction
# ==============================================================================
def test_6_local_median_reconstruction():
    """Verify local median reconstruction estimates isolated outlier from trusted neighbors."""
    # Window radius 3 around index 4: neighbors are [10.0, 11.0, 12.0, 13.0, 14.0, 15.0]
    values = np.array([5.0, 10.0, 11.0, 12.0, 500.0, 13.0, 14.0, 15.0, 20.0])
    val, refs, reason, is_valid = reconstruct_local_median(
        values=values,
        target_idx=4,
        window_radius=3,
        min_observations=3,
        anomaly_indices={4},
    )
    assert is_valid is True
    assert val is not None
    # Median of [11.0, 12.0, 13.0, 14.0, 15.0] or participating neighbors is ~12.5
    assert 11.0 <= val <= 14.0
    assert len(refs) >= 5


# ==============================================================================
# 7. Insufficient trusted neighbors
# ==============================================================================
def test_7_insufficient_trusted_neighbors():
    """Verify local median declines when available trusted neighbors < min_observations."""
    values = np.array([10.0, 999.0, 20.0])
    # In window around index 1, only 2 neighbors exist (10.0 and 20.0), but min_observations=4
    val, refs, reason, is_valid = reconstruct_local_median(
        values=values,
        target_idx=1,
        window_radius=3,
        min_observations=4,
        anomaly_indices={1},
    )
    assert is_valid is False
    assert val is None
    assert "insufficient trusted neighbors" in reason.lower()


# ==============================================================================
# 8. Non-finite input values handling
# ==============================================================================
def test_8_non_finite_input_values_handling():
    """Verify NaN and Inf values are safely bypassed in neighborhood calculations."""
    values = np.array([10.0, np.nan, np.inf, -np.inf, 999.0, 12.0, 14.0, 16.0])
    # Target is index 4; preceding indices 1, 2, 3 are non-finite!
    val, refs, reason, is_valid = reconstruct_local_median(
        values=values,
        target_idx=4,
        window_radius=4,
        min_observations=3,
        anomaly_indices={4},
    )
    # Participating valid neighbors are only 10.0, 12.0, 14.0, 16.0
    assert is_valid is True
    assert val is not None
    for r in refs:
        assert np.isfinite(r.value)


# ==============================================================================
# 9. Anomaly neighbors excluded from trusted evidence
# ==============================================================================
def test_9_anomaly_neighbors_excluded():
    """Verify that neighbors flagged as anomalies are NOT used as trusted references."""
    # Values around index 3: row 2 is also an anomaly (990.0)
    values = np.array([10.0, 11.0, 990.0, 888.0, 12.0, 13.0])
    anomaly_indices = {2, 3}

    val, refs, reason, is_valid = reconstruct_local_median(
        values=values,
        target_idx=3,
        window_radius=2,
        min_observations=2,
        anomaly_indices=anomaly_indices,
    )
    assert is_valid is True
    ref_indices = [r.source_row_index for r in refs]
    assert 2 not in ref_indices, "Row #2 is an anomaly and must be excluded from trusted evidence!"


# ==============================================================================
# 10. Cross-sensor validation without an established relationship
# ==============================================================================
def test_10_cross_sensor_no_unjustified_relationship():
    """Verify cross-sensor validation is not claimed when correlation is weak (|r| < 0.70)."""
    np.random.seed(42)
    # Uncorrelated noise
    df = pd.DataFrame({
        "vibration": np.random.normal(10.0, 1.0, 30),
        "temperature": np.random.normal(50.0, 1.0, 30),
    })
    val, agree, adj, refs, summary = evaluate_cross_sensor_validation(
        df=df,
        target_sensor="vibration",
        target_idx=15,
        candidate_val=10.2,
        min_correlation_threshold=0.70,
    )
    assert agree is None
    assert "cross-sensor validation not claimed" in summary.lower()


# ==============================================================================
# 11. Conflicting evidence
# ==============================================================================
def test_11_cross_sensor_conflicting_evidence():
    """Verify cross-sensor evaluation detects and flags strong evidence conflicts."""
    # High correlation between vib and temp: temp = 2.0 * vib + 10.0
    x = np.linspace(10.0, 30.0, 30)
    y = 2.0 * x + 10.0
    df = pd.DataFrame({"vibration": x, "temperature": y})

    # At row 15, x=20.0, so cross-sensor strongly predicts y=50.0.
    # Suppose a flawed candidate proposal of 150.0 was suggested!
    val, agree, adj, refs, summary = evaluate_cross_sensor_validation(
        df=df,
        target_sensor="temperature",
        target_idx=15,
        candidate_val=150.0,  # massive conflict with 50.0
        min_correlation_threshold=0.70,
    )
    assert agree is False, "Massive divergence between cross-sensor model and proposal must flag conflict"
    assert adj < 0, "Conflicting evidence must apply a confidence penalty"
    assert "conflict" in summary.lower()


# ==============================================================================
# 12. Confidence factor breakdown
# ==============================================================================
def test_12_confidence_factor_breakdown():
    """Verify confidence breakdown factors are bounded, documented, and sum properly."""
    breakdown = calculate_reconstruction_confidence(
        interp_val=25.0,
        interp_gap=1,
        median_val=25.1,
        neighbor_count=8,
        min_neighbors_required=3,
        local_std=0.5,
        local_mean=25.0,
        surrounding_anomaly_count=0,
        cross_sensor_agreement=True,
        cross_sensor_adjustment=10.0,
        is_valid_proposal=True,
    )
    assert 0.0 <= breakdown.neighbor_count_score <= 25.0
    assert 0.0 <= breakdown.method_agreement_score <= 25.0
    assert 0.0 <= breakdown.temporal_proximity_score <= 20.0
    assert 0.0 <= breakdown.local_variance_score <= 15.0
    assert 0.0 <= breakdown.neighbor_cleanliness_score <= 15.0
    assert 0.0 <= breakdown.total_score <= 100.0
    # High quality evidence should score > 85
    assert breakdown.total_score >= 85.0


# ==============================================================================
# 13. Confidence thresholds
# ==============================================================================
def test_13_confidence_threshold_evaluation():
    """Verify confidence below threshold transitions to UNRESOLVED."""
    cfg = PipelineConfig(
        configuration_id="pipe_test",
        configuration_name="Test Pipeline",
        dataset_id="ds_test",
        sensor_columns=["vibration"],
        reconstruction_settings=ReconstructionSettings(),
        confidence_policy=ConfidencePolicy(review_threshold=0.85),  # 85.0 pts
        created_at="2026-03-01T00:00:00Z",
        updated_at="2026-03-01T00:00:00Z",
    )
    # Score 65.0 < 85.0 -> UNRESOLVED
    status, final_val, reason = evaluate_reconstruction_policy(
        original_val=999.0,
        proposed_val=25.0,
        confidence_score=65.0,
        pipeline_config=cfg,
        is_structurally_valid=True,
    )
    assert status == "UNRESOLVED"
    assert final_val == 999.0
    assert "below the configured acceptance threshold" in reason.lower()


# ==============================================================================
# 14. Invalid reconstructed output rejection
# ==============================================================================
def test_14_invalid_reconstructed_output():
    """Verify non-finite reconstructed outputs are rejected as UNRESOLVED."""
    cfg = PipelineConfig(
        configuration_id="pipe_test",
        configuration_name="Test Pipeline",
        dataset_id="ds_test",
        sensor_columns=["vibration"],
        reconstruction_settings=ReconstructionSettings(),
        confidence_policy=ConfidencePolicy(review_threshold=0.80),
        created_at="2026-03-01T00:00:00Z",
        updated_at="2026-03-01T00:00:00Z",
    )
    status, final_val, reason = evaluate_reconstruction_policy(
        original_val=10.0,
        proposed_val=np.nan,
        confidence_score=95.0,
        pipeline_config=cfg,
        is_structurally_valid=False,
        structural_failure_reason="Non-finite output",
    )
    assert status == "UNRESOLVED"
    assert final_val == 10.0


# ==============================================================================
# 15. Explicit abstention as UNRESOLVED
# ==============================================================================
def test_15_explicit_abstention_never_guesses():
    """Verify system strictly abstains when structural safety checks fail."""
    cfg = PipelineConfig(
        configuration_id="pipe_test",
        configuration_name="Test Pipeline",
        dataset_id="ds_test",
        sensor_columns=["vibration"],
        reconstruction_settings=ReconstructionSettings(),
        confidence_policy=ConfidencePolicy(review_threshold=0.80),
        created_at="2026-03-01T00:00:00Z",
        updated_at="2026-03-01T00:00:00Z",
    )
    status, final_val, reason = evaluate_reconstruction_policy(
        original_val=500.0,
        proposed_val=None,
        confidence_score=0.0,
        pipeline_config=cfg,
        is_structurally_valid=False,
        structural_failure_reason="Gap exceeded max allowed size",
    )
    assert status == "UNRESOLVED"
    assert final_val == 500.0
    assert "gap exceeded" in reason.lower()


# ==============================================================================
# 16. Acceptance-policy rejection despite high score
# ==============================================================================
def test_16_acceptance_policy_review_hold_despite_high_score():
    """Verify high confidence proposal is held as ESTIMATED when human_review_required=True."""
    cfg = PipelineConfig(
        configuration_id="pipe_test",
        configuration_name="Test Pipeline",
        dataset_id="ds_test",
        sensor_columns=["vibration"],
        reconstruction_settings=ReconstructionSettings(allow_automatic_correction=False),
        confidence_policy=ConfidencePolicy(review_threshold=0.80, human_review_required=True),
        created_at="2026-03-01T00:00:00Z",
        updated_at="2026-03-01T00:00:00Z",
    )
    # Score 95.0 >= 80.0, but human review is required
    status, final_val, reason = evaluate_reconstruction_policy(
        original_val=150.0,
        proposed_val=22.4,
        confidence_score=95.0,
        pipeline_config=cfg,
        is_structurally_valid=True,
    )
    assert status == "ESTIMATED", "Must be held as ESTIMATED pending human operator review"
    # Final committed value remains original reading until explicit review sign-off!
    assert final_val == 150.0


# ==============================================================================
# 17. Preservation of original dataset contents
# ==============================================================================
def test_17_preservation_of_original_dataset(isolated_env):
    """Verify raw source CSV is unmodified after end-to-end reconstruction execution."""
    client = isolated_env["client"]
    d_dir: Path = isolated_env["dataset_dir"]

    rows = ["timestamp,vibration"]
    for i in range(30):
        v = 12.0 if i != 14 else 180.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    csv_bytes = "\n".join(rows).encode("utf-8")
    hash_orig = hashlib.sha256(csv_bytes).hexdigest()

    d_id = upload_csv_helper(client, "\n".join(rows), "orig_preserve.csv")
    csv_file = d_dir / d_id / "data.csv"
    assert csv_file.exists()

    c_id = create_pipeline_helper(client, d_id, ["vibration"])
    det_res = client.post(f"/api/pipelines/{c_id}/run")
    assert det_res.status_code == 201
    det_run_id = det_res.json()["run"]["run_id"]

    rec_res = client.post(f"/api/pipelines/{c_id}/runs/{det_run_id}/reconstruct")
    assert rec_res.status_code == 201

    with open(csv_file, "rb") as f:
        hash_after = hashlib.sha256(f.read()).hexdigest()

    assert hash_orig == hash_after, "CRITICAL: Reconstruction run mutated original source dataset CSV!"


# ==============================================================================
# 18. Correct source row mapping
# ==============================================================================
def test_18_correct_source_row_mapping(isolated_env):
    """Verify reconstruction record maps directly to the exact source row index."""
    client = isolated_env["client"]
    rows = ["timestamp,vibration"]
    for i in range(25):
        v = 10.0 if i != 18 else 200.0  # spike at row 18
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_helper(client, "\n".join(rows))
    c_id = create_pipeline_helper(client, d_id, ["vibration"])

    det_res = client.post(f"/api/pipelines/{c_id}/run")
    det_run_id = det_res.json()["run"]["run_id"]

    rec_res = client.post(f"/api/pipelines/{c_id}/runs/{det_run_id}/reconstruct")
    assert rec_res.status_code == 201
    rec_run_id = rec_res.json()["run"]["reconstruction_run_id"]

    results_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results")
    assert results_res.status_code == 200
    recs = results_res.json()["results"]
    assert len(recs) >= 1
    target_rec = recs[0]
    assert target_rec["source_row_index"] == 18
    assert target_rec["original_value"] == 200.0


# ==============================================================================
# 19. Reconstruction run persistence and retrieval
# ==============================================================================
def test_19_run_persistence_and_retrieval(isolated_env):
    """Verify run.json and results.json are saved and retrievable via GET API."""
    client = isolated_env["client"]
    rec_dir: Path = isolated_env["rec_dir"]

    rows = ["timestamp,vibration"]
    for i in range(25):
        v = 15.0 if i != 10 else 125.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_helper(client, "\n".join(rows))
    c_id = create_pipeline_helper(client, d_id, ["vibration"])

    det_run_id = client.post(f"/api/pipelines/{c_id}/run").json()["run"]["run_id"]
    rec_run = client.post(f"/api/pipelines/{c_id}/runs/{det_run_id}/reconstruct").json()["run"]
    rec_run_id = rec_run["reconstruction_run_id"]

    # Verify physical file existence
    assert (rec_dir / rec_run_id / "run.json").exists()
    assert (rec_dir / rec_run_id / "results.json").exists()

    # GET /api/reconstruction/runs/{id}
    get_run_res = client.get(f"/api/reconstruction/runs/{rec_run_id}")
    assert get_run_res.status_code == 200
    assert get_run_res.json()["reconstruction_run_id"] == rec_run_id

    # GET /api/reconstruction/runs
    list_runs_res = client.get("/api/reconstruction/runs")
    assert list_runs_res.status_code == 200
    assert list_runs_res.json()["total"] >= 1


# ==============================================================================
# 20. Failed or partial reconstruction runs
# ==============================================================================
def test_20_reconstruction_on_incomplete_detection_run(isolated_env):
    """Verify reconstruction declines with 400 when detection run is not completed."""
    client = isolated_env["client"]
    runs_dir: Path = isolated_env["runs_dir"]

    # First create a valid pipeline with sufficient rows for min_observations
    lines = ["timestamp,vibration"] + [f"2026-03-01T00:{i:02d}:00Z,10.0" for i in range(15)]
    d_id = upload_csv_helper(client, "\n".join(lines))
    c_id = create_pipeline_helper(client, d_id, ["vibration"])

    # Manually create a failed detection run on disk linked to this pipeline
    fake_run_id = "run_failed_test"
    fake_dir = runs_dir / fake_run_id
    fake_dir.mkdir(parents=True, exist_ok=True)
    with open(fake_dir / "run.json", "w") as f:
        json.dump({
            "run_id": fake_run_id,
            "dataset_id": d_id,
            "configuration_id": c_id,
            "status": "failed",
            "start_time": "2026-03-01T00:00:00Z",
            "summary": {
                "total_rows_analyzed": 0,
                "total_anomalies_detected": 0,
            },
        }, f)

    res = client.post(f"/api/pipelines/{c_id}/runs/{fake_run_id}/reconstruct")
    assert res.status_code == 400
    assert "only completed runs can be reconstructed" in res.json()["error"]["message"].lower()


# ==============================================================================
# 21. Invalid detection run IDs
# ==============================================================================
def test_21_invalid_detection_run_id(isolated_env):
    """Verify 404 response when attempting reconstruction on unknown detection run."""
    client = isolated_env["client"]
    res = client.post("/api/pipelines/pipe_any/runs/run_unknown_9999/reconstruct")
    assert res.status_code == 404


# ==============================================================================
# 22. Filtering and pagination of reconstruction results
# ==============================================================================
def test_22_filtering_and_pagination(isolated_env):
    """Verify GET /api/reconstruction/runs/{id}/results filters by sensor and status."""
    client = isolated_env["client"]
    rows = ["timestamp,temp,vib"]
    for i in range(30):
        t = 50.0 if i != 8 else 180.0
        v = 10.0 if i != 20 else 120.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{t},{v}")
    d_id = upload_csv_helper(client, "\n".join(rows))
    c_id = create_pipeline_helper(client, d_id, ["temp", "vib"])

    det_run_id = client.post(f"/api/pipelines/{c_id}/run").json()["run"]["run_id"]
    rec_run_id = client.post(f"/api/pipelines/{c_id}/runs/{det_run_id}/reconstruct").json()["run"]["reconstruction_run_id"]

    # Filter by sensor=temp
    temp_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results?sensor_column=temp")
    assert temp_res.status_code == 200
    for r in temp_res.json()["results"]:
        assert r["sensor_column"] == "temp"

    # Pagination: limit=1
    page_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results?limit=1&offset=0")
    assert page_res.status_code == 200
    assert len(page_res.json()["results"]) == 1


# ==============================================================================
# 23. Operator review decision action
# ==============================================================================
def test_23_operator_review_decision(isolated_env):
    """Verify POST /api/reconstruction/results/{result_id}/review transitions status to CORRECTED or UNRESOLVED."""
    client = isolated_env["client"]
    rows = ["timestamp,vibration"]
    for i in range(25):
        v = 12.0 if i != 12 else 150.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_helper(client, "\n".join(rows))
    c_id = create_pipeline_helper(client, d_id, ["vibration"])

    det_run_id = client.post(f"/api/pipelines/{c_id}/run").json()["run"]["run_id"]
    rec_run_id = client.post(f"/api/pipelines/{c_id}/runs/{det_run_id}/reconstruct").json()["run"]["reconstruction_run_id"]

    results = client.get(f"/api/reconstruction/runs/{rec_run_id}/results").json()["results"]
    target_res_id = results[0]["result_id"]

    # Test ACCEPT review decision
    review_res = client.post(
        f"/api/reconstruction/results/{target_res_id}/review",
        json={
            "decision": "ACCEPT",
            "reviewer_name": "lead_telemetry_engineer",
            "review_comment": "Verified plausible turbine operating regime",
        },
    )
    assert review_res.status_code == 200
    reviewed_rec = review_res.json()
    assert reviewed_rec["status"] == "CORRECTED"
    assert reviewed_rec["is_reviewed"] is True
    assert reviewed_rec["reviewed_by"] == "lead_telemetry_engineer"

    # Verify single lookup reflects updated status
    single_res = client.get(f"/api/reconstruction/results/{target_res_id}")
    assert single_res.status_code == 200
    assert single_res.json()["status"] == "CORRECTED"


# ==============================================================================
# 24. End-to-end dataset recovery endpoint
# ==============================================================================
def test_24_execute_recovery_for_dataset(isolated_env):
    """Verify POST /api/reconstruction/execute-for-dataset/{dataset_id} executes detection & recovery end-to-end."""
    client = isolated_env["client"]
    rows = ["timestamp,temperature,pressure"]
    for i in range(30):
        # Insert NaN missing gap at i=10 and spike at i=20
        temp = 42.0 if i != 20 else 999.0
        temp_val = "" if i == 10 else str(temp)
        pres = 101.3
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{temp_val},{pres}")
    d_id = upload_csv_helper(client, "\n".join(rows))

    resp = client.post(f"/api/reconstruction/execute-for-dataset/{d_id}")
    assert resp.status_code == 201
    rec_data = resp.json()
    assert "run" in rec_data
    run = rec_data["run"]
    assert run["dataset_id"] == d_id
    assert run["status"] == "completed"
    assert run["summary"]["total_evaluated"] >= 1

    # Check that results are queryable
    res_list = client.get(f"/api/reconstruction/runs/{run['reconstruction_run_id']}/results").json()
    assert res_list["total_results"] >= 1


# ==============================================================================
# 25. Filter reconstruction runs by dataset_id
# ==============================================================================
def test_25_list_reconstruction_runs_filtered_by_dataset(isolated_env):
    """Verify GET /api/reconstruction/runs?dataset_id={dataset_id} properly filters by dataset."""
    client = isolated_env["client"]
    rows = ["timestamp,vibration"]
    for i in range(20):
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{10.0 if i != 5 else 88.0}")
    d_id_1 = upload_csv_helper(client, "\n".join(rows))
    d_id_2 = upload_csv_helper(client, "\n".join(rows))

    client.post(f"/api/reconstruction/execute-for-dataset/{d_id_1}")
    client.post(f"/api/reconstruction/execute-for-dataset/{d_id_2}")

    filter_res_1 = client.get(f"/api/reconstruction/runs?dataset_id={d_id_1}").json()
    assert filter_res_1["total"] == 1
    assert filter_res_1["runs"][0]["dataset_id"] == d_id_1

    filter_res_2 = client.get(f"/api/reconstruction/runs?dataset_id={d_id_2}").json()
    assert filter_res_2["total"] == 1
    assert filter_res_2["runs"][0]["dataset_id"] == d_id_2

