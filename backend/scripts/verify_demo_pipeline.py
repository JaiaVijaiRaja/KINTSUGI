"""
Verification and Test Runner for KINTSUGI Demo Datasets:
- Dataset A: demo_data/industrial_recoverable_faults.csv
- Dataset B: demo_data/industrial_ambiguous_faults.csv

Executes the REAL backend pipeline from ingestion to export and produces:
- demo_data/verification_results.json (machine-readable)
- Console report with exact metrics, checks passed/failed, and safety invariants.
"""

import json
import sys
import io
from pathlib import Path
from typing import Any, Dict, List

# Ensure backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))

import pandas as pd
from app.services.dataset_service import dataset_service, get_storage_path
from app.services.pipeline_service import pipeline_service
from app.services.detection_service import detection_service
from app.services.reconstruction_service import reconstruction_service
from app.services.audit_service import audit_service
from app.services.evaluation_service import evaluation_service
from app.schemas.pipeline import (
    PipelineConfigCreate,
    DetectionSettings,
    StatisticalDetectorSettings,
    IsolationForestSettings,
    ReconstructionSettings,
    ConfidencePolicy,
)
from app.schemas.evaluation import CreateEvaluationRequest


def run_verification() -> Dict[str, Any]:
    repo_dir = backend_dir.parent
    demo_data_dir = repo_dir / "demo_data"

    print("========================================================================")
    print(" KINTSUGI — End-to-End Demonstration Pipeline Verification")
    print("========================================================================")

    results: Dict[str, Any] = {
        "status": "passed",
        "datasets": {},
        "summary": {
            "total_checks": 0,
            "passed_checks": 0,
            "failed_checks": 0,
        },
    }

    # =========================================================================
    # PART 1: Dataset A — Recoverable Faults
    # =========================================================================
    print("\n>>> Verifying Dataset A: industrial_recoverable_faults.csv...")
    file_a = demo_data_dir / "industrial_recoverable_faults.csv"
    assert file_a.exists(), f"Missing {file_a}"

    with open(file_a, "rb") as f:
        bytes_a = f.read()

    import hashlib
    raw_sha256_initial = hashlib.sha256(bytes_a).hexdigest()
    ds_a = dataset_service.ingest_dataset_bytes(bytes_a, "industrial_recoverable_faults.csv")
    ds_a_id = ds_a.metadata.dataset_id
    print(f"  [OK] Ingested: ID={ds_a_id}, Rows={ds_a.metadata.row_count}, SHA256={raw_sha256_initial[:12]}...")

    checks_a = []

    def check(name: str, passed: bool, details: str = ""):
        results["summary"]["total_checks"] += 1
        if passed:
            results["summary"]["passed_checks"] += 1
            print(f"    [PASS] {name} {details}")
        else:
            results["summary"]["failed_checks"] += 1
            results["status"] = "failed"
            print(f"    [FAIL] {name} {details}")
        checks_a.append({"check": name, "passed": passed, "details": details})

    check("Row count matches", ds_a.metadata.row_count == 60, f"Got {ds_a.metadata.row_count}")
    check("Columns validated", len(ds_a.metadata.columns) == 5, f"Columns: {ds_a.metadata.columns}")

    # 2. Pipeline Configuration
    pipe_a_config = PipelineConfigCreate(
        configuration_name="Verification Pipeline A - Recoverable",
        dataset_id=ds_a_id,
        timestamp_column="timestamp",
        sensor_columns=["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        ignored_columns=["ambient_temp_c"],
        detection_settings=DetectionSettings(
            statistical=StatisticalDetectorSettings(
                enabled=True, window_size=15, mad_threshold=3.0, min_observations=10
            ),
            isolation_forest=IsolationForestSettings(
                enabled=True, contamination=0.05, random_seed=42, min_observations=50
            ),
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
    pipe_a = pipeline_service.create_pipeline_config(pipe_a_config)
    check("Pipeline registered", pipe_a.configuration_id.startswith("pipe_"), pipe_a.configuration_id)

    # 3. Detection
    det_a = detection_service.execute_detection_run(pipe_a.configuration_id)
    det_a_id = det_a.run_id
    anom_count_a = det_a.summary.total_anomalies_detected
    check("Anomalies detected", anom_count_a > 0, f"Detected: {anom_count_a}")

    # 4. Reconstruction
    rec_a_res = reconstruction_service.execute_reconstruction_run(pipe_a.configuration_id, det_a_id)
    rec_a_id = rec_a_res.run.reconstruction_run_id
    summary_a = rec_a_res.run.summary
    print(f"  [OK] Reconstruction: Corrected={summary_a.corrected_count}, Estimated={summary_a.estimated_count}, Unresolved={summary_a.unresolved_count}")

    check("Spikes corrected", summary_a.corrected_count >= 1, f"Corrected: {summary_a.corrected_count}")
    check("Boundary abstained (UNRESOLVED)", summary_a.unresolved_count >= 1, f"Unresolved: {summary_a.unresolved_count}")

    # Inspect records
    results_a_page = reconstruction_service.get_reconstruction_results(rec_a_id, limit=100)
    records_a = results_a_page.results

    # Find Row 12 (thermal spike)
    row12 = next((r for r in records_a if r.source_row_index == 12 and r.sensor_column == "temperature_bearing_c"), None)
    if row12:
        check(
            "Row 12 Thermal Spike Reconstructed",
            row12.status == "CORRECTED" and row12.final_value < 75.0,
            f"Original={row12.original_value}°C -> Final={row12.final_value}°C, Confidence={row12.confidence_score}",
        )
    else:
        check("Row 12 Thermal Spike Found", False, "Not flagged or reconstructed")

    # Find Row 0 (boundary vibration)
    row0 = next((r for r in records_a if r.source_row_index == 0), None)
    if row0:
        check(
            "Row 0 Boundary Abstention",
            row0.status == "UNRESOLVED",
            f"Status={row0.status}, Reason={row0.abstention_reason}",
        )
    else:
        check("Row 0 Boundary Found", False, "Not present in records")

    # 5. Raw Data Immutability Check
    raw_file_a = get_storage_path() / ds_a_id / "data.csv"
    with open(raw_file_a, "rb") as f:
        bytes_after = f.read()
    import hashlib
    sha_after = hashlib.sha256(bytes_after).hexdigest()
    check("Raw dataset unchanged (Immutability)", sha_after == raw_sha256_initial, f"SHA256 intact: {sha_after[:12]}")

    # 6. Export Test
    export_a_csv, media_type_a = reconstruction_service.export_reconstructed_dataset(rec_a_id, "csv")
    df_exported_a = pd.read_csv(io.StringIO(export_a_csv))
    check("Export contains 60 rows", len(df_exported_a) == 60, f"Rows: {len(df_exported_a)}")
    check("Export contains repaired columns", "temperature_bearing_c_repaired" in df_exported_a.columns)
    check("Export contains status columns", "temperature_bearing_c_status" in df_exported_a.columns)

    results["datasets"]["dataset_a_recoverable"] = {
        "dataset_id": ds_a_id,
        "pipeline_id": pipe_a.configuration_id,
        "detection_run_id": det_a_id,
        "reconstruction_run_id": rec_a_id,
        "summary": summary_a.model_dump(),
        "checks": checks_a,
    }

    # =========================================================================
    # PART 2: Dataset B — Ambiguous Faults & Strict Abstention
    # =========================================================================
    print("\n>>> Verifying Dataset B: industrial_ambiguous_faults.csv...")
    file_b = demo_data_dir / "industrial_ambiguous_faults.csv"
    assert file_b.exists(), f"Missing {file_b}"

    with open(file_b, "rb") as f:
        bytes_b = f.read()

    # 1. Ingest
    raw_sha256_b = hashlib.sha256(bytes_b).hexdigest()
    ds_b = dataset_service.ingest_dataset_bytes(bytes_b, "industrial_ambiguous_faults.csv")
    ds_b_id = ds_b.metadata.dataset_id
    print(f"  [OK] Ingested: ID={ds_b_id}, Rows={ds_b.metadata.row_count}, SHA256={raw_sha256_b[:12]}...")

    checks_b = []

    def check_b(name: str, passed: bool, details: str = ""):
        results["summary"]["total_checks"] += 1
        if passed:
            results["summary"]["passed_checks"] += 1
            print(f"    [PASS] {name} {details}")
        else:
            results["summary"]["failed_checks"] += 1
            results["status"] = "failed"
            print(f"    [FAIL] {name} {details}")
        checks_b.append({"check": name, "passed": passed, "details": details})

    # 2. Pipeline Configuration
    pipe_b_config = PipelineConfigCreate(
        configuration_name="Verification Pipeline B - Ambiguous",
        dataset_id=ds_b_id,
        timestamp_column="timestamp",
        sensor_columns=["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        ignored_columns=["ambient_temp_c"],
        detection_settings=DetectionSettings(
            statistical=StatisticalDetectorSettings(
                enabled=True, window_size=15, mad_threshold=3.0, min_observations=10
            ),
            isolation_forest=IsolationForestSettings(
                enabled=True, contamination=0.05, random_seed=42, min_observations=50
            ),
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
    pipe_b = pipeline_service.create_pipeline_config(pipe_b_config)

    # 3. Detection
    det_b = detection_service.execute_detection_run(pipe_b.configuration_id)
    det_b_id = det_b.run_id

    # 4. Reconstruction
    rec_b_res = reconstruction_service.execute_reconstruction_run(pipe_b.configuration_id, det_b_id)
    rec_b_id = rec_b_res.run.reconstruction_run_id
    summary_b = rec_b_res.run.summary
    print(f"  [OK] Reconstruction: Corrected={summary_b.corrected_count}, Estimated={summary_b.estimated_count}, Unresolved={summary_b.unresolved_count}")

    check_b("Strict Abstentions Enforced", summary_b.unresolved_count > 0, f"Unresolved Count: {summary_b.unresolved_count}")

    # Inspect records for specific abstentions
    records_b = reconstruction_service.get_reconstruction_results(rec_b_id, limit=100).results

    # Check 1: Exceeded gap abstention (Rows 15 to 22)
    gap_records = [r for r in records_b if r.source_row_index in range(15, 23) and r.sensor_column == "temperature_bearing_c"]
    all_gap_unresolved = len(gap_records) > 0 and all(r.status == "UNRESOLVED" for r in gap_records)
    check_b("Continuous Blackout (> 5 rows) Abstained", all_gap_unresolved, f"Found {len(gap_records)} records, all UNRESOLVED={all_gap_unresolved}")

    # Check 2: Boundary NaN (Row 0)
    row0_b = next((r for r in records_b if r.source_row_index == 0), None)
    check_b("Boundary NaN Abstained", row0_b is not None and row0_b.status == "UNRESOLVED", f"Row 0 status={getattr(row0_b, 'status', None)}")

    # Check 3: Raw Data Immutability for Dataset B
    raw_file_b = get_storage_path() / ds_b_id / "data.csv"
    with open(raw_file_b, "rb") as f:
        bytes_after_b = f.read()
    sha_after_b = hashlib.sha256(bytes_after_b).hexdigest()
    check_b("Dataset B Immutability Verified", sha_after_b == raw_sha256_b, f"SHA256 intact: {sha_after_b[:12]}")

    # Check 4: Export Test for Dataset B
    export_b_csv, media_type_b = reconstruction_service.export_reconstructed_dataset(rec_b_id, "csv")
    df_exported_b = pd.read_csv(io.StringIO(export_b_csv))
    check_b("Export contains 60 rows", len(df_exported_b) == 60, f"Rows: {len(df_exported_b)}")
    check_b("Export contains status columns", "temperature_bearing_c_status" in df_exported_b.columns)

    results["datasets"]["dataset_b_ambiguous"] = {
        "dataset_id": ds_b_id,
        "pipeline_id": pipe_b.configuration_id,
        "detection_run_id": det_b_id,
        "reconstruction_run_id": rec_b_id,
        "summary": summary_b.model_dump(),
        "checks": checks_b,
    }

    # =========================================================================
    # PART 3: Cryptographic Audit Hash-Chain Verification
    # =========================================================================
    print("\n>>> Verifying Append-Only SHA-256 Audit Trail...")
    audit_verification = audit_service.verify_hash_chain()
    check("Audit Hash Chain Continuous & Valid", audit_verification.is_valid, f"Events checked={audit_verification.total_events_checked}")

    # Write output JSON
    output_path = demo_data_dir / "verification_results.json"
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)

    print("\n========================================================================")
    print(f" Summary: {results['summary']['passed_checks']} / {results['summary']['total_checks']} checks passed. Status: {results['status'].upper()}")
    print(f" Machine-readable report saved to: {output_path.name}")
    print("========================================================================")

    return results


if __name__ == "__main__":
    res = run_verification()
    if res["status"] != "passed":
        sys.exit(1)
