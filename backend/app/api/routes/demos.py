"""
API routes for KINTSUGI Demonstration Scenarios (Demo 1 and Demo 2).
Provides metadata, scenarios documentation, ground truth manifests, and error simulation.
"""

import json
from pathlib import Path
from typing import Any, Dict, List
from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/demos", tags=["Demonstrations"])


class DemoScenarioInfo(BaseModel):
    demo_id: str
    title: str
    scenario_type: str
    description: str
    dataset_file: str
    row_count: int
    sensor_columns: List[str]
    timestamp_column: str
    fault_scenarios: List[Dict[str, Any]]
    expected_outcomes: Dict[str, Any]


class ErrorValidationRequest(BaseModel):
    error_type: str = Field(
        ...,
        description="'unsupported_file' | 'empty_file' | 'malformed_csv' | 'invalid_sensor' | 'exceeded_gap'",
    )


class ErrorValidationResponse(BaseModel):
    error_type: str
    status_code: int
    user_message: str
    technical_code: str
    data_preserved: bool


def get_demo_dir() -> Path:
    cwd = Path.cwd()
    if (cwd / "demo").is_dir():
        return cwd / "demo"
    elif (cwd.parent / "demo").is_dir():
        return cwd.parent / "demo"
    return Path(__file__).resolve().parent.parent.parent.parent / "demo"


DEMO_CATALOG: Dict[str, Dict[str, Any]] = {
    "demo1": {
        "demo_id": "demo1",
        "title": "Demo 1: Self-Healing Industrial Sensor Data",
        "scenario_type": "Industrial Gas Turbine Telemetry (Nominal, Spike, Missing, Boundary Abstention)",
        "description": (
            "Demonstrates end-to-end KINTSUGI processing on realistic turbine telemetry containing "
            "controlled valid observations, an impulse thermal spike, missing telemetry, frozen pressure, "
            "and a strict boundary abstention case where extrapolation is prohibited."
        ),
        "dataset_file": "turbine_telemetry_demo.csv",
        "row_count": 60,
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "timestamp_column": "timestamp",
        "fault_scenarios": [
            {
                "target": "vibration_drive_end_g",
                "row_index": 0,
                "fault": "Missing Reading at Boundary",
                "expected_status": "UNRESOLVED",
                "reason": "Boundary extrapolation is strictly prohibited by safety policy.",
            },
            {
                "target": "temperature_bearing_c",
                "row_index": 12,
                "fault": "Transient Spike (158.4°C vs nominal ~67°C)",
                "expected_status": "CORRECTED",
                "reason": "Successfully interpolated from valid temporal neighbors with high multi-factor confidence (~88/100).",
            },
            {
                "target": "vibration_drive_end_g",
                "row_index": 24,
                "fault": "Missing Reading (Packet Drop)",
                "expected_status": "ESTIMATED",
                "reason": "Reconstructed within acceptable gap limit; held for operator review if configured.",
            },
            {
                "target": "pressure_feed_bar",
                "row_index": 36,
                "fault": "Frozen Transducer (4.215 bar, 0 variance)",
                "expected_status": "CORRECTED",
                "reason": "Detected by multi-detector ensemble and reconstructed from dynamic temporal baseline.",
            },
        ],
        "expected_outcomes": {
            "total_observations": 60,
            "anomalies_detected": 8,
            "reconstructions_performed": 7,
            "abstentions_enforced": 1,
            "raw_data_preserved": True,
        },
    },
    "demo2": {
        "demo_id": "demo2",
        "title": "Demo 2: Trust, Abstention, Hard Cases & Evaluation",
        "scenario_type": "Stress Testing, Edge Cases, Strict Abstention & Ground Truth Benchmarking",
        "description": (
            "Demonstrates that KINTSUGI strictly abstains from guessing when evidence is insufficient, "
            "never invents unsupported replacements, benchmarks against isolated ground truth, and handles invalid inputs safely."
        ),
        "dataset_file": "difficult_cases_demo.csv",
        "row_count": 60,
        "sensor_columns": ["temperature_bearing_c", "vibration_drive_end_g", "pressure_feed_bar"],
        "timestamp_column": "timestamp",
        "fault_scenarios": [
            {
                "target": "vibration_drive_end_g",
                "row_index": 0,
                "fault": "Boundary Missing Reading",
                "expected_status": "UNRESOLVED",
                "reason": "No valid preceding observation; extrapolation strictly prohibited.",
            },
            {
                "target": "temperature_bearing_c",
                "row_index": 15,
                "fault": "Continuous Blackout (8 missing rows)",
                "expected_status": "UNRESOLVED",
                "reason": "Gap size (8 samples) exceeds maximum permitted gap limit (5 samples).",
            },
            {
                "target": "temperature_bearing_c",
                "row_index": 32,
                "fault": "Conflicting Cross-Sensor Anomaly (135°C)",
                "expected_status": "UNRESOLVED",
                "reason": "Corroborating sensors strongly contradict proposal; cross-sensor penalty triggers UNRESOLVED.",
            },
            {
                "target": "vibration_drive_end_g",
                "row_index": 45,
                "fault": "Sparse Readings (< 3 valid neighbors)",
                "expected_status": "UNRESOLVED",
                "reason": "Neighborhood lacks minimum required 3 valid finite observations.",
            },
            {
                "target": "pressure_feed_bar",
                "row_index": 50,
                "fault": "Constant Signal / Low Variance",
                "expected_status": "MEASURED",
                "reason": "Zero-MAD handled deterministically without divide-by-zero or false alarms.",
            },
        ],
        "expected_outcomes": {
            "total_observations": 60,
            "hard_case_abstentions": 11,
            "benchmark_mae_available": True,
            "raw_data_preserved": True,
        },
    },
}


@router.get(
    "",
    response_model=List[DemoScenarioInfo],
    summary="List Demonstration Scenarios",
    description="Retrieve metadata, sensor definitions, and documented scenarios for Demo 1 and Demo 2.",
)
def list_demos() -> List[DemoScenarioInfo]:
    return [DemoScenarioInfo(**d) for d in DEMO_CATALOG.values()]


@router.get(
    "/{demo_id}",
    response_model=DemoScenarioInfo,
    summary="Get Demonstration Scenario Details",
)
def get_demo(demo_id: str) -> DemoScenarioInfo:
    clean_id = demo_id.lower().strip()
    if clean_id not in DEMO_CATALOG:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Demonstration scenario '{demo_id}' not found. Available: 'demo1', 'demo2'.",
        )
    return DemoScenarioInfo(**DEMO_CATALOG[clean_id])


@router.get(
    "/{demo_id}/manifest",
    summary="Get Demo Ground Truth Manifest",
    description="Retrieve isolated reference ground truth manifest for evaluation comparison.",
)
def get_demo_manifest(demo_id: str) -> Dict[str, Any]:
    demo_dir = get_demo_dir()
    clean_id = demo_id.lower().strip()

    if clean_id in ["demo1", "turbine_telemetry"]:
        manifest_path = demo_dir / "ground_truth_manifest.json"
    elif clean_id in ["demo2", "difficult_cases"]:
        manifest_path = demo_dir / "difficult_cases_ground_truth.json"
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown demo manifest '{demo_id}'. Expected 'demo1' or 'demo2'.",
        )

    if not manifest_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Manifest file not found at {manifest_path}.",
        )

    with open(manifest_path, "r", encoding="utf-8") as f:
        return json.load(f)


@router.post(
    "/simulate-error",
    response_model=ErrorValidationResponse,
    summary="Simulate Backend Validation Error",
    description="Test that backend rejects invalid inputs safely with clear user messages without exposing secrets or tracebacks.",
)
def simulate_validation_error(payload: ErrorValidationRequest) -> ErrorValidationResponse:
    etype = payload.error_type.lower().strip()

    if etype == "unsupported_file":
        return ErrorValidationResponse(
            error_type="unsupported_file",
            status_code=400,
            user_message="Unable to process this file. Please upload a supported CSV file.",
            technical_code="INVALID_FILE_EXTENSION",
            data_preserved=True,
        )
    elif etype == "empty_file":
        return ErrorValidationResponse(
            error_type="empty_file",
            status_code=400,
            user_message="The uploaded file contains no readable data. Please choose a valid dataset.",
            technical_code="EMPTY_PAYLOAD_REJECTED",
            data_preserved=True,
        )
    elif etype == "malformed_csv":
        return ErrorValidationResponse(
            error_type="malformed_csv",
            status_code=400,
            user_message="We couldn't read this CSV file. Please check its formatting and try again.",
            technical_code="MALFORMED_CSV_SYNTAX",
            data_preserved=True,
        )
    elif etype == "invalid_sensor":
        return ErrorValidationResponse(
            error_type="invalid_sensor",
            status_code=422,
            user_message="The selected sensor column is not available in this dataset. Please select a valid column.",
            technical_code="UNRESOLVED_SENSOR_COLUMN",
            data_preserved=True,
        )
    elif etype == "exceeded_gap":
        return ErrorValidationResponse(
            error_type="exceeded_gap",
            status_code=200,
            user_message="There is not enough reliable evidence to reconstruct this value safely. The observation has been marked unresolved.",
            technical_code="ABSTENTION_GAP_EXCEEDED",
            data_preserved=True,
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown error simulation type '{payload.error_type}'.",
        )
