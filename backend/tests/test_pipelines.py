import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.pipeline_service import PipelineService

client = TestClient(app)

SAMPLE_CSV = (
    "timestamp,vibration_x,temperature,pressure,status_code\n"
    "2026-10-22T08:00:00Z,0.142,52.4,162.5,RUNNING\n"
    "2026-10-22T08:00:01Z,0.145,52.4,162.7,RUNNING\n"
    "2026-10-22T08:00:02Z,0.139,52.5,162.4,RUNNING\n"
    "2026-10-22T08:00:03Z,0.151,52.6,162.8,RUNNING\n"
    "2026-10-22T08:00:04Z,0.148,52.6,162.6,RUNNING\n"
    "2026-10-22T08:00:05Z,0.144,52.7,162.5,RUNNING\n"
    "2026-10-22T08:00:06Z,0.144,52.7,162.4,RUNNING\n"
    "2026-10-22T08:00:07Z,0.140,52.8,162.3,RUNNING\n"
    "2026-10-22T08:00:08Z,0.143,52.8,162.5,RUNNING\n"
    "2026-10-22T08:00:09Z,0.146,52.9,162.6,RUNNING\n"
    "2026-10-22T08:00:10Z,0.142,52.9,162.5,RUNNING\n"
    "2026-10-22T08:00:11Z,0.138,53.0,162.4,RUNNING\n"
)


@pytest.fixture(autouse=True)
def setup_test_storage(tmp_path: Path, monkeypatch):
    """Ensure all tests use isolated temporary storage directories."""
    dataset_storage = tmp_path / "test_datasets"
    pipeline_storage = tmp_path / "test_pipelines"
    dataset_storage.mkdir(parents=True, exist_ok=True)
    pipeline_storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "STORAGE_DIR", str(dataset_storage))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(pipeline_storage))
    yield {"dataset_storage": dataset_storage, "pipeline_storage": pipeline_storage}


@pytest.fixture
def uploaded_dataset_id() -> str:
    """Helper fixture to upload a valid dataset and return its server ID."""
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("bearing_telemetry.csv", io.BytesIO(SAMPLE_CSV.encode("utf-8")), "text/csv")},
    )
    assert response.status_code == 201
    return response.json()["metadata"]["dataset_id"]


def test_1_valid_configuration_validation(uploaded_dataset_id):
    """1. Valid configuration validation returns is_valid=True with no errors."""
    payload = {
        "configuration_name": "Turbine Alpha Primary Config",
        "description": "Standard vibration and temperature monitoring configuration",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x", "temperature", "pressure"],
        "ignored_columns": ["status_code"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": 3.5, "min_observations": 5},
            "isolation_forest": {"enabled": True, "contamination": 0.05, "random_seed": 42, "min_observations": 10},
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 5,
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

    response = client.post("/api/pipelines/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is True
    assert len(data["errors"]) == 0
    assert data["dataset_id"] == uploaded_dataset_id


def test_2_invalid_dataset_id():
    """2. Validating or creating with an unknown dataset ID returns 404 Not Found."""
    payload = {
        "configuration_name": "Orphan Config",
        "dataset_id": "ds_nonexistent_9999",
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
    }
    response = client.post("/api/pipelines/validate", json=payload)
    assert response.status_code == 404
    assert "not found" in response.json()["error"]["message"].lower()

    create_res = client.post("/api/pipelines", json=payload)
    assert create_res.status_code == 404


def test_3_unknown_column(uploaded_dataset_id):
    """3. Mappings that reference unknown columns are caught during validation."""
    payload = {
        "configuration_name": "Unknown Col Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "unknown_timestamp_col",
        "sensor_columns": ["vibration_x", "unknown_sensor_col"],
        "ignored_columns": ["unknown_ignored_col"],
    }
    response = client.post("/api/pipelines/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is False
    error_messages = [e["message"] for e in data["errors"]]
    assert any("unknown_timestamp_col" in msg for msg in error_messages)
    assert any("unknown_sensor_col" in msg for msg in error_messages)
    assert any("unknown_ignored_col" in msg for msg in error_messages)


def test_4_duplicate_sensor_assignments(uploaded_dataset_id):
    """4. Duplicate sensor column selections are rejected."""
    payload = {
        "configuration_name": "Duplicate Sensor Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x", "temperature", "vibration_x"],
    }
    response = client.post("/api/pipelines/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is False
    assert any("Duplicate sensor-column assignment" in e["message"] for e in data["errors"])


def test_5_conflicting_column_roles(uploaded_dataset_id):
    """5. Columns assigned simultaneously to conflicting roles are rejected."""
    payload = {
        "configuration_name": "Conflicting Roles Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "vibration_x",  # Conflicting: also in sensor_columns
        "sensor_columns": ["vibration_x", "temperature"],
        "ignored_columns": ["temperature"],  # Conflicting: also in sensor_columns
    }
    response = client.post("/api/pipelines/validate", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["is_valid"] is False
    error_messages = [e["message"] for e in data["errors"]]
    assert any("cannot be mapped as both timestamp and sensor" in msg for msg in error_messages)
    assert any("conflicting roles" in msg for msg in error_messages)


def test_6_invalid_detection_parameters(uploaded_dataset_id):
    """6. Bounded parameter validation catches invalid detection settings."""
    # Out of range Pydantic values
    bad_payload = {
        "configuration_name": "Bad Detection Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 2, "mad_threshold": 0.5, "min_observations": 1},
        },
    }
    res = client.post("/api/pipelines/validate", json=bad_payload)
    assert res.status_code == 422

    # Contextual check: min_observations exceeds dataset row count (12 rows in sample)
    excess_payload = {
        "configuration_name": "Excess Obs Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": 3.0, "min_observations": 50},
        },
    }
    res2 = client.post("/api/pipelines/validate", json=excess_payload)
    assert res2.status_code == 200
    assert res2.json()["is_valid"] is False
    assert any("exceeds total dataset rows" in e["message"] for e in res2.json()["errors"])


def test_7_invalid_reconstruction_parameters(uploaded_dataset_id):
    """7. Disabling preservation of original readings violates invariant and is rejected."""
    payload = {
        "configuration_name": "Violate Invariant Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
        "reconstruction_settings": {
            "preserve_original_readings": False,
        },
    }
    res = client.post("/api/pipelines/validate", json=payload)
    assert res.status_code == 200
    assert res.json()["is_valid"] is False
    assert any("Preservation of original sensor readings is a non-negotiable architectural invariant" in e["message"] for e in res.json()["errors"])


def test_8_invalid_confidence_policy(uploaded_dataset_id):
    """8. Invalid confidence policies are caught by validation."""
    # review_threshold out of [0.0, 1.0]
    payload = {
        "configuration_name": "Invalid Threshold Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
        "confidence_policy": {
            "review_threshold": 1.5,
        },
    }
    res = client.post("/api/pipelines/validate", json=payload)
    assert res.status_code == 422


def test_9_successful_configuration_creation(uploaded_dataset_id, setup_test_storage):
    """9. A validated configuration is successfully persisted with server-controlled ID and version."""
    payload = {
        "configuration_name": "Production Sensor Net Alpha",
        "description": "Baseline telemetry monitoring configuration",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x", "temperature"],
        "ignored_columns": ["status_code"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": 3.0, "min_observations": 5},
            "isolation_forest": {"enabled": True, "contamination": 0.05, "random_seed": 42, "min_observations": 10},
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 5,
            "require_cross_sensor_validation": True,
            "preserve_original_readings": True,
            "allow_automatic_correction": False,
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": 0.80,
            "human_review_required": True,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }

    res = client.post("/api/pipelines", json=payload)
    assert res.status_code == 201
    created = res.json()
    assert created["configuration_id"].startswith("pipe_")
    assert created["configuration_name"] == "Production Sensor Net Alpha"
    assert created["configuration_version"] == 1
    assert created["dataset_id"] == uploaded_dataset_id
    assert "created_at" in created
    assert "updated_at" in created

    # Verify atomic file creation in storage
    storage_file = setup_test_storage["pipeline_storage"] / f"{created['configuration_id']}.json"
    assert storage_file.exists()


def test_10_listing_configurations(uploaded_dataset_id):
    """10. Listing saved configurations returns all persisted configs sorted by updated_at."""
    for i in range(3):
        client.post(
            "/api/pipelines",
            json={
                "configuration_name": f"Pipeline Config #{i+1}",
                "dataset_id": uploaded_dataset_id,
                "timestamp_column": "timestamp",
                "sensor_columns": ["vibration_x"],
            },
        )

    res = client.get("/api/pipelines")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 3
    assert len(data["pipelines"]) == 3
    assert data["pipelines"][0]["configuration_name"] == "Pipeline Config #3"


def test_11_retrieving_saved_configuration(uploaded_dataset_id):
    """11. Retrieve a specific saved configuration by its ID."""
    create_res = client.post(
        "/api/pipelines",
        json={
            "configuration_name": "Target Config For Retrieval",
            "dataset_id": uploaded_dataset_id,
            "timestamp_column": "timestamp",
            "sensor_columns": ["vibration_x", "pressure"],
        },
    )
    config_id = create_res.json()["configuration_id"]

    get_res = client.get(f"/api/pipelines/{config_id}")
    assert get_res.status_code == 200
    retrieved = get_res.json()
    assert retrieved["configuration_id"] == config_id
    assert retrieved["configuration_name"] == "Target Config For Retrieval"
    assert retrieved["sensor_columns"] == ["vibration_x", "pressure"]


def test_12_updating_configuration(uploaded_dataset_id):
    """12. Updating a configuration validates changes and increments configuration_version."""
    create_res = client.post(
        "/api/pipelines",
        json={
            "configuration_name": "Initial Name",
            "dataset_id": uploaded_dataset_id,
            "timestamp_column": "timestamp",
            "sensor_columns": ["vibration_x"],
        },
    )
    config_id = create_res.json()["configuration_id"]
    initial_version = create_res.json()["configuration_version"]
    created_at = create_res.json()["created_at"]

    update_payload = {
        "configuration_name": "Updated Name V2",
        "description": "Updated description with additional sensor",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x", "temperature"],
        "ignored_columns": ["pressure"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 8, "mad_threshold": 4.0, "min_observations": 5},
            "isolation_forest": {"enabled": False, "contamination": 0.05, "random_seed": 42, "min_observations": 10},
        },
        "reconstruction_settings": {
            "allow_linear_interpolation": True,
            "max_gap_size": 3,
            "require_cross_sensor_validation": True,
            "preserve_original_readings": True,
            "allow_automatic_correction": True,
            "fallback_behavior": "abstain_unresolved",
        },
        "confidence_policy": {
            "review_threshold": 0.85,
            "human_review_required": True,
            "min_evidence_sensors": 1,
            "unjustified_behavior": "abstain_unresolved",
        },
    }

    put_res = client.put(f"/api/pipelines/{config_id}", json=update_payload)
    assert put_res.status_code == 200
    updated = put_res.json()
    assert updated["configuration_id"] == config_id
    assert updated["configuration_name"] == "Updated Name V2"
    assert updated["configuration_version"] == initial_version + 1
    assert updated["created_at"] == created_at
    assert len(updated["sensor_columns"]) == 2


def test_13_unknown_configuration_id():
    """13. Attempting to get or update an unknown configuration ID returns 404."""
    get_res = client.get("/api/pipelines/pipe_does_not_exist")
    assert get_res.status_code == 404
    assert "not found" in get_res.json()["error"]["message"].lower()

    put_res = client.put(
        "/api/pipelines/pipe_does_not_exist",
        json={
            "configuration_name": "Phantom",
            "dataset_id": "ds_any",
            "sensor_columns": ["vibr"],
        },
    )
    assert put_res.status_code == 404


def test_14_persistence_across_service_restart(uploaded_dataset_id):
    """14. Configurations persist across service instances / reinitializations."""
    create_res = client.post(
        "/api/pipelines",
        json={
            "configuration_name": "Persistent Telemetry Config",
            "dataset_id": uploaded_dataset_id,
            "timestamp_column": "timestamp",
            "sensor_columns": ["vibration_x"],
        },
    )
    config_id = create_res.json()["configuration_id"]

    # Instantiate a fresh service instance referencing the same storage
    fresh_service = PipelineService()
    reloaded = fresh_service.get_pipeline_config(config_id)
    assert reloaded.configuration_id == config_id
    assert reloaded.configuration_name == "Persistent Telemetry Config"


def test_15_validation_endpoint_does_not_save_or_execute(uploaded_dataset_id, setup_test_storage):
    """15. Calling POST /api/pipelines/validate does NOT save files or execute pipelines."""
    payload = {
        "configuration_name": "Validation Only Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["vibration_x"],
    }

    res = client.post("/api/pipelines/validate", json=payload)
    assert res.status_code == 200

    # Ensure storage folder is completely empty
    storage_dir = setup_test_storage["pipeline_storage"]
    saved_files = list(storage_dir.iterdir())
    assert len(saved_files) == 0


def test_16_non_numeric_sensor_column_rejected(uploaded_dataset_id):
    """16. Assigning a non-numeric string column as a sensor is rejected."""
    payload = {
        "configuration_name": "String As Sensor Config",
        "dataset_id": uploaded_dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["status_code"],  # String column ('RUNNING')
    }
    res = client.post("/api/pipelines/validate", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["is_valid"] is False
    assert any("non-numeric" in e["message"] for e in data["errors"])
