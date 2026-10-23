"""
End-to-end operational verification test for KINTSUGI Phase 5: Real Industrial Sensor Anomaly Detection.
Executes the required real workflow:
Upload CSV -> Configure pipeline -> Save configuration -> Run detection -> Retrieve results -> Inspect anomalies -> Verify integrity.
"""
import hashlib
import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import settings
from app.main import app


def test_complete_phase5_real_detection_workflow(tmp_path: Path, monkeypatch):
    """Verify complete end-to-end Phase 5 detection workflow with isolated storage."""
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

    # 1. Prepare synthetic industrial telemetry CSV with known injected anomalies:
    # 40 rows total:
    # Row 15: Extreme impulse spike on vibration (185.0 vs baseline 12.0)
    # Row 28: Extreme temperature excursion (195.0 vs baseline 55.0)
    csv_lines = ["timestamp,vibration,temperature,pressure"]
    for i in range(40):
        vib = 12.0 + (i % 3) * 0.3 if i != 15 else 185.0
        temp = 55.0 + (i % 4) * 0.2 if i != 28 else 195.0
        press = 101.3 + (i % 2) * 0.1
        csv_lines.append(f"2026-03-01T00:{i:02d}:00Z,{vib},{temp},{press}")
    raw_csv = "\n".join(csv_lines).encode("utf-8")
    raw_hash_before = hashlib.sha256(raw_csv).hexdigest()

    # Step 1: Upload dataset
    upload_res = client.post(
        "/api/datasets/upload",
        files={"file": ("real_industrial_stream.csv", raw_csv, "text/csv")},
    )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["metadata"]["dataset_id"]

    # Verify original file integrity on disk
    stored_csv_path = d_dir / dataset_id / "data.csv"
    assert stored_csv_path.exists()
    with open(stored_csv_path, "rb") as f:
        assert hashlib.sha256(f.read()).hexdigest() == raw_hash_before

    # Step 2: Configure and save pipeline configuration
    config_payload = {
        "configuration_name": "Turbine Alpha Multi-Detector Pipeline",
        "description": "Monitors vibration and temperature for impulse transients",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration", "temperature"],
        "ignored_columns": ["pressure"],
        "detection_settings": {
            "statistical": {
                "enabled": True,
                "window_size": 15,
                "mad_threshold": 3.5,
                "min_observations": 5,
            },
            "isolation_forest": {
                "enabled": True,
                "contamination": 0.05,
                "random_seed": 42,
                "min_observations": 20,
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

    # Validate configuration
    val_res = client.post("/api/pipelines/validate", json=config_payload)
    assert val_res.status_code == 200
    assert val_res.json()["is_valid"] is True

    # Save configuration
    create_res = client.post("/api/pipelines", json=config_payload)
    assert create_res.status_code == 201
    pipeline_id = create_res.json()["configuration_id"]

    # Step 3: Run Real Detection
    run_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert run_res.status_code == 201
    run_envelope = run_res.json()
    run = run_envelope["run"]
    run_id = run["run_id"]
    assert run["status"] == "completed"
    assert run["dataset_id"] == dataset_id
    assert run["configuration_id"] == pipeline_id

    # Verify run summary counts
    summary = run["summary"]
    assert summary["total_rows_analyzed"] == 40
    assert summary["total_anomalies_detected"] >= 2
    assert "vibration" in summary["anomalies_by_sensor"]
    assert "temperature" in summary["anomalies_by_sensor"]

    # Step 4: Verify Disk Persistence
    run_file = r_dir / run_id / "run.json"
    anom_file = r_dir / run_id / "anomalies.json"
    assert run_file.exists()
    assert anom_file.exists()

    # Step 5: Retrieve Run Results via API
    results_res = client.get(f"/api/pipelines/{pipeline_id}/runs/{run_id}/results?limit=50")
    assert results_res.status_code == 200
    results_data = results_res.json()
    assert results_data["total_anomalies"] == summary["total_anomalies_detected"]
    anomalies = results_data["anomalies"]
    assert len(anomalies) == summary["total_anomalies_detected"]

    # Verify that the known injected anomalies are present at exact source row indices:
    row_15_anoms = [a for a in anomalies if a["source_row_index"] == 15 and a["sensor_column"] == "vibration"]
    assert len(row_15_anoms) >= 1
    assert row_15_anoms[0]["original_value"] == 185.0
    assert row_15_anoms[0]["flagged_status"] == "FLAGGED"

    row_28_anoms = [a for a in anomalies if a["source_row_index"] == 28 and a["sensor_column"] == "temperature"]
    assert len(row_28_anoms) >= 1
    assert row_28_anoms[0]["original_value"] == 195.0
    assert row_28_anoms[0]["flagged_status"] == "FLAGGED"

    # Step 6: Query Global Anomalies Catalog
    cat_res = client.get(f"/api/anomalies?run_id={run_id}&sensor_column=vibration")
    assert cat_res.status_code == 200
    cat_data = cat_res.json()
    assert cat_data["total"] >= 1
    target_anom_id = cat_data["anomalies"][0]["anomaly_id"]

    # Single Anomaly Record Lookup
    single_res = client.get(f"/api/anomalies/{target_anom_id}")
    assert single_res.status_code == 200
    single_rec = single_res.json()
    assert single_rec["anomaly_id"] == target_anom_id
    assert "statistical_mad" in single_rec["detector_details"]

    # Step 7: Critical Integrity Invariant: Raw CSV was NOT modified
    with open(stored_csv_path, "rb") as f:
        raw_hash_after = hashlib.sha256(f.read()).hexdigest()
    assert raw_hash_before == raw_hash_after, "CRITICAL: Raw CSV modified by detection engine!"
