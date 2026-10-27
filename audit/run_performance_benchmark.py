import sys
import time
import os
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import json
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

def benchmark():
    demo1_path = ROOT / "demo_data" / "demo_1_industrial_recoverable_faults.csv"
    with open(demo1_path, "rb") as f:
        content = f.read()

    # 1. Ingestion Benchmark
    t0 = time.perf_counter()
    res = dataset_service.ingest_dataset_bytes(content, "bm_demo1.csv")
    t_ingest = (time.perf_counter() - t0) * 1000
    ds_id = res.metadata.dataset_id

    # 2. Pipeline Configuration
    t0 = time.perf_counter()
    pipe_create = PipelineConfigCreate(
        configuration_name="Benchmark Pipeline",
        description="Speed and memory benchmark",
        dataset_id=ds_id,
        timestamp_column="timestamp",
        sensor_columns=["TURBINE_TEMP_A", "PRESSURE_PSI_B", "VIBRATION_MM_S", "FLOW_RATE_L_MIN"],
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
    t_pipe = (time.perf_counter() - t0) * 1000

    # 3. Detection Benchmark
    t0 = time.perf_counter()
    det_run = detection_service.execute_detection_run(pipe.configuration_id)
    t_detect = (time.perf_counter() - t0) * 1000

    # 4. Reconstruction Benchmark
    t0 = time.perf_counter()
    rec_run_resp = reconstruction_service.execute_reconstruction_run(pipe.configuration_id, det_run.run_id)
    t_reconstruct = (time.perf_counter() - t0) * 1000

    # 5. Export Benchmark
    t0 = time.perf_counter()
    csv_export, _ = reconstruction_service.export_reconstructed_dataset(rec_run_resp.run.reconstruction_run_id, format_type="csv")
    t_export = (time.perf_counter() - t0) * 1000

    print(f"Ingest (240 rows): {t_ingest:.2f} ms")
    print(f"Pipeline Config: {t_pipe:.2f} ms")
    print(f"Detection (MAD + IF 4 sensors): {t_detect:.2f} ms")
    print(f"Reconstruction & Scoring: {t_reconstruct:.2f} ms")
    print(f"Export Generation: {t_export:.2f} ms")
    print(f"Total Pipeline Latency: {t_ingest + t_pipe + t_detect + t_reconstruct + t_export:.2f} ms")

    results = {
        "t_ingest_ms": t_ingest,
        "t_pipe_ms": t_pipe,
        "t_detect_ms": t_detect,
        "t_reconstruct_ms": t_reconstruct,
        "t_export_ms": t_export,
        "total_ms": t_ingest + t_pipe + t_detect + t_reconstruct + t_export
    }
    with open(ROOT / "audit" / "benchmark_results.json", "w") as f:
        json.dump(results, f, indent=2)

if __name__ == "__main__":
    benchmark()
