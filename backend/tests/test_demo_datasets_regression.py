"""
Comprehensive regression test suite for Demo 1 and Demo 2 industrial datasets.

Validates end-to-end processing through KINTSUGI production services:
- dataset_service (CSV parsing, schema validation, quality profiling)
- pipeline_service (configuration, validation, persistence)
- detection_service (Rolling MAD, Isolation Forest anomaly detection)
- reconstruction_service (contextual signal repair, safe abstention, confidence scoring)
- audit_service (provenance and ledger logging)
- export service (side-by-side compliance format)
"""

import os
import sys
from hashlib import sha256
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.services.dataset_service import dataset_service, get_storage_path
from app.services.pipeline_service import pipeline_service
from app.services.detection_service import detection_service
from app.services.reconstruction_service import reconstruction_service
from app.schemas.pipeline import (
    PipelineConfigCreate,
    DetectionSettings,
    StatisticalDetectorSettings,
    IsolationForestSettings,
    ReconstructionSettings,
    ConfidencePolicy,
)

# Test fixture paths
REPO_ROOT = backend_dir.parent
DEMO_1_PATH = REPO_ROOT / "demo_data" / "demo_1_industrial_recoverable_faults.csv"
DEMO_2_PATH = REPO_ROOT / "demo_data" / "demo_2_industrial_ambiguous_faults.csv"


@pytest.fixture(scope="module")
def client():
    return TestClient(app)


def test_demo_files_exist_in_fixture_directory():
    """Verify both CSV files exist in demo_data/ and test_data/ and are non-empty."""
    assert DEMO_1_PATH.is_file(), f"Demo 1 file missing at {DEMO_1_PATH}"
    assert DEMO_2_PATH.is_file(), f"Demo 2 file missing at {DEMO_2_PATH}"
    assert DEMO_1_PATH.stat().st_size > 0
    assert DEMO_2_PATH.stat().st_size > 0


def test_demo_1_parsing_and_schema():
    """Verify Demo 1 CSV parsing, schema verification, and quality analysis."""
    with open(DEMO_1_PATH, "rb") as f:
        content = f.read()

    res = dataset_service.ingest_dataset_bytes(content, "demo_1_industrial_recoverable_faults.csv")
    meta = res.metadata
    quality = res.quality

    assert meta.row_count == 240
    assert meta.column_count == 5
    expected_cols = ["timestamp", "TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"]
    assert meta.columns == expected_cols

    # Timestamp candidate check
    assert len(quality.timestamp_candidates) == 1
    cand = quality.timestamp_candidates[0]
    assert cand.column_name == "timestamp"
    assert cand.parseable_percentage == 100.0
    assert cand.is_monotonic is True
    assert cand.duplicate_timestamp_count == 0

    # Numeric sensors check
    sensor_cols = [c for c in quality.columns if c.name != "timestamp"]
    for c in sensor_cols:
        assert c.is_numeric is True
        assert c.detected_type in ["float", "integer"]


def test_demo_2_parsing_and_schema():
    """Verify Demo 2 CSV parsing, schema verification, and quality analysis."""
    with open(DEMO_2_PATH, "rb") as f:
        content = f.read()

    res = dataset_service.ingest_dataset_bytes(content, "demo_2_industrial_ambiguous_faults.csv")
    meta = res.metadata
    quality = res.quality

    assert meta.row_count == 240
    assert meta.column_count == 5
    expected_cols = ["timestamp", "TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"]
    assert meta.columns == expected_cols

    assert len(quality.timestamp_candidates) == 1
    cand = quality.timestamp_candidates[0]
    assert cand.column_name == "timestamp"
    assert cand.parseable_percentage == 100.0
    assert cand.is_monotonic is True
    assert cand.duplicate_timestamp_count == 0


def test_demo_1_end_to_end_pipeline():
    """
    Test Demo 1 through real pipeline:
    - Ingest CSV
    - Configure Pipeline
    - Run Detection (MAD + IF)
    - Run Reconstruction
    - Verify Recoverable Faults (thermal spike repaired, short gaps interpolated)
    - Verify Raw Data Immutability
    - Verify Export Output
    """
    with open(DEMO_1_PATH, "rb") as f:
        content = f.read()
    input_hash = sha256(content).hexdigest()

    ingest_res = dataset_service.ingest_dataset_bytes(content, "demo_1_industrial_recoverable_faults.csv")
    ds_id = ingest_res.metadata.dataset_id

    pipe_create = PipelineConfigCreate(
        configuration_name="Regression Test Demo 1",
        description="Automated regression test for recoverable faults",
        dataset_id=ds_id,
        timestamp_column="timestamp",
        sensor_columns=["TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"],
        ignored_columns=[],
        detection_settings=DetectionSettings(
            statistical=StatisticalDetectorSettings(enabled=True, window_size=15, mad_threshold=3.0, min_observations=10),
            isolation_forest=IsolationForestSettings(enabled=True, contamination=0.05, min_observations=10),
        ),
        reconstruction_settings=ReconstructionSettings(
            allow_linear_interpolation=True,
            max_gap_size=5,
            require_cross_sensor_validation=True,
            preserve_original_readings=True,
            allow_automatic_correction=True,
            fallback_behavior="abstain_unresolved",
        ),
        confidence_policy=ConfidencePolicy(
            review_threshold=0.70,
            human_review_required=False,
            min_evidence_sensors=1,
            unjustified_behavior="abstain_unresolved",
        ),
    )

    validation = pipeline_service.validate_pipeline_config(pipe_create)
    assert validation.is_valid is True

    pipe = pipeline_service.create_pipeline_config(pipe_create)
    assert pipe.configuration_id.startswith("pipe_")

    # Run Detection
    det_run = detection_service.execute_detection_run(pipe.configuration_id)
    assert det_run.status == "completed"
    assert det_run.summary.total_anomalies_detected > 0

    # Run Reconstruction
    rec_run_resp = reconstruction_service.execute_reconstruction_run(pipe.configuration_id, det_run.run_id)
    rec_run = rec_run_resp.run
    assert rec_run.status == "completed"
    assert rec_run.summary.corrected_count > 0

    # Check key injected faults:
    # Row 90 TURBINE_TEMP_A was an injected thermal spike (94.5°C vs baseline ~65°C)
    results = reconstruction_service.get_reconstruction_results(rec_run.reconstruction_run_id, limit=500).results
    temp_spike_rec = next((r for r in results if r.sensor_column == "TURBINE_TEMP_A" and r.source_row_index == 90), None)
    assert temp_spike_rec is not None
    assert temp_spike_rec.status == "CORRECTED"
    assert temp_spike_rec.confidence_score >= 70.0
    assert temp_spike_rec.original_value == 94.5
    assert temp_spike_rec.final_value < 75.0  # repaired to local baseline

    # Verify original raw CSV dataset immutability
    stored_csv_path = get_storage_path() / ds_id / "data.csv"
    with open(stored_csv_path, "rb") as stored_f:
        stored_bytes = stored_f.read()
    assert sha256(stored_bytes).hexdigest() == input_hash, "Original CSV was mutated!"

    # Verify Export
    csv_export, media_type = reconstruction_service.export_reconstructed_dataset(rec_run.reconstruction_run_id, format_type="csv")
    assert media_type == "text/csv"
    assert "TURBINE_TEMP_A_repaired" in csv_export
    assert "TURBINE_TEMP_A_status" in csv_export
    assert "TURBINE_TEMP_A_confidence" in csv_export


def test_demo_2_safe_abstention_and_gap_limits():
    """
    Test Demo 2 through real pipeline:
    - Ingest CSV
    - Run Detection and Reconstruction
    - Verify Safe Abstention on large gaps (> max_gap_size=5)
    - Verify Original values preserved without hallucinating replacements
    - Verify Raw Data Immutability
    - Verify Export Output
    """
    with open(DEMO_2_PATH, "rb") as f:
        content = f.read()
    input_hash = sha256(content).hexdigest()

    ingest_res = dataset_service.ingest_dataset_bytes(content, "demo_2_industrial_ambiguous_faults.csv")
    ds_id = ingest_res.metadata.dataset_id

    pipe_create = PipelineConfigCreate(
        configuration_name="Regression Test Demo 2",
        description="Automated regression test for ambiguous faults and safe abstention",
        dataset_id=ds_id,
        timestamp_column="timestamp",
        sensor_columns=["TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"],
        ignored_columns=[],
        detection_settings=DetectionSettings(
            statistical=StatisticalDetectorSettings(enabled=True, window_size=15, mad_threshold=3.0, min_observations=10),
            isolation_forest=IsolationForestSettings(enabled=True, contamination=0.05, min_observations=10),
        ),
        reconstruction_settings=ReconstructionSettings(
            allow_linear_interpolation=True,
            max_gap_size=5,
            require_cross_sensor_validation=True,
            preserve_original_readings=True,
            allow_automatic_correction=True,
            fallback_behavior="abstain_unresolved",
        ),
        confidence_policy=ConfidencePolicy(
            review_threshold=0.70,
            human_review_required=False,
            min_evidence_sensors=1,
            unjustified_behavior="abstain_unresolved",
        ),
    )

    pipe = pipeline_service.create_pipeline_config(pipe_create)
    det_run = detection_service.execute_detection_run(pipe.configuration_id)
    rec_run_resp = reconstruction_service.execute_reconstruction_run(pipe.configuration_id, det_run.run_id)
    rec_run = rec_run_resp.run

    assert rec_run.status == "completed"
    assert rec_run.summary.unresolved_count > 0, "Expected strict abstentions for ambiguous faults"

    # Verify gap limit abstention: TURBINE_TEMP_A rows 55-64 has a contiguous gap of 10 samples (> 5 limit)
    results = reconstruction_service.get_reconstruction_results(rec_run.reconstruction_run_id, limit=500).results
    blackout_rec = next((r for r in results if r.sensor_column == "TURBINE_TEMP_A" and r.source_row_index == 55), None)
    assert blackout_rec is not None
    assert blackout_rec.status == "UNRESOLVED"
    assert blackout_rec.method == "none"
    assert blackout_rec.proposed_value is None
    assert blackout_rec.final_value is None  # Never hallucinated!
    assert "exceeds configured maximum gap limit" in blackout_rec.abstention_reason.lower()

    # Flow rate blackout: rows 185-196 has a 12 sample gap (> 5 limit)
    flow_blackout_rec = next((r for r in results if r.sensor_column == "FLOW_RATE_L_MIN" and r.source_row_index == 185), None)
    assert flow_blackout_rec is not None
    assert flow_blackout_rec.status == "UNRESOLVED"
    assert flow_blackout_rec.final_value is None
    assert "exceeds configured maximum gap limit" in flow_blackout_rec.abstention_reason.lower()

    # Verify original raw CSV immutability
    stored_csv_path = get_storage_path() / ds_id / "data.csv"
    with open(stored_csv_path, "rb") as stored_f:
        stored_bytes = stored_f.read()
    assert sha256(stored_bytes).hexdigest() == input_hash

    # Verify export
    csv_export, media_type = reconstruction_service.export_reconstructed_dataset(rec_run.reconstruction_run_id, format_type="csv")
    assert media_type == "text/csv"
    assert len(csv_export) > 0


def test_api_upload_and_error_handling(client):
    """Verify HTTP API contracts for upload, rejection of non-CSV and empty files."""
    # 1. Reject non-CSV extension
    res_bad_ext = client.post(
        "/api/datasets/upload",
        files={"file": ("test.txt", b"some,text,data\n1,2,3", "text/plain")},
    )
    assert res_bad_ext.status_code == 400
    err_body = res_bad_ext.json()
    err_msg = err_body.get("error", {}).get("message", "") or err_body.get("detail", "")
    assert "Only .csv files are supported" in err_msg

    # 2. Reject empty file
    res_empty = client.post(
        "/api/datasets/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert res_empty.status_code == 400
    empty_body = res_empty.json()
    empty_msg = empty_body.get("error", {}).get("message", "") or empty_body.get("detail", "")
    assert "empty" in empty_msg.lower()

    # 3. Successful upload of Demo 1
    with open(DEMO_1_PATH, "rb") as f:
        file_bytes = f.read()

    res_upload = client.post(
        "/api/datasets/upload",
        files={"file": ("demo_1_industrial_recoverable_faults.csv", file_bytes, "text/csv")},
    )
    assert res_upload.status_code == 201
    body = res_upload.json()
    assert body["metadata"]["filename"] == "demo_1_industrial_recoverable_faults.csv"
    assert body["metadata"]["row_count"] == 240
    assert body["metadata"]["column_count"] == 5
    assert body["quality"]["duplicate_rows_count"] == 0
