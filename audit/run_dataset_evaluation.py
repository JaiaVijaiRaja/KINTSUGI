import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import json
import numpy as np
import pandas as pd
from app.services.dataset_service import dataset_service
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

ROOT = Path(__file__).resolve().parent.parent

def evaluate_demo1():
    print("--- EVALUATING DEMO 1 (RECOVERABLE FAULTS) ---")
    demo1_path = ROOT / "demo_data" / "demo_1_industrial_recoverable_faults.csv"
    gt_manifest_path = ROOT / "demo_data" / "recoverable_ground_truth.json"
    clean_csv_path = ROOT / "demo_data" / "industrial_recoverable_clean.csv"

    with open(demo1_path, "rb") as f:
        content = f.read()

    with open(gt_manifest_path, "r") as f:
        gt_manifest = json.load(f)

    # Ingest
    res = dataset_service.ingest_dataset_bytes(content, "eval_demo_1.csv")
    ds_id = res.metadata.dataset_id

    # Pipeline
    pipe_create = PipelineConfigCreate(
        configuration_name="Eval Demo 1",
        description="Ground truth evaluation for Demo 1",
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
    det_results = detection_service.get_detection_run_results(det_run.run_id, limit=5000)
    rec_run_resp = reconstruction_service.execute_reconstruction_run(pipe.configuration_id, det_run.run_id)
    rec_run = rec_run_resp.run

    results = reconstruction_service.get_reconstruction_results(rec_run.reconstruction_run_id, limit=1000).results

    # Ground truth comparison:
    # In Demo 1, injected faults:
    # 1. Row 90 TURBINE_TEMP_A thermal spike (injected 94.5, nominal ~65.0)
    # 2. Rows 40-42 PRESSURE_PSI_B missing gap (size 3)
    # 3. Row 150 VIBRATION_MM_S spike (injected 18.2, nominal ~2.5)
    injected_fault_cells = [
        {"row": 90, "sensor": "TURBINE_TEMP_A", "type": "spike", "true_val": 65.2},
        {"row": 40, "sensor": "PRESSURE_PSI_B", "type": "missing", "true_val": 105.0},
        {"row": 41, "sensor": "PRESSURE_PSI_B", "type": "missing", "true_val": 105.1},
        {"row": 42, "sensor": "PRESSURE_PSI_B", "type": "missing", "true_val": 105.0},
        {"row": 150, "sensor": "VIBRATION_MM_S", "type": "spike", "true_val": 2.45},
    ]

    total_cells = 240 * 4
    tp = 0
    fp = 0
    fn = 0
    tn = 0

    detected_keys = {(a.source_row_index, a.sensor_column) for a in det_results.anomalies}
    injected_keys = {(f["row"], f["sensor"]) for f in injected_fault_cells}

    for r in range(240):
        for s in ["TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"]:
            is_injected = (r, s) in injected_keys
            is_detected = (r, s) in detected_keys

            if is_injected and is_detected:
                tp += 1
            elif not is_injected and is_detected:
                fp += 1
            elif is_injected and not is_detected:
                fn += 1
            else:
                tn += 1

    precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
    recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0

    print(f"Detection TP: {tp}, FP: {fp}, FN: {fn}, TN: {tn}")
    print(f"Precision: {precision:.4f}, Recall: {recall:.4f}, F1: {f1:.4f}")

    # Reconstruction Metrics
    abs_errors = []
    sq_errors = []
    reconstructed_count = 0
    unresolved_count = 0

    for res_item in results:
        if res_item.status == "CORRECTED":
            reconstructed_count += 1
            # Check if this was an injected cell with known ground truth
            for f in injected_fault_cells:
                if f["row"] == res_item.source_row_index and f["sensor"] == res_item.sensor_column:
                    err = abs(res_item.final_value - f["true_val"])
                    abs_errors.append(err)
                    sq_errors.append(err ** 2)
                    print(f"Cell ({f['row']}, {f['sensor']}): Reconstructed={res_item.final_value:.2f}, GroundTruth={f['true_val']:.2f}, AbsErr={err:.2f}, Confidence={res_item.confidence_score:.1f}%")
        elif res_item.status == "UNRESOLVED":
            unresolved_count += 1

    mae = np.mean(abs_errors) if abs_errors else 0.0
    rmse = np.sqrt(np.mean(sq_errors)) if sq_errors else 0.0
    print(f"Reconstructed Count: {reconstructed_count}, Unresolved Count: {unresolved_count}")
    print(f"Reconstruction MAE on Ground Truth: {mae:.4f}, RMSE: {rmse:.4f}")

    return {
        "dataset": "demo_1",
        "detection": {"tp": tp, "fp": fp, "fn": fn, "tn": tn, "precision": precision, "recall": recall, "f1": f1},
        "reconstruction": {"reconstructed": reconstructed_count, "unresolved": unresolved_count, "mae": mae, "rmse": rmse, "errors": abs_errors}
    }

def evaluate_demo2():
    print("\n--- EVALUATING DEMO 2 (AMBIGUOUS FAULTS & ABSTENTION) ---")
    demo2_path = ROOT / "demo_data" / "demo_2_industrial_ambiguous_faults.csv"

    with open(demo2_path, "rb") as f:
        content = f.read()

    res = dataset_service.ingest_dataset_bytes(content, "eval_demo_2.csv")
    ds_id = res.metadata.dataset_id

    pipe_create = PipelineConfigCreate(
        configuration_name="Eval Demo 2",
        description="Ground truth evaluation for Demo 2",
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

    results = reconstruction_service.get_reconstruction_results(rec_run.reconstruction_run_id, limit=1000).results

    # Demo 2 has:
    # 1. 10-sample gap in TURBINE_TEMP_A rows 55-64 (> max_gap_size=5 -> MUST ABSTAIN)
    # 2. Frozen sensor in PRESSURE_PSI_B rows 120-140 (MAD=0 or zero variance)
    # 3. Gradual drift in FLOW_RATE_L_MIN rows 180-210
    abstention_count = 0
    corrected_count = 0
    large_gap_abstentions = 0

    for r in results:
        if r.status == "UNRESOLVED":
            abstention_count += 1
            if r.sensor_column == "TURBINE_TEMP_A" and 55 <= r.source_row_index <= 64:
                large_gap_abstentions += 1
        elif r.status == "CORRECTED":
            corrected_count += 1

    print(f"Total Detected Anomalies: {det_run.summary.total_anomalies_detected}")
    print(f"Total Unresolved (Abstentions): {abstention_count}")
    print(f"Large Gap (Rows 55-64) Abstention Success: {large_gap_abstentions} / 10 cells")
    print(f"Total Corrected: {corrected_count}")

    return {
        "dataset": "demo_2",
        "total_anomalies": det_run.summary.total_anomalies_detected,
        "abstentions": abstention_count,
        "large_gap_abstentions": large_gap_abstentions,
        "corrected": corrected_count
    }

if __name__ == "__main__":
    r1 = evaluate_demo1()
    r2 = evaluate_demo2()
    with open("audit/evaluation_results.json", "w") as f:
        json.dump({"demo_1": r1, "demo_2": r2}, f, indent=2)
