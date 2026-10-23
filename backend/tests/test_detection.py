"""
Comprehensive automated tests for KINTSUGI Phase 5: Real Industrial Sensor Anomaly Detection.
Covers all 20 required verification scenarios including statistical detection, Isolation Forest,
aggregation, persistence, API endpoints, data preservation, and edge cases.
"""
import hashlib
import json
import math
import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.main import app
from app.schemas.anomaly import DetectorResultDetail
from app.services.detectors.statistical import detect_statistical_mad
from app.services.detectors.isolation_forest import detect_isolation_forest
from app.services.detectors.aggregation import aggregate_observation_anomaly


@pytest.fixture
def isolated_env(tmp_path: Path, monkeypatch):
    """Set up isolated storage directories for datasets, pipelines, and detection runs."""
    d_dir = tmp_path / "datasets"
    p_dir = tmp_path / "pipelines"
    r_dir = tmp_path / "runs"
    d_dir.mkdir(parents=True, exist_ok=True)
    p_dir.mkdir(parents=True, exist_ok=True)
    r_dir.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_DIR", str(d_dir))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(p_dir))
    monkeypatch.setattr(settings, "RUNS_STORAGE_DIR", str(r_dir))

    client = TestClient(app)
    return {
        "client": client,
        "dataset_dir": d_dir,
        "pipeline_dir": p_dir,
        "runs_dir": r_dir,
    }


def upload_csv_content(client: TestClient, csv_content: str, filename: str = "telemetry.csv") -> str:
    """Helper to upload synthetic CSV content and return dataset_id."""
    res = client.post(
        "/api/datasets/upload",
        files={"file": (filename, csv_content.encode("utf-8"), "text/csv")},
    )
    assert res.status_code == 201
    return res.json()["metadata"]["dataset_id"]


def create_pipeline_config(
    client: TestClient,
    dataset_id: str,
    sensor_cols: list,
    ts_col: str = "timestamp",
    stat_enabled: bool = True,
    iso_enabled: bool = True,
    mad_threshold: float = 3.5,
    window_size: int = 15,
    min_observations_stat: int = 5,
    contamination: float = 0.05,
    random_seed: int = 42,
    min_observations_iso: int = 10,
) -> str:
    """Helper to create and save pipeline configuration, returning configuration_id."""
    payload = {
        "configuration_name": f"Test Pipeline for {dataset_id[:8]}",
        "description": "Automated verification test pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": ts_col,
        "sensor_columns": sensor_cols,
        "ignored_columns": [],
        "detection_settings": {
            "statistical": {
                "enabled": stat_enabled,
                "window_size": window_size,
                "mad_threshold": mad_threshold,
                "min_observations": min_observations_stat,
            },
            "isolation_forest": {
                "enabled": iso_enabled,
                "contamination": contamination,
                "random_seed": random_seed,
                "min_observations": min_observations_iso,
            },
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 3,
            "require_cross_sensor_validation": True,
            "preserve_original_readings": True,
            "allow_automatic_correction": False,
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": 0.8,
            "human_review_required": True,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }
    res = client.post("/api/pipelines", json=payload)
    assert res.status_code == 201, f"Failed to create pipeline: {res.text}"
    return res.json()["configuration_id"]


# ==============================================================================
# 1. Synthetic series containing a clear isolated spike
# ==============================================================================
def test_1_isolated_spike_detection():
    """Verify statistical detector flags a distinct isolated impulse spike."""
    # Base series with subtle variation (50.0, 50.2, 50.4...) so MAD > 0
    series_data = [50.0 + (i % 3) * 0.2 for i in range(30)]
    series_data[15] = 250.0  # isolated transient impulse
    series = pd.Series(series_data)

    results = detect_statistical_mad(
        series=series,
        window_size=10,
        mad_threshold=3.5,
        min_observations=5,
    )
    assert len(results) == 30
    assert results[15].flagged is True, "The isolated spike at index 15 must be flagged"
    assert results[15].score is not None and results[15].score > 3.5
    assert "exceeding" in results[15].reason.lower() or "mad" in results[15].reason.lower()
    # Surrounding nominal points should not be falsely flagged
    assert results[14].flagged is False
    assert results[16].flagged is False


# ==============================================================================
# 2. Series with no injected anomaly under detector settings
# ==============================================================================
def test_2_nominal_series_no_anomalies():
    """Verify nominal smooth series produces zero anomaly flags."""
    # Stable periodic cycling with deviation strictly within 2x MAD
    series = pd.Series([20.0 + (i % 5) * 0.1 for i in range(50)])
    results = detect_statistical_mad(
        series=series,
        window_size=15,
        mad_threshold=4.0,
        min_observations=5,
    )
    flagged_count = sum(1 for r in results if r.flagged)
    assert flagged_count == 0, f"Expected 0 anomalies, found {flagged_count}"


# ==============================================================================
# 3. Constant-valued sensor data
# ==============================================================================
def test_3_constant_valued_sensor_data():
    """Verify constant-valued series does not cause division-by-zero or flag nominal flatline."""
    series = pd.Series(np.full(50, 42.0))
    results = detect_statistical_mad(
        series=series,
        window_size=10,
        mad_threshold=3.5,
        min_observations=5,
    )
    flagged_count = sum(1 for r in results if r.flagged)
    assert flagged_count == 0, "Constant signal matching window median must not be flagged as anomaly"
    for r in results:
        if r.score is not None:
            assert r.score == 0.0


# ==============================================================================
# 4. Missing values (NaN) handling
# ==============================================================================
def test_4_missing_values_nan_handling():
    """Verify NaNs are explicitly recognized, not silently replaced, and not falsely flagged as spikes."""
    # Series with NaNs, window size 8 with min_observations 3
    series = pd.Series([10.0, 10.2, np.nan, 10.1, 10.3, np.nan, 10.0, 100.0, 10.2, 10.1])
    results = detect_statistical_mad(
        series=series,
        window_size=8,
        mad_threshold=3.5,
        min_observations=3,
    )
    assert results[2].flagged is False, "Missing NaN should not be flagged as statistical anomaly"
    assert results[2].score is None
    assert "missing or non-finite" in results[2].reason.lower()
    assert results[5].flagged is False
    assert results[7].flagged is True, "Real outlier after NaNs should still be flagged"


# ==============================================================================
# 5. Non-finite numeric values (Inf, -Inf) handling
# ==============================================================================
def test_5_non_finite_numeric_values_inf_handling():
    """Verify infinite values are gracefully caught without causing unhandled exceptions."""
    series = pd.Series([10.0, 10.1, np.inf, 10.2, -np.inf, 10.0, 10.1])
    results = detect_statistical_mad(
        series=series,
        window_size=5,
        mad_threshold=3.5,
        min_observations=3,
    )
    # Inf should be documented as non-finite
    assert results[2].flagged is False
    assert results[2].score is None
    assert "missing or non-finite" in results[2].reason.lower()
    assert results[4].flagged is False
    assert results[4].score is None
    assert "missing or non-finite" in results[4].reason.lower()


# ==============================================================================
# 6. Insufficient observations (< min_observations)
# ==============================================================================
def test_6_insufficient_observations_statistical():
    """Verify series shorter than min_observations returns documented reason and no false positives."""
    series = pd.Series([10.0, 10.5, 9.8])
    results = detect_statistical_mad(
        series=series,
        window_size=10,
        mad_threshold=3.5,
        min_observations=5,  # requires 5, only 3 provided
    )
    assert len(results) == 3
    for r in results:
        assert r.flagged is False
        assert "insufficient" in r.reason.lower()


# ==============================================================================
# 7. Zero-MAD behavior
# ==============================================================================
def test_7_zero_mad_behavior():
    """Verify zero-MAD window flags deviations with safe sentinel score and nominal flatline points with 0.0."""
    # 8 flat points, then sudden jump to 15.0
    series = pd.Series([5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 15.0])
    results = detect_statistical_mad(
        series=series,
        window_size=5,
        mad_threshold=3.0,
        min_observations=3,
    )
    # At index 8, window has 5.0, 5.0, 5.0, 5.0, 15.0. Median=5.0, MAD=0.0.
    # Deviation 15.0 - 5.0 = 10.0 > 0. Must be flagged safely!
    assert results[8].flagged is True
    assert results[8].score == 999.0
    assert "zero" in results[8].reason.lower() and "dispersion" in results[8].reason.lower()
    # Nominal flat points before should be nominal
    assert results[7].flagged is False
    assert results[7].score == 0.0


# ==============================================================================
# 8. Rolling-window boundary behavior
# ==============================================================================
def test_8_rolling_window_boundary_behavior():
    """Verify points before window fills behave according to documented min_observations policy."""
    series = pd.Series([50.0, 50.1, 50.2, 50.0, 200.0, 50.1, 50.0])
    results = detect_statistical_mad(
        series=series,
        window_size=10,  # window larger than series
        mad_threshold=3.5,
        min_observations=5,  # allows points once 5 valid observations exist
    )
    # Early observations (< 5)
    for i in range(4):
        assert "insufficient" in results[i].reason.lower()
    # At index 4 (5th observation), valid history = 5 >= 5, spike to 200.0 should be assessed and flagged
    assert results[4].flagged is True


# ==============================================================================
# 9. Isolation Forest reproducibility
# ==============================================================================
def test_9_isolation_forest_reproducibility():
    """Verify Isolation Forest produces identical scores and predictions across runs with same seed."""
    np.random.seed(123)
    df = pd.DataFrame({
        "vibration": np.random.normal(10.0, 1.0, 50),
        "temperature": np.random.normal(60.0, 2.0, 50),
    })
    # Inject outlier
    df.loc[25, "vibration"] = 35.0

    results_1, w_1 = detect_isolation_forest(
        df=df,
        sensor_columns=["vibration", "temperature"],
        contamination=0.05,
        random_seed=42,
        min_observations=15,
    )

    results_2, w_2 = detect_isolation_forest(
        df=df,
        sensor_columns=["vibration", "temperature"],
        contamination=0.05,
        random_seed=42,
        min_observations=15,
    )

    assert [r.flagged for r in results_1] == [r.flagged for r in results_2]
    assert [r.score for r in results_1] == [r.score for r in results_2]


# ==============================================================================
# 10. Insufficient data for Isolation Forest
# ==============================================================================
def test_10_insufficient_data_for_isolation_forest():
    """Verify Isolation Forest gracefully declines when observations < min_observations."""
    df = pd.DataFrame({"vibration": [1.0, 2.0, 3.0]})
    results, warnings = detect_isolation_forest(
        df=df,
        sensor_columns=["vibration"],
        contamination=0.05,
        random_seed=42,
        min_observations=10,
    )
    assert len(warnings) >= 1
    assert "insufficient" in warnings[0].lower()
    assert sum(1 for r in results if r.flagged) == 0


# ==============================================================================
# 11. Original-row mapping after filtering unusable observations
# ==============================================================================
def test_11_original_row_mapping_after_filtering_unusable():
    """Verify source row mapping preserves original CSV row indices when rows contain NaNs."""
    # 30 rows total, with NaNs at rows 5 and 15, and an outlier at row 20
    vibration = [10.0] * 30
    temperature = [50.0] * 30
    vibration[5] = np.nan
    temperature[15] = np.nan
    vibration[20] = 500.0  # obvious outlier

    df = pd.DataFrame({"vibration": vibration, "temperature": temperature})
    results, warnings = detect_isolation_forest(
        df=df,
        sensor_columns=["vibration", "temperature"],
        contamination=0.05,
        random_seed=42,
        min_observations=15,
    )
    # The output length must equal the original 30 rows
    assert len(results) == 30
    # Row 5 and 15 must have non-finite reason
    assert "non-finite" in results[5].reason.lower()
    assert "non-finite" in results[15].reason.lower()
    # Row 20 must be assessed and flagged as anomaly
    assert results[20].flagged is True


# ==============================================================================
# 12. Multiple sensors detection
# ==============================================================================
def test_12_multiple_sensors(isolated_env):
    """Verify pipeline detects anomalies across multiple distinct sensor channels."""
    client = isolated_env["client"]
    rows = ["timestamp,temp,press,vib"]
    for i in range(35):
        t_val = 50.0 if i != 10 else 180.0  # spike on temp at row 10
        p_val = 100.0 if i != 20 else 5.0   # spike on press at row 20
        v_val = 1.5 if i != 25 else 25.0    # spike on vib at row 25
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{t_val},{p_val},{v_val}")
    csv_str = "\n".join(rows)

    d_id = upload_csv_content(client, csv_str, "multi_sensor.csv")
    c_id = create_pipeline_config(
        client,
        dataset_id=d_id,
        sensor_cols=["temp", "press", "vib"],
        window_size=10,
        mad_threshold=3.5,
        min_observations_stat=5,
        min_observations_iso=10,
    )

    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201
    run_data = run_res.json()["run"]
    summary = run_data["summary"]

    assert summary["total_anomalies_detected"] >= 3
    sensor_counts = summary["anomalies_by_sensor"]
    assert "temp" in sensor_counts and sensor_counts["temp"] >= 1
    assert "press" in sensor_counts and sensor_counts["press"] >= 1
    assert "vib" in sensor_counts and sensor_counts["vib"] >= 1


# ==============================================================================
# 13. Detector aggregation and disagreement
# ==============================================================================
def test_13_detector_aggregation_and_disagreement():
    """Verify consensus determination: SINGLE_DETECTOR vs MULTI_DETECTOR consensus."""
    # Case A: Statistical flags, Isolation forest does not
    stat_a = DetectorResultDetail(
        detector_name="statistical_mad",
        flagged=True,
        score=4.2,
        reason="Statistical spike",
        threshold=3.5,
    )
    iso_a = DetectorResultDetail(
        detector_name="isolation_forest",
        flagged=False,
        score=0.05,
        reason="Nominal",
    )
    rec_a = aggregate_observation_anomaly(
        run_id="run_1",
        dataset_id="ds_1",
        configuration_id="cfg_1",
        sensor_column="vibration",
        source_row_index=5,
        timestamp_val="2026-03-01T00:05:00Z",
        original_value=45.2,
        stat_result=stat_a,
        iso_result=iso_a,
    )
    assert rec_a is not None
    assert rec_a.consensus == "SINGLE_DETECTOR"
    assert rec_a.detector_name == "statistical_mad"
    assert rec_a.severity in ["MEDIUM", "HIGH"]

    # Case B: Both detectors flag the point
    stat_b = DetectorResultDetail(
        detector_name="statistical_mad",
        flagged=True,
        score=8.5,
        reason="Extreme spike",
        threshold=3.5,
    )
    iso_b = DetectorResultDetail(
        detector_name="isolation_forest",
        flagged=True,
        score=-0.25,
        reason="Deep isolation",
    )
    rec_b = aggregate_observation_anomaly(
        run_id="run_1",
        dataset_id="ds_1",
        configuration_id="cfg_1",
        sensor_column="vibration",
        source_row_index=12,
        timestamp_val="2026-03-01T00:12:00Z",
        original_value=250.0,
        stat_result=stat_b,
        iso_result=iso_b,
    )
    assert rec_b is not None
    assert rec_b.consensus == "MULTI_DETECTOR"
    assert rec_b.severity == "CRITICAL"

    # Case C: Neither detector flags the point
    stat_c = DetectorResultDetail(
        detector_name="statistical_mad",
        flagged=False,
        score=0.5,
        reason="Nominal",
    )
    iso_c = DetectorResultDetail(
        detector_name="isolation_forest",
        flagged=False,
        score=0.12,
        reason="Nominal",
    )
    rec_c = aggregate_observation_anomaly(
        run_id="run_1",
        dataset_id="ds_1",
        configuration_id="cfg_1",
        sensor_column="vibration",
        source_row_index=15,
        timestamp_val="2026-03-01T00:15:00Z",
        original_value=10.0,
        stat_result=stat_c,
        iso_result=iso_c,
    )
    assert rec_c is None, "Non-anomalous observation must return None"


# ==============================================================================
# 14. Invalid configuration
# ==============================================================================
def test_14_invalid_configuration(isolated_env):
    """Verify pipeline rejects invalid detection parameters with 422 validation errors."""
    client = isolated_env["client"]
    rows = ["timestamp,temp\n2026-03-01T00:00:00Z,20.0\n2026-03-01T00:01:00Z,20.1"]
    d_id = upload_csv_content(client, "".join(rows))

    # Test invalid mad_threshold <= 0
    bad_payload = {
        "configuration_name": "Bad Pipeline",
        "dataset_id": d_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temp"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": -1.0, "min_observations": 5},
            "isolation_forest": {"enabled": False},
        },
    }
    res = client.post("/api/pipelines", json=bad_payload)
    assert res.status_code == 422


# ==============================================================================
# 15. Unknown dataset and configuration IDs
# ==============================================================================
def test_15_unknown_dataset_and_configuration_ids(isolated_env):
    """Verify 404 responses for non-existent pipeline runs and missing datasets."""
    client = isolated_env["client"]
    # Unknown pipeline run
    res = client.post("/api/pipelines/pipe_nonexistent_12345/run")
    assert res.status_code == 404
    assert "not found" in res.json()["error"]["message"].lower()

    # Unknown run status
    res = client.get("/api/pipelines/pipe_123/runs/run_nonexistent_999")
    assert res.status_code == 404

    # Unknown anomaly ID
    res = client.get("/api/anomalies/anom_unknown_12345")
    assert res.status_code == 404


# ==============================================================================
# 16. Detection run persistence and retrieval
# ==============================================================================
def test_16_detection_run_persistence_and_retrieval(isolated_env):
    """Verify detection run artifacts are saved on disk and retrievable via APIs."""
    client = isolated_env["client"]
    runs_dir: Path = isolated_env["runs_dir"]

    # Create dataset with 30 rows and a spike
    rows = ["timestamp,vibration"]
    for i in range(30):
        v = 10.0 if i != 12 else 95.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_content(client, "\n".join(rows))
    c_id = create_pipeline_config(
        client,
        d_id,
        ["vibration"],
        window_size=10,
        mad_threshold=3.5,
        min_observations_stat=5,
        min_observations_iso=10,
    )

    # Execute detection
    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201
    run_data = run_res.json()["run"]
    run_id = run_data["run_id"]

    # Verify physical file persistence
    run_file = runs_dir / run_id / "run.json"
    anom_file = runs_dir / run_id / "anomalies.json"
    assert run_file.exists(), f"run.json must exist in {runs_dir / run_id}"
    assert anom_file.exists(), f"anomalies.json must exist in {runs_dir / run_id}"

    # Verify retrieval via GET /api/pipelines/{c_id}/runs/{run_id}
    status_res = client.get(f"/api/pipelines/{c_id}/runs/{run_id}")
    assert status_res.status_code == 200
    assert status_res.json()["run_id"] == run_id
    assert status_res.json()["status"] == "completed"

    # Verify retrieval via GET /api/pipelines/{c_id}/runs/{run_id}/results
    results_res = client.get(f"/api/pipelines/{c_id}/runs/{run_id}/results?limit=10")
    assert results_res.status_code == 200
    results_data = results_res.json()
    assert results_data["run_id"] == run_id
    assert results_data["total_anomalies"] >= 1
    assert len(results_data["anomalies"]) >= 1


# ==============================================================================
# 17. Partial detector failure
# ==============================================================================
def test_17_partial_detector_failure_recorded(isolated_env):
    """Verify when one detector has insufficient data (e.g. IF requires min 50), the run succeeds partially with warnings."""
    client = isolated_env["client"]
    # 20 rows: sufficient for statistical (min=5), but insufficient for isolation forest (min=50)
    rows = ["timestamp,vibration"]
    for i in range(20):
        v = 10.0 if i != 12 else 80.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_content(client, "\n".join(rows))
    c_id = create_pipeline_config(
        client,
        d_id,
        ["vibration"],
        stat_enabled=True,
        iso_enabled=True,
        window_size=10,
        min_observations_stat=5,
        min_observations_iso=50,  # 20 < 50: will trigger IF warning
    )

    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201
    run_data = run_res.json()["run"]
    assert run_data["status"] == "completed"
    assert len(run_data["warnings"]) >= 1
    assert any("isolation forest" in w.lower() for w in run_data["warnings"])
    # Statistical still ran and flagged row 12!
    assert run_data["summary"]["total_anomalies_detected"] >= 1


# ==============================================================================
# 18. Preservation of the original dataset
# ==============================================================================
def test_18_preservation_of_the_original_dataset(isolated_env):
    """Verify source CSV file is completely unmodified after detection execution."""
    client = isolated_env["client"]
    d_dir: Path = isolated_env["dataset_dir"]

    rows = ["timestamp,pressure"]
    for i in range(25):
        p = 10.0 if i != 10 else 999.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{p}")
    csv_content = "\n".join(rows)
    d_id = upload_csv_content(client, csv_content, "checksum_test.csv")
    csv_file = d_dir / d_id / "data.csv"
    assert csv_file.exists()

    with open(csv_file, "rb") as f:
        hash_before = hashlib.sha256(f.read()).hexdigest()

    c_id = create_pipeline_config(
        client,
        d_id,
        ["pressure"],
        min_observations_stat=5,
        min_observations_iso=10,
    )
    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201

    with open(csv_file, "rb") as f:
        hash_after = hashlib.sha256(f.read()).hexdigest()

    assert hash_before == hash_after, "CRITICAL: Detection run modified original source dataset CSV!"


# ==============================================================================
# 19. Accurate summary counts
# ==============================================================================
def test_19_accurate_summary_counts(isolated_env):
    """Verify summary counts exactly equal total rows and detected anomaly counts."""
    client = isolated_env["client"]
    rows = ["timestamp,sensor_a,sensor_b"]
    for i in range(25):
        a = 100.0 if i != 7 else 300.0
        b = 50.0 if i != 18 else 10.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{a},{b}")
    d_id = upload_csv_content(client, "\n".join(rows))
    c_id = create_pipeline_config(
        client,
        d_id,
        ["sensor_a", "sensor_b"],
        window_size=10,
        min_observations_stat=5,
        min_observations_iso=10,
    )

    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201
    run_data = run_res.json()["run"]
    summary = run_data["summary"]

    assert summary["total_rows_analyzed"] == 25
    # Retrieve all anomaly records
    results_res = client.get(f"/api/pipelines/{c_id}/runs/{run_data['run_id']}/results?limit=100")
    records = results_res.json()["anomalies"]
    assert len(records) == summary["total_anomalies_detected"]

    # Sum by sensor must equal total_anomalies_detected
    by_sensor_sum = sum(summary["anomalies_by_sensor"].values())
    assert by_sensor_sum == summary["total_anomalies_detected"]


# ==============================================================================
# 20. Anomalies catalog query and lookup
# ==============================================================================
def test_20_anomalies_catalog_query_and_lookup(isolated_env):
    """Verify GET /api/anomalies and GET /api/anomalies/{anomaly_id} functionality."""
    client = isolated_env["client"]
    rows = ["timestamp,vibration"]
    for i in range(25):
        v = 15.0 if i != 12 else 120.0
        rows.append(f"2026-03-01T00:{i:02d}:00Z,{v}")
    d_id = upload_csv_content(client, "\n".join(rows))
    c_id = create_pipeline_config(
        client,
        d_id,
        ["vibration"],
        window_size=10,
        min_observations_stat=5,
        min_observations_iso=10,
    )

    run_res = client.post(f"/api/pipelines/{c_id}/run")
    assert run_res.status_code == 201
    run_id = run_res.json()["run"]["run_id"]

    # Query catalog
    catalog_res = client.get(f"/api/anomalies?run_id={run_id}&sensor_column=vibration")
    assert catalog_res.status_code == 200
    cat_data = catalog_res.json()
    assert cat_data["total"] >= 1
    first_anom = cat_data["anomalies"][0]
    anom_id = first_anom["anomaly_id"]

    # Individual lookup
    single_res = client.get(f"/api/anomalies/{anom_id}")
    assert single_res.status_code == 200
    single_data = single_res.json()
    assert single_data["anomaly_id"] == anom_id
    assert single_data["sensor_column"] == "vibration"
    assert single_data["source_row_index"] == 12
    assert single_data["original_value"] == 120.0
    assert single_data["flagged_status"] == "FLAGGED"
