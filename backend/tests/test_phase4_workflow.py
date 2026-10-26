"""
End-to-end operational verification test for Phase 4: Pipeline Configuration workflow.
Executes the required flow:
Upload dataset -> Select dataset -> Map columns -> Configure policies -> Validate -> Save -> Reload saved configuration -> Update configuration.
"""
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from fastapi.testclient import TestClient
from app.core.config import settings
from app.main import app

def test_end_to_end_pipeline_configuration_workflow(tmp_path: Path, monkeypatch):
    """Verify complete end-to-end Phase 4 workflow with isolated storage."""
    dataset_storage = tmp_path / "test_datasets"
    pipeline_storage = tmp_path / "test_pipelines"
    dataset_storage.mkdir(parents=True, exist_ok=True)
    pipeline_storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "STORAGE_DIR", str(dataset_storage))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(pipeline_storage))

    client = TestClient(app)
    sample_csv_path = backend_dir / "samples" / "industrial_telemetry_sample.csv"
    assert sample_csv_path.exists(), f"Sample file not found at {sample_csv_path}"

    # 1. Upload sample dataset
    with open(sample_csv_path, "rb") as f:
        upload_res = client.post(
            "/api/datasets/upload",
            files={"file": ("industrial_telemetry_sample.csv", f, "text/csv")},
        )
    assert upload_res.status_code == 201
    dataset_id = upload_res.json()["metadata"]["dataset_id"]

    # 2. Retrieve catalog and quality
    list_res = client.get("/api/datasets")
    assert list_res.status_code == 200
    assert any(d["dataset_id"] == dataset_id for d in list_res.json()["datasets"])

    quality_res = client.get(f"/api/datasets/{dataset_id}/quality")
    assert quality_res.status_code == 200
    quality = quality_res.json()
    numeric_cols = [c["name"] for c in quality["columns"] if c["is_numeric"]]
    string_cols = [c["name"] for c in quality["columns"] if not c["is_numeric"]]
    ts_cands = [c["column_name"] for c in quality["timestamp_candidates"]]

    # 3. Column role mappings
    ts_col = ts_cands[0] if ts_cands else "timestamp"
    sensor_cols = [c for c in numeric_cols if c != ts_col]
    ignored_cols = [c for c in string_cols if c != ts_col]

    # 4. Validate configuration
    config_payload = {
        "configuration_name": "Turbine Primary Healing Pipeline",
        "description": "Multi-sensor vibration and temperature monitoring with contextual interpolation",
        "dataset_id": dataset_id,
        "timestamp_column": ts_col,
        "sensor_columns": sensor_cols,
        "ignored_columns": ignored_cols,
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 15, "mad_threshold": 3.5, "min_observations": 5},
            "isolation_forest": {"enabled": True, "contamination": 0.05, "random_seed": 42, "min_observations": 15},
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 4,
            "require_cross_sensor_validation": True,
            "preserve_original_readings": True,
            "allow_automatic_correction": False,
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": 0.80,
            "human_review_required": True,
            "min_evidence_sensors": 2,
            "unjustified_behavior": "abstain_unresolved",
        },
    }

    val_res = client.post("/api/pipelines/validate", json=config_payload)
    assert val_res.status_code == 200
    val_data = val_res.json()
    assert val_data["is_valid"] is True
    assert len(val_data["errors"]) == 0
    # Expected real warnings from sample telemetry (duplicate timestamp + missing cells)
    assert len(val_data["warnings"]) >= 1

    # 5. Create configuration
    create_res = client.post("/api/pipelines", json=config_payload)
    assert create_res.status_code == 201
    saved_config = create_res.json()
    config_id = saved_config["configuration_id"]
    assert saved_config["configuration_version"] == 1

    # 6. Retrieve saved configuration
    list_configs_res = client.get("/api/pipelines")
    assert list_configs_res.status_code == 200
    assert any(c["configuration_id"] == config_id for c in list_configs_res.json()["pipelines"])

    get_single_res = client.get(f"/api/pipelines/{config_id}")
    assert get_single_res.status_code == 200
    retrieved = get_single_res.json()
    assert retrieved["configuration_id"] == config_id
    assert retrieved["configuration_name"] == "Turbine Primary Healing Pipeline"

    # 7. Update configuration (version increment)
    config_payload["configuration_name"] = "Turbine Primary Healing Pipeline (Revised)"
    config_payload["confidence_policy"]["review_threshold"] = 0.85
    update_res = client.put(f"/api/pipelines/{config_id}", json=config_payload)
    assert update_res.status_code == 200
    updated = update_res.json()
    assert updated["configuration_version"] == 2
    assert updated["configuration_name"] == "Turbine Primary Healing Pipeline (Revised)"
    assert updated["confidence_policy"]["review_threshold"] == 0.85
