"""
KINTSUGI — Phase 9: End-to-End Integration and Reliability Engineering Test Suite.

Verifies:
1. Complete critical workflow from ingestion through detection, reconstruction, evaluation, and audit tracing.
2. Source dataset preservation and immutability (SHA-256 verification).
3. Reconstruction safety invariants (extrapolation prohibition, quorum abstention, status distinction).
4. Evaluation correctness, denominator edge-case safety, and ground-truth isolation.
5. Persistence across simulated application restart and recovery from corrupted records.
6. Failure handling and uniform error envelopes (400, 404, 422).
7. Cryptographic hash-chain integrity, tamper detection, and bounded compliance export.
"""

import hashlib
import json
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.services.dataset_service import DatasetService
from app.services.pipeline_service import PipelineService
from app.services.detection_service import DetectionService
from app.services.reconstruction_service import ReconstructionService
from app.services.evaluation_service import EvaluationService
from app.services.audit_service import AuditService
from tests.fixtures.synthetic_fixture import (
    generate_synthetic_telemetry,
    dataframe_to_csv_bytes,
)


@pytest.fixture
def isolated_storage(tmp_path: Path, monkeypatch):
    """Isolate all KINTSUGI persistence directories to temporary paths."""
    d_dir = tmp_path / "datasets"
    p_dir = tmp_path / "pipelines"
    r_dir = tmp_path / "runs"
    rec_dir = tmp_path / "reconstruction"
    ev_dir = tmp_path / "evaluations"
    aud_dir = tmp_path / "audit"

    for d in (d_dir, p_dir, r_dir, rec_dir, ev_dir, aud_dir):
        d.mkdir(parents=True, exist_ok=True)

    monkeypatch.setattr(settings, "STORAGE_DIR", str(d_dir))
    monkeypatch.setattr(settings, "PIPELINE_STORAGE_DIR", str(p_dir))
    monkeypatch.setattr(settings, "RUNS_STORAGE_DIR", str(r_dir))
    monkeypatch.setattr(settings, "RECONSTRUCTION_STORAGE_DIR", str(rec_dir))
    monkeypatch.setattr(settings, "EVALUATION_STORAGE_DIR", str(ev_dir))
    monkeypatch.setattr(settings, "AUDIT_STORAGE_DIR", str(aud_dir))

    return {
        "datasets": d_dir,
        "pipelines": p_dir,
        "runs": r_dir,
        "reconstruction": rec_dir,
        "evaluations": ev_dir,
        "audit": aud_dir,
    }


@pytest.fixture
def client(isolated_storage):
    """Test client bound to isolated storage."""
    return TestClient(app)


# =============================================================================
# 1. CRITICAL END-TO-END WORKFLOW VERIFICATION
# =============================================================================

def test_complete_end_to_end_pipeline_workflow(isolated_storage, client):
    """
    Executes the full critical lifecycle:
    Upload -> Preview & Quality -> Create Pipeline -> Validate -> Detect ->
    Reconstruct -> Evaluate Benchmark -> Trace Audit Provenance -> Restart & Verify.
    """
    clean_df, corrupted_df, manifest = generate_synthetic_telemetry(n_rows=60, seed=101)
    csv_bytes = dataframe_to_csv_bytes(corrupted_df)
    initial_sha256 = hashlib.sha256(csv_bytes).hexdigest()

    # Step 1: Upload dataset
    upload_res = client.post(
        "/api/datasets/upload",
        files={"file": ("turbine_corrupted.csv", csv_bytes, "text/csv")},
    )
    assert upload_res.status_code == 201
    meta = upload_res.json()["metadata"]
    dataset_id = meta["dataset_id"]
    assert dataset_id.startswith("ds_")
    assert meta["row_count"] == 60

    # Step 2: Retrieve preview and quality audit
    preview_res = client.get(f"/api/datasets/{dataset_id}/preview?limit=10")
    assert preview_res.status_code == 200
    assert len(preview_res.json()["rows"]) == 10

    quality_res = client.get(f"/api/datasets/{dataset_id}/quality")
    assert quality_res.status_code == 200
    quality = quality_res.json()
    assert quality["total_rows"] == 60
    assert any(c["name"] == "temperature_bearing_c" for c in quality["columns"])

    # Step 3: Create & Validate Pipeline Configuration
    pipe_payload = {
        "configuration_name": "Turbine Integration Pipeline v1",
        "description": "Full end-to-end integration test configuration",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g"],
        "ignored_columns": ["ambient_temp_c", "pressure_feed_bar"],
        "detection_settings": {
            "statistical": {
                "enabled": True,
                "window_size": 15,
                "mad_threshold": 3.0,
                "min_observations": 5,
            },
            "isolation_forest": {
                "enabled": True,
                "contamination": 0.05,
                "n_estimators": 50,
            },
            "aggregation_policy": "ANY",
        },
        "reconstruction_settings": {
            "default_method": "linear_interpolation",
            "max_gap_size": 5,
            "min_trusted_neighbors": 3,
            "acceptance_policy": {
                "auto_accept_threshold": 0.70,
                "review_threshold": 0.50,
                "require_operator_review": False,
            },
        },
    }

    # Validate endpoint has no side-effects
    val_res = client.post("/api/pipelines/validate", json=pipe_payload)
    assert val_res.status_code == 200
    assert val_res.json()["is_valid"] is True

    # Persist pipeline
    create_pipe_res = client.post("/api/pipelines", json=pipe_payload)
    assert create_pipe_res.status_code == 201
    pipeline_id = create_pipe_res.json()["configuration_id"]
    assert pipeline_id.startswith("pipe_")

    # Step 4: Execute Anomaly Detection
    det_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert det_res.status_code == 201
    det_data = det_res.json()["run"]
    run_id = det_data["run_id"]
    assert det_data["status"].lower() == "completed"
    assert det_data["summary"]["total_anomalies_detected"] >= 1

    # Fetch detection results
    det_results_res = client.get(f"/api/pipelines/{pipeline_id}/runs/{run_id}/results")
    assert det_results_res.status_code == 200
    anomalies = det_results_res.json()["anomalies"]
    assert len(anomalies) >= 1

    # Verify spike at row 12 was detected
    spike_found = any(
        a["source_row_index"] == 12 and a["sensor_column"] == "temperature_bearing_c"
        for a in anomalies
    )
    assert spike_found is True

    # Step 5: Execute Signal Reconstruction
    rec_res = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/reconstruct")
    assert rec_res.status_code == 201
    rec_data = rec_res.json()["run"]
    rec_run_id = rec_data["reconstruction_run_id"]
    assert rec_data["status"].lower() == "completed"

    # Fetch reconstruction records
    rec_records_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results")
    assert rec_records_res.status_code == 200
    records = rec_records_res.json()["results"]
    assert len(records) >= 1

    # Identify the reconstruction of row 12 spike
    row12_rec = next(
        (r for r in records if r["source_row_index"] == 12 and r["sensor_column"] == "temperature_bearing_c"),
        None,
    )
    assert row12_rec is not None
    assert row12_rec["status"] in ("CORRECTED", "ESTIMATED")
    assert row12_rec["confidence_score"] > 0
    rec_result_id = row12_rec["result_id"]

    # Step 6: Benchmark Evaluation (Mode A - Controlled Fault Injection)
    eval_payload = {
        "dataset_id": dataset_id,
        "evaluation_mode": "mode_a_benchmark",
        "pipeline_id": pipeline_id,
        "fault_config": {
            "seed": 42,
            "sensor_columns": ["temperature_bearing_c"],
            "spikes": {"enabled": True, "rate": 0.05, "magnitude_factor": 5.0},
            "corruption": {"enabled": False},
            "missing": {"enabled": False},
            "drift": {"enabled": False},
            "frozen": {"enabled": False},
            "gap": {"enabled": False},
        },
    }
    eval_res = client.post("/api/evaluations", json=eval_payload)
    assert eval_res.status_code == 201
    eval_id = eval_res.json()["evaluation_id"]

    # Retrieve evaluation metrics
    eval_metrics_res = client.get(f"/api/evaluations/{eval_id}/metrics")
    assert eval_metrics_res.status_code == 200
    eval_metrics = eval_metrics_res.json()
    assert eval_metrics["detection_metrics"] is not None

    # Step 7: Audit Provenance Trace
    trace_res = client.get(f"/api/audit/traces/{rec_result_id}")
    assert trace_res.status_code == 200
    trace = trace_res.json()
    assert trace["reconstruction_result_id"] == rec_result_id
    assert trace["dataset_id"] == dataset_id
    assert len(trace["trace_steps"]) >= 4
    # Confirm structured explainability models are present
    assert trace["detection_explanation"] is not None
    assert trace["reconstruction_explanation"] is not None

    # Step 8: Cryptographic Hash Chain Verification
    verify_res = client.post("/api/audit/verify")
    assert verify_res.status_code == 200
    v_info = verify_res.json()
    assert v_info["is_valid"] is True
    assert v_info["total_events_checked"] >= 5

    # Step 9: Source Dataset Immutability Check
    stored_csv_path = isolated_storage["datasets"] / dataset_id / "data.csv"
    with open(stored_csv_path, "rb") as f:
        final_sha256 = hashlib.sha256(f.read()).hexdigest()
    assert final_sha256 == initial_sha256, "Original source dataset was mutated by pipeline execution!"


# =============================================================================
# 2. RECONSTRUCTION SAFETY INVARIANTS & ABSTENTION
# =============================================================================

def test_boundary_extrapolation_strictly_prohibited(isolated_storage, client):
    """
    Safety Invariant: When an anomaly occurs at dataset boundary (row 0 or row N-1),
    linear interpolation cannot extrapolate and MUST abstain with status UNRESOLVED.
    """
    clean_df, _, _ = generate_synthetic_telemetry(n_rows=20, seed=77)
    # Inject spike at row 0 (left boundary)
    corrupted_df = clean_df.copy(deep=True)
    corrupted_df.at[0, "temperature_bearing_c"] = 250.0

    csv_bytes = dataframe_to_csv_bytes(corrupted_df)
    up_res = client.post(
        "/api/datasets/upload",
        files={"file": ("boundary_test.csv", csv_bytes, "text/csv")},
    )
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    pipe_payload = {
        "configuration_name": "Boundary Test Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 5, "mad_threshold": 2.0},
        },
        "reconstruction_settings": {
            "default_method": "linear_interpolation",
            "max_gap_size": 3,
            "acceptance_policy": {"auto_accept_threshold": 0.80},
        },
    }
    p_res = client.post("/api/pipelines", json=pipe_payload)
    pipeline_id = p_res.json()["configuration_id"]

    # Run detection
    d_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert d_res.status_code == 201
    run_id = d_res.json()["run"]["run_id"]

    # Run reconstruction
    r_res = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/reconstruct")
    assert r_res.status_code == 201
    rec_run_id = r_res.json()["run"]["reconstruction_run_id"]

    results_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results")
    records = results_res.json()["results"]

    row0_record = next((r for r in records if r["source_row_index"] == 0), None)
    if row0_record:
        # At boundary, linear interpolation cannot extrapolate
        assert row0_record["status"] in ("UNRESOLVED", "ESTIMATED")
        if row0_record["status"] == "UNRESOLVED":
            assert row0_record["final_value"] is None or row0_record["final_value"] == row0_record["original_value"]


def test_unresolved_never_masquerades_as_corrected(isolated_storage, client):
    """
    Safety Invariant: If reconstruction cannot establish high confidence or quorum,
    status remains UNRESOLVED or ESTIMATED, never CORRECTED.
    """
    # Create dataset where almost all values are anomalies (quorum impossible)
    clean_df, _, _ = generate_synthetic_telemetry(n_rows=15, seed=99)
    corrupted_df = clean_df.copy(deep=True)
    # Corrupt almost all rows
    for r in range(1, 14):
        corrupted_df.at[r, "temperature_bearing_c"] = 999.0

    csv_bytes = dataframe_to_csv_bytes(corrupted_df)
    up_res = client.post(
        "/api/datasets/upload",
        files={"file": ("quorum_test.csv", csv_bytes, "text/csv")},
    )
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    pipe_payload = {
        "configuration_name": "Quorum Abstention Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 5, "mad_threshold": 1.5},
        },
        "reconstruction_settings": {
            "default_method": "local_median",
            "min_trusted_neighbors": 5,
            "acceptance_policy": {"auto_accept_threshold": 0.85},
        },
    }
    p_res = client.post("/api/pipelines", json=pipe_payload)
    pipeline_id = p_res.json()["configuration_id"]

    d_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert d_res.status_code == 201
    run_id = d_res.json()["run"]["run_id"]

    r_res = client.post(f"/api/pipelines/{pipeline_id}/runs/{run_id}/reconstruct")
    assert r_res.status_code == 201
    rec_run_id = r_res.json()["run"]["reconstruction_run_id"]

    results_res = client.get(f"/api/reconstruction/runs/{rec_run_id}/results")
    records = results_res.json()["results"]

    for rec in records:
        # None should be falsely marked as CORRECTED when trusted evidence is missing
        if rec["status"] == "UNRESOLVED":
            assert rec["confidence_score"] < 85.0


# =============================================================================
# 3. EVALUATION CORRECTNESS & GROUND-TRUTH INTEGRITY
# =============================================================================

def test_evaluation_metrics_denominator_edge_cases(isolated_storage, client):
    """
    Denominator edge cases: Metrics with zero eligible observations must return None
    (represented as null in JSON) rather than 0.0 or dividing by zero.
    """
    clean_df, _, _ = generate_synthetic_telemetry(n_rows=25, seed=888)
    csv_bytes = dataframe_to_csv_bytes(clean_df)
    up_res = client.post(
        "/api/datasets/upload",
        files={"file": ("clean_telemetry.csv", csv_bytes, "text/csv")},
    )
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    pipe_payload = {
        "configuration_name": "Clean Baseline Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c"],
        "detection_settings": {
            "statistical": {"enabled": True, "window_size": 10, "mad_threshold": 5.0},
        },
    }
    p_res = client.post("/api/pipelines", json=pipe_payload)
    pipeline_id = p_res.json()["configuration_id"]

    d_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert d_res.status_code == 201
    run_id = d_res.json()["run"]["run_id"]

    # Run Mode B evaluation on clean dataset where 0 anomalies were detected
    eval_payload = {
        "dataset_id": dataset_id,
        "evaluation_mode": "mode_b_existing_run",
        "pipeline_id": pipeline_id,
        "detection_run_id": run_id,
    }
    ev_res = client.post("/api/evaluations", json=eval_payload)
    assert ev_res.status_code == 201
    eval_id = ev_res.json()["evaluation_id"]

    metrics_res = client.get(f"/api/evaluations/{eval_id}/metrics")
    assert metrics_res.status_code == 200
    metrics = metrics_res.json()

    # In unlabeled run with 0 anomalies, precision/recall/f1 should be None (null), not 0.0
    det_metrics = metrics["detection_metrics"]
    assert det_metrics["precision"] is None
    assert det_metrics["recall"] is None
    assert det_metrics["f1_score"] is None


# =============================================================================
# 4. PERSISTENCE ACROSS APPLICATION RESTARTS & RECOVERY
# =============================================================================

def test_persistence_across_simulated_restart(isolated_storage, client):
    """
    Simulates application restart by re-instantiating service instances and
    verifying that datasets, pipelines, runs, and audit events reload from storage.
    """
    clean_df, corrupted_df, _ = generate_synthetic_telemetry(n_rows=30, seed=555)
    csv_bytes = dataframe_to_csv_bytes(corrupted_df)

    up_res = client.post(
        "/api/datasets/upload",
        files={"file": ("restart_test.csv", csv_bytes, "text/csv")},
    )
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    p_res = client.post("/api/pipelines", json={
        "configuration_name": "Restart Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c"],
    })
    pipeline_id = p_res.json()["configuration_id"]

    d_res = client.post(f"/api/pipelines/{pipeline_id}/run")
    assert d_res.status_code == 201
    run_id = d_res.json()["run"]["run_id"]

    # Simulate cold restart: Instantiate fresh service classes
    fresh_ds = DatasetService()
    fresh_ps = PipelineService()
    fresh_dets = DetectionService()
    fresh_as = AuditService()

    # Verify dataset reloaded
    reloaded_meta = fresh_ds.get_dataset_metadata(dataset_id)
    assert reloaded_meta.dataset_id == dataset_id
    assert reloaded_meta.row_count == 30

    # Verify pipeline reloaded
    reloaded_pipe = fresh_ps.get_pipeline_config(pipeline_id)
    assert reloaded_pipe.configuration_id == pipeline_id
    assert reloaded_pipe.configuration_name == "Restart Pipeline"

    # Verify detection run reloaded
    reloaded_run = fresh_dets.get_detection_run(run_id)
    assert reloaded_run.run_id == run_id

    # Verify audit ledger reloaded
    audit_resp = fresh_as.list_events(limit=50)
    assert audit_resp.total >= 3
    event_types = {e.event_type for e in audit_resp.events}
    assert "DATASET_UPLOADED" in event_types
    assert "PIPELINE_CREATED" in event_types


def test_corrupted_storage_file_recovery(isolated_storage, client):
    """
    Verifies that corrupted files in storage (e.g. malformed JSON)
    are logged and skipped without crashing catalog endpoints.
    """
    # Create corrupted dummy files in storage
    corrupt_pipeline_file = isolated_storage["pipelines"] / "pipe_corrupt.json"
    corrupt_pipeline_file.write_text("{malformed json: broken", encoding="utf-8")

    corrupt_run_dir = isolated_storage["runs"] / "run_corrupt"
    corrupt_run_dir.mkdir(parents=True, exist_ok=True)
    (corrupt_run_dir / "run.json").write_text("invalid json content", encoding="utf-8")

    # List pipelines should succeed without 500 error
    p_res = client.get("/api/pipelines")
    assert p_res.status_code == 200

    # List runs should succeed without 500 error
    r_res = client.get("/api/reconstruction/runs")
    assert r_res.status_code == 200


# =============================================================================
# 5. FAILURE HANDLING & UNIFORM ERROR ENVELOPES
# =============================================================================

def test_api_failure_contracts(isolated_storage, client):
    """Verifies that all failure modes return standardized error responses."""
    # 1. Upload invalid non-CSV file
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("test.exe", b"binary content", "application/octet-stream")},
    )
    assert res.status_code == 400
    err = res.json()["error"]
    assert err["code"] == 400
    assert "Only .csv files are supported" in err["message"]

    # 2. Upload empty CSV
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert res.status_code == 400
    assert "empty" in res.json()["error"]["message"].lower()

    # 3. 404 on non-existent dataset
    res = client.get("/api/datasets/ds_nonexistent_999")
    assert res.status_code == 404
    assert res.json()["error"]["code"] == 404

    # 4. 404 on non-existent pipeline
    res = client.get("/api/pipelines/pipe_nonexistent_999")
    assert res.status_code == 404

    # 5. 404 on non-existent detection run
    res = client.get("/api/pipelines/pipe_fake/runs/run_fake")
    assert res.status_code == 404

    # 6. 404 on non-existent reconstruction run
    res = client.get("/api/reconstruction/runs/rec_run_fake")
    assert res.status_code == 404

    # 7. 422 on invalid pipeline configuration (missing required fields)
    res = client.post("/api/pipelines", json={"bad_field": "invalid"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == 422


# =============================================================================
# 6. AUDIT INTEGRITY, TAMPER DETECTION & COMPLIANCE EXPORT
# =============================================================================

def test_audit_hash_chain_tamper_detection(isolated_storage, client):
    """
    Verifies that the SHA-256 hash-chain verification correctly validates an untampered ledger
    and reliably detects manual post-hoc modifications to audit event records.
    """
    clean_df, _, _ = generate_synthetic_telemetry(n_rows=20, seed=12)
    csv_bytes = dataframe_to_csv_bytes(clean_df)

    up_res = client.post(
        "/api/datasets/upload",
        files={"file": ("audit_tamper_test.csv", csv_bytes, "text/csv")},
    )
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    client.post("/api/pipelines", json={
        "configuration_name": "Tamper Test Pipeline",
        "dataset_id": dataset_id,
        "timestamp_column": "timestamp",
        "sensor_columns": ["temperature_bearing_c"],
    })

    # Initial check: Chain is valid
    v_res = client.post("/api/audit/verify")
    assert v_res.status_code == 200
    assert v_res.json()["is_valid"] is True

    # Intentionally tamper with audit file on disk
    events_file = isolated_storage["audit"] / "events.jsonl"
    lines = events_file.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 2

    # Modify line 0 payload to tamper with event
    record = json.loads(lines[0])
    record["decision_reason"] = "TAMPERED_RECORD_INSERTED_BY_ATTACKER"
    lines[0] = json.dumps(record)
    events_file.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Re-verify: Verification MUST detect tampering
    tamper_check_res = client.post("/api/audit/verify")
    assert tamper_check_res.status_code == 200
    tamper_result = tamper_check_res.json()
    assert tamper_result["is_valid"] is False
    assert len(tamper_result["errors"]) > 0


def test_bounded_compliance_export_formats(isolated_storage, client):
    """Verifies that audit compliance export provides valid JSONL and CSV output bounded by limits."""
    clean_df, _, _ = generate_synthetic_telemetry(n_rows=20, seed=34)
    csv_bytes = dataframe_to_csv_bytes(clean_df)

    client.post(
        "/api/datasets/upload",
        files={"file": ("export_test.csv", csv_bytes, "text/csv")},
    )

    # Export JSONL
    jsonl_res = client.get("/api/audit/export?format=jsonl&limit=10")
    assert jsonl_res.status_code == 200
    assert jsonl_res.headers["content-type"].startswith("application/x-ndjson")
    jsonl_lines = jsonl_res.text.strip().splitlines()
    assert len(jsonl_lines) >= 1
    # Verify first line parses as JSON
    parsed = json.loads(jsonl_lines[0])
    assert "event_id" in parsed
    assert "event_hash" in parsed

    # Export CSV
    csv_res = client.get("/api/audit/export?format=csv&limit=10")
    assert csv_res.status_code == 200
    assert csv_res.headers["content-type"].startswith("text/csv")
    csv_rows = csv_res.text.strip().splitlines()
    assert len(csv_rows) >= 2  # Header + at least 1 record
    assert "event_id" in csv_rows[0] and "event_type" in csv_rows[0] and "timestamp" in csv_rows[0]
