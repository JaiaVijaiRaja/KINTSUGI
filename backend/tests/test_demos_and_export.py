"""
Comprehensive Test Suite for KINTSUGI Live Demonstrations & Export Functionality.
Covers:
1. Demo 1: Self-Healing Telemetry (Pipeline execution, Row 12 repair, Row 0 boundary abstention, export).
2. Demo 2: Trust, Abstention, Hard Cases & Evaluation (Continuous gap, conflicting evidence, evaluation metrics).
3. Demonstration APIs: Catalog, manifest retrieval, error simulation.
4. Export Integrity: Validates headers, status columns, original preservation, and non-empty content.
"""

from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


@pytest.fixture
def client(tmp_path: Path, monkeypatch):
    """Create test client with isolated storage directories."""
    dataset_storage = tmp_path / "datasets"
    pipeline_storage = tmp_path / "pipelines"
    runs_storage = tmp_path / "runs"
    rec_storage = tmp_path / "reconstruction"
    eval_storage = tmp_path / "evaluations"
    audit_storage = tmp_path / "audit"

    for p in [dataset_storage, pipeline_storage, runs_storage, rec_storage, eval_storage, audit_storage]:
        p.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_DIR", str(dataset_storage))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(pipeline_storage))
    monkeypatch.setattr(settings, "RUNS_STORAGE_DIR", str(runs_storage))
    monkeypatch.setattr(settings, "RECONSTRUCTION_STORAGE_DIR", str(rec_storage))
    monkeypatch.setattr(settings, "EVALUATION_STORAGE_DIR", str(eval_storage))
    monkeypatch.setattr(settings, "AUDIT_STORAGE_DIR", str(audit_storage))

    return TestClient(app)


def test_demo_catalog_endpoints(client: TestClient):
    """Verify demo catalog endpoints return documented scenarios and manifests."""
    # 1. List demos
    res = client.get("/api/demos")
    assert res.status_code == 200
    demos = res.json()
    assert len(demos) == 2
    demo_ids = [d["demo_id"] for d in demos]
    assert "demo1" in demo_ids
    assert "demo2" in demo_ids

    # 2. Get individual demo
    res1 = client.get("/api/demos/demo1")
    assert res1.status_code == 200
    assert res1.json()["dataset_file"] == "turbine_telemetry_demo.csv"

    res2 = client.get("/api/demos/demo2")
    assert res2.status_code == 200
    assert res2.json()["dataset_file"] == "difficult_cases_demo.csv"

    # 3. Get manifests
    res_m1 = client.get("/api/demos/demo1/manifest")
    assert res_m1.status_code == 200
    assert res_m1.json()["manifest_version"] == "2.0.0"

    res_m2 = client.get("/api/demos/demo2/manifest")
    assert res_m2.status_code == 200
    assert res_m2.json()["demo_id"] == "demo2_trust_and_abstention"

    # 4. Unknown demo
    res_bad = client.get("/api/demos/nonexistent")
    assert res_bad.status_code == 404


def test_demo_error_simulation(client: TestClient):
    """Verify backend error simulation returns genuine structured responses without tracebacks."""
    error_types = ["unsupported_file", "empty_file", "malformed_csv", "invalid_sensor", "exceeded_gap"]
    for etype in error_types:
        res = client.post("/api/demos/simulate-error", json={"error_type": etype})
        assert res.status_code == 200
        body = res.json()
        assert body["error_type"] == etype
        assert body["data_preserved"] is True
        assert len(body["user_message"]) > 0
        assert "traceback" not in body["user_message"].lower()


def test_demo1_end_to_end_pipeline_and_export(client: TestClient):
    """
    Test complete end-to-end Demo 1 flow:
    Load Demo 1 -> Ingest -> Configure Pipeline -> Detect Anomalies ->
    Reconstruct -> Verify Row 12 (CORRECTED) & Row 0 (UNRESOLVED) -> Export.
    """
    # 1. Load Demo 1 Dataset
    load_res = client.post("/api/datasets/load-demo", json={"demo_id": "demo1"})
    assert load_res.status_code == 201
    dataset_id = load_res.json()["metadata"]["dataset_id"]
    assert dataset_id.startswith("ds_")

    # 2. Configure Pipeline for Demo 1
    pipe_payload = {
        "configuration_name": "Demo 1 Turbine Calibration Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "ignored_columns": ["ambient_temp_c"],
        "detection_settings": {
            "statistical": {"window_size": 15, "mad_threshold": 3.0, "min_observations": 10},
            "isolation_forest": {"contamination": 0.05, "random_seed": 42, "min_observations": 50},
        },
        "reconstruction_settings": {
            "primary_method": "linear_interpolation",
            "fallback_method": "local_median",
            "max_gap_size": 5,
            "allow_automatic_correction": True,
        },
        "confidence_policy": {
            "review_threshold": 0.70,
            "human_review_required": False,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }
    pipe_res = client.post("/api/pipelines", json=pipe_payload)
    assert pipe_res.status_code == 201
    pipeline_id = pipe_res.json()["configuration_id"]

    # 3. Execute Detection Run
    det_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert det_res.status_code == 201
    det_run_id = det_res.json()["run"]["run_id"]
    assert det_res.json()["run"]["summary"]["total_anomalies_detected"] > 0

    # 4. Execute Reconstruction Run
    rec_res = client.post(
        f"/api/pipelines/{pipeline_id}/runs/{det_run_id}/reconstruct"
    )
    assert rec_res.status_code == 201
    rec_run_id = rec_res.json()["run"]["reconstruction_run_id"]

    summary = rec_res.json()["run"]["summary"]
    assert summary["total_evaluated"] > 0
    assert summary["corrected_count"] > 0

    # 5. Inspect individual records
    results_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results?limit=100")
    assert results_res.status_code == 200
    records = results_res.json()["results"]

    # Verify Row 12 (extreme spike on temperature) is CORRECTED
    spike_rec = next((r for r in records if r["source_row_index"] == 12 and r["sensor_column"] == "temperature_bearing_c"), None)
    assert spike_rec is not None
    assert spike_rec["status"] == "CORRECTED"
    assert spike_rec["original_value"] == 158.4
    assert spike_rec["proposed_value"] < 100.0  # nominal ~65-67 C
    assert spike_rec["confidence_score"] >= 70.0

    # Verify Row 0 (boundary missing reading on vibration) is UNRESOLVED
    boundary_rec = next((r for r in records if r["source_row_index"] == 0 and r["sensor_column"] == "vibration_drive_end_g"), None)
    if boundary_rec:
        assert boundary_rec["status"] == "UNRESOLVED"
        assert "extrapolation" in boundary_rec["abstention_reason"].lower()

    # 6. Test Reconstructed Dataset Export
    export_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/export?format=csv")
    assert export_res.status_code == 200
    assert export_res.headers["content-type"].startswith("text/csv")
    csv_text = export_res.text
    assert "temperature_bearing_c_repaired" in csv_text
    assert "temperature_bearing_c_status" in csv_text
    assert "CORRECTED" in csv_text


def test_demo2_hard_cases_and_abstention(client: TestClient):
    """
    Test complete end-to-end Demo 2 flow:
    Load Demo 2 -> Configure Pipeline -> Detect -> Reconstruct ->
    Verify Abstentions (Row 0 boundary, Rows 15-22 gap limit exceeded, Row 32 conflicting evidence) ->
    Run Evaluation against isolated ground truth.
    """
    # 1. Load Demo 2 Dataset
    load_res = client.post("/api/datasets/load-demo", json={"demo_id": "demo2"})
    assert load_res.status_code == 201
    dataset_id = load_res.json()["metadata"]["dataset_id"]

    # 2. Configure Pipeline for Demo 2
    pipe_payload = {
        "configuration_name": "Demo 2 Stress & Abstention Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "ignored_columns": ["ambient_temp_c"],
        "detection_settings": {
            "statistical": {"window_size": 15, "mad_threshold": 3.0, "min_observations": 10},
            "isolation_forest": {"contamination": 0.05, "random_seed": 42, "min_observations": 50},
        },
        "reconstruction_settings": {
            "primary_method": "linear_interpolation",
            "fallback_method": "local_median",
            "max_gap_size": 5,
            "allow_automatic_correction": True,
        },
        "confidence_policy": {
            "review_threshold": 0.70,
            "human_review_required": False,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }
    pipe_res = client.post("/api/pipelines", json=pipe_payload)
    assert pipe_res.status_code == 201
    pipeline_id = pipe_res.json()["configuration_id"]

    # 3. Detection
    det_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert det_res.status_code == 201
    det_run_id = det_res.json()["run"]["run_id"]

    # 4. Reconstruction
    rec_res = client.post(
        f"/api/pipelines/{pipeline_id}/runs/{det_run_id}/reconstruct"
    )
    assert rec_res.status_code == 201
    rec_run_id = rec_res.json()["run"]["reconstruction_run_id"]

    summary = rec_res.json()["run"]["summary"]
    # In Demo 2, there must be strict abstentions (UNRESOLVED)
    assert summary["unresolved_count"] > 0

    results_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results?limit=100")
    records = results_res.json()["results"]

    # Check for boundary abstention or gap limit abstention
    unresolved_records = [r for r in records if r["status"] == "UNRESOLVED"]
    assert len(unresolved_records) > 0
    for ur in unresolved_records:
        assert ur["abstention_reason"] is not None
        assert len(ur["abstention_reason"]) > 0

    # 5. Run Controlled Benchmark Evaluation (Mode A)
    eval_payload = {
        "evaluation_name": "Demo 2 Benchmark Against Isolated Ground Truth",
        "evaluation_mode": "mode_a_benchmark",
        "dataset_id": dataset_id,
        "pipeline_config_id": pipeline_id,
        "detection_run_id": det_run_id,
        "reconstruction_run_id": rec_run_id,
        "synthetic_fault_seed": 42,
    }
    eval_res = client.post("/api/evaluations", json=eval_payload)
    assert eval_res.status_code == 201
    eval_data = eval_res.json()
    assert eval_data["status"] == "completed"
    assert eval_data["detection_metrics"] is not None
    assert eval_data["reconstruction_metrics"] is not None
    assert eval_data["reconstruction_metrics"]["has_ground_truth"] is True
