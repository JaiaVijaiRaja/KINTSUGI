"""
End-to-end operational verification test for KINTSUGI Phase 6: Confidence-Aware Data Reconstruction Engine.
Executes the required real workflow:
Upload CSV -> Configure pipeline -> Run real anomaly detection -> Execute reconstruction ->
Inspect confidence breakdown & evidence -> Perform operator review -> Verify raw dataset immutability.
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


def test_complete_phase6_reconstruction_workflow(tmp_path: Path, monkeypatch):
    """Verify complete end-to-end Phase 6 reconstruction workflow with isolated storage."""
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
        files={"file": ("turbine_sensor_stream.csv", raw_csv, "text/csv")},
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
        "configuration_name": "Turbine Reconstruction Pipeline",
        "description": "Detects spikes and performs confidence-scored reconstruction",
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
                "enabled": False,
            },
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 3,
            "require_cross_sensor_validation": False,
            "preserve_original_readings": True,
            "allow_automatic_correction": False,  # Strict: Requires human review
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": 0.70,
            "human_review_required": True,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }

    create_res = client.post("/api/pipelines", json=config_payload)
    assert create_res.status_code == 201
    pipeline_id = create_res.json()["configuration_id"]

    # Step 3: Run anomaly detection
    det_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert det_res.status_code == 201
    det_envelope = det_res.json()
    det_run = det_envelope["run"]
    detection_run_id = det_run["run_id"]
    assert det_run["status"] == "completed"
    assert det_run["summary"]["total_anomalies_detected"] >= 2

    # Step 4: Execute Reconstruction Run
    rec_trigger_res = client.post(f"/api/pipelines/{pipeline_id}/runs/{detection_run_id}/reconstruct")
    assert rec_trigger_res.status_code == 201
    rec_envelope = rec_trigger_res.json()
    rec_run = rec_envelope["run"]
    rec_run_id = rec_run["reconstruction_run_id"]
    assert rec_run["status"] == "completed"
    assert rec_run["detection_run_id"] == detection_run_id
    assert rec_run["pipeline_id"] == pipeline_id
    assert rec_run["dataset_id"] == dataset_id

    # Verify summary counts
    summary = rec_run["summary"]
    assert summary["total_evaluated"] == det_run["summary"]["total_anomalies_detected"]
    # Because human_review_required is True, proposed values transition to ESTIMATED, not auto-CORRECTED
    assert summary["estimated_count"] == 2
    assert summary["corrected_count"] == 0

    # Step 5: Query Reconstruction Run details
    get_run_res = client.get(f"/api/reconstruction/runs/{rec_run_id}")
    assert get_run_res.status_code == 200
    assert get_run_res.json()["reconstruction_run_id"] == rec_run_id

    # Step 6: Query paginated reconstruction results filtered by status
    results_res = client.get(
        f"/api/reconstruction/runs/{rec_run_id}/results?status=ESTIMATED&limit=10&offset=0"
    )
    assert results_res.status_code == 200
    res_data = results_res.json()
    assert res_data["total_results"] >= 2
    items = res_data["results"]
    assert len(items) >= 2

    # Check vibration spike item
    vib_item = next(it for it in items if it["sensor_column"] == "vibration")
    assert vib_item["source_row_index"] == 15
    assert vib_item["original_value"] == 185.0
    assert vib_item["status"] == "ESTIMATED"
    assert vib_item["proposed_value"] is not None
    # Proposed value should be close to baseline ~12.0
    assert 11.0 <= vib_item["proposed_value"] <= 13.0
    # In ESTIMATED status, final_value MUST remain equal to original_value until accepted!
    assert vib_item["final_value"] == 185.0
    assert vib_item["confidence_score"] > 60.0

    # Step 7: Inspect detailed single result with evidence breakdown
    detail_res = client.get(f"/api/reconstruction/results/{vib_item['result_id']}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert detail["result_id"] == vib_item["result_id"]
    assert detail["confidence_breakdown"] is not None
    assert "neighbor_count_score" in detail["confidence_breakdown"]
    assert "method_agreement_score" in detail["confidence_breakdown"]
    assert len(detail["evidence_references"]) > 0

    # Step 8: Operator human review decision
    # Operator accepts the proposed estimate for row 15
    review_payload = {
        "decision": "ACCEPT",
        "review_comment": "Reviewed by Senior Reliability Engineer; spike caused by telemetry dropout, linear interpolation accepted.",
        "reviewer_name": "eng_lead_01",
    }
    review_res = client.post(f"/api/reconstruction/results/{vib_item['result_id']}/review", json=review_payload)
    assert review_res.status_code == 200
    reviewed_item = review_res.json()
    assert reviewed_item["status"] == "CORRECTED"
    assert reviewed_item["final_value"] == reviewed_item["proposed_value"]
    assert reviewed_item["review_decision"] == "ACCEPT"
    assert reviewed_item["reviewed_by"] == "eng_lead_01"

    # Step 9: Re-query run summary and confirm counts updated dynamically
    updated_run_res = client.get(f"/api/reconstruction/runs/{rec_run_id}")
    assert updated_run_res.status_code == 200
    updated_summary = updated_run_res.json()["summary"]
    assert updated_summary["corrected_count"] == 1
    assert updated_summary["estimated_count"] == summary["estimated_count"] - 1

    # Step 10: Strict Immutability verification of original uploaded dataset
    with open(stored_csv_path, "rb") as f:
        assert hashlib.sha256(f.read()).hexdigest() == raw_hash_before
