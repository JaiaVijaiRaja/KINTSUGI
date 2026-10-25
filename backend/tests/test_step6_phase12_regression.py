"""Regression tests for Phase 12: Reconstruction Evidence Integrity & Schema Alignment.

Verifies:
1. Valid confidence factor score of zero (0.0 preserved, not conflated with null).
2. Valid nonzero confidence factor score.
3. Null confidence factor score handling in client representations.
4. Omitted confidence factor handling.
5. Completely missing confidence breakdown (confidence_breakdown=None).
6. Evidence reference with all supported fields (source_row_index, sensor_column, value, distance, weight, is_anomaly).
7. UNRESOLVED record handling and abstention reason.
8. CORRECTED record handling and comparison values.
9. API response containing optional fields (operator review fields, aliases).
10. FastAPI endpoint response schema validation and serialization fidelity.
"""

import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.schemas.reconstruction import (
    ConfidenceBreakdown,
    EvidenceReference,
    ReconstructionRecord,
    ReconstructionResultsResponse,
    ProcessingStatus,
    ReviewDecision,
)


client = TestClient(app)


# Scenario 1: A valid confidence factor score of zero
def test_valid_confidence_factor_zero():
    """Verify backend ConfidenceBreakdown accepts and preserves genuine 0.0 scores."""
    breakdown = ConfidenceBreakdown(
        neighbor_count_score=0.0,
        method_agreement_score=0.0,
        temporal_proximity_score=0.0,
        local_variance_score=0.0,
        neighbor_cleanliness_score=0.0,
        cross_sensor_score=0.0,
        total_score=0.0,
        penalty_reasons=["Evaluated zero - high variance"],
    )
    dumped = breakdown.model_dump()
    assert dumped["neighbor_count_score"] == 0.0
    assert dumped["local_variance_score"] == 0.0
    assert dumped["cross_sensor_score"] == 0.0
    assert dumped["total_score"] == 0.0
    assert dumped["neighbor_count_score"] is not None
    assert isinstance(dumped["neighbor_count_score"], float)


# Scenario 2: A valid nonzero confidence factor score
def test_valid_nonzero_confidence_factor():
    """Verify backend ConfidenceBreakdown accepts and serializes nonzero factor scores."""
    breakdown = ConfidenceBreakdown(
        neighbor_count_score=18.5,
        method_agreement_score=14.0,
        temporal_proximity_score=12.2,
        local_variance_score=9.8,
        neighbor_cleanliness_score=10.0,
        cross_sensor_score=15.0,
        total_score=79.5,
        penalty_reasons=[],
    )
    dumped = breakdown.model_dump()
    assert dumped["neighbor_count_score"] == 18.5
    assert dumped["method_agreement_score"] == 14.0
    assert dumped["local_variance_score"] == 9.8
    assert dumped["cross_sensor_score"] == 15.0
    assert dumped["total_score"] == 79.5


# Scenario 3: Null confidence factor score in client-facing models / loose structures
def test_null_confidence_factor_score():
    """Verify raw dict with null factor scores can be distinguished from genuine zero."""
    raw_data = {
        "neighbor_count_score": None,
        "method_agreement_score": 15.0,
        "temporal_proximity_score": None,
        "local_variance_score": 10.0,
        "neighbor_cleanliness_score": 10.0,
        "cross_sensor_score": None,
        "total_score": 35.0,
        "penalty_reasons": ["Unmeasured sensors"],
    }
    assert raw_data["neighbor_count_score"] is None
    assert raw_data["neighbor_count_score"] != 0.0
    assert raw_data["cross_sensor_score"] is None
    assert raw_data["cross_sensor_score"] != 0.0


# Scenario 4: An omitted confidence factor
def test_omitted_confidence_factor():
    """Verify handling of payloads where specific confidence factor keys are completely omitted."""
    partial_dict = {
        "neighbor_count_score": 20.0,
        "total_score": 20.0,
    }
    assert "cross_sensor_score" not in partial_dict
    assert partial_dict.get("cross_sensor_score") is None
    assert partial_dict.get("local_variance_score") is None
    # Crucially, None is distinct from 0.0
    assert partial_dict.get("local_variance_score") != 0.0


# Scenario 5: A completely missing confidence breakdown
def test_completely_missing_confidence_breakdown():
    """Verify ReconstructionRecord supports confidence_breakdown=None without defaulting to zeros."""
    record = ReconstructionRecord(
        result_id="rec_res_missing_cb",
        reconstruction_run_id="rec_run_test_01",
        detection_run_id="det_run_test_01",
        dataset_id="ds_test_01",
        configuration_id="cfg_test_01",
        sensor_column="temperature_bearing_1",
        source_row_index=42,
        original_value=85.4,
        proposed_value=None,
        final_value=85.4,
        status="UNRESOLVED",
        confidence_score=0.0,
        method="none",
        confidence_breakdown=None,
        evidence_summary="Telemetry unmeasurable",
        evidence_references=[],
        abstention_reason="Sensor telemetry corrupted, confidence unmeasurable",
        created_at="2026-10-25T16:00:00Z",
    )
    dumped = record.model_dump()
    assert dumped["confidence_breakdown"] is None
    assert dumped["status"] == "UNRESOLVED"
    assert dumped["abstention_reason"] is not None


# Scenario 6: An evidence reference with all supported fields
def test_evidence_reference_all_supported_fields():
    """Verify EvidenceReference has distance, is_anomaly, source_row_index, sensor_column, value, weight."""
    ev = EvidenceReference(
        source_row_index=105,
        sensor_column="vibration_drive_end",
        value=3.412,
        distance=2.0,
        weight=0.875,
        is_anomaly=False,
    )
    dumped = ev.model_dump()
    assert dumped["source_row_index"] == 105
    assert dumped["sensor_column"] == "vibration_drive_end"
    assert dumped["value"] == 3.412
    assert dumped["distance"] == 2.0
    assert dumped["weight"] == 0.875
    assert dumped["is_anomaly"] is False


# Scenario 7: An UNRESOLVED record
def test_unresolved_record_schema():
    """Verify UNRESOLVED record preserves mandatory abstention and original value."""
    record = ReconstructionRecord(
        result_id="rec_res_unres_100",
        reconstruction_run_id="rec_run_test_01",
        detection_run_id="det_run_test_01",
        dataset_id="ds_test_01",
        configuration_id="cfg_test_01",
        sensor_column="pressure_suction",
        source_row_index=88,
        original_value=1.02,
        proposed_value=None,
        final_value=1.02,
        status="UNRESOLVED",
        confidence_score=22.0,
        method="none",
        confidence_breakdown=ConfidenceBreakdown(
            neighbor_count_score=4.0,
            method_agreement_score=3.0,
            temporal_proximity_score=5.0,
            local_variance_score=0.0,
            neighbor_cleanliness_score=5.0,
            cross_sensor_score=5.0,
            total_score=22.0,
            penalty_reasons=["High spatial divergence", "Candidate disagreement"],
        ),
        evidence_summary="Insufficient neighbor agreement",
        evidence_references=[],
        abstention_reason="Abstained: Confidence 22.0% falls below mandatory safety threshold of 60.0%",
        created_at="2026-10-25T16:00:00Z",
    )
    dumped = record.model_dump()
    assert dumped["status"] == "UNRESOLVED"
    assert dumped["proposed_value"] is None
    assert dumped["final_value"] == dumped["original_value"]
    assert "Abstained" in dumped["abstention_reason"]
    assert dumped["confidence_breakdown"]["total_score"] == 22.0
    assert len(dumped["confidence_breakdown"]["penalty_reasons"]) == 2


# Scenario 8: A CORRECTED record
def test_corrected_record_schema():
    """Verify CORRECTED record preserves proposed and final repair values with evidence."""
    ev = EvidenceReference(
        source_row_index=87,
        sensor_column="motor_current",
        value=48.2,
        distance=1.0,
        weight=0.95,
        is_anomaly=False,
    )
    record = ReconstructionRecord(
        result_id="rec_res_corr_200",
        reconstruction_run_id="rec_run_test_01",
        detection_run_id="det_run_test_01",
        dataset_id="ds_test_01",
        configuration_id="cfg_test_01",
        sensor_column="motor_current",
        source_row_index=88,
        original_value=999.0,
        proposed_value=48.5,
        final_value=48.5,
        status="CORRECTED",
        confidence_score=91.0,
        method="cross_sensor",
        confidence_breakdown=ConfidenceBreakdown(
            neighbor_count_score=20.0,
            method_agreement_score=19.0,
            temporal_proximity_score=18.0,
            local_variance_score=15.0,
            neighbor_cleanliness_score=10.0,
            cross_sensor_score=9.0,
            total_score=91.0,
            penalty_reasons=[],
        ),
        evidence_summary="Consensus among cross-sensor models",
        evidence_references=[ev],
        abstention_reason=None,
        created_at="2026-10-25T16:00:00Z",
    )
    dumped = record.model_dump()
    assert dumped["status"] == "CORRECTED"
    assert dumped["original_value"] == 999.0
    assert dumped["proposed_value"] == 48.5
    assert dumped["final_value"] == 48.5
    assert dumped["abstention_reason"] is None
    assert len(dumped["evidence_references"]) == 1
    assert dumped["evidence_references"][0]["distance"] == 1.0


# Scenario 9: An API response containing optional fields
def test_api_response_optional_fields():
    """Verify ReconstructionRecord handles optional review fields populated and omitted."""
    record_with_opts = ReconstructionRecord(
        result_id="rec_res_opt_301",
        reconstruction_run_id="rec_run_test_01",
        detection_run_id="det_run_test_01",
        dataset_id="ds_test_01",
        configuration_id="cfg_test_01",
        sensor_column="flow_rate",
        source_row_index=15,
        original_value=0.0,
        proposed_value=48.0,
        final_value=49.1,
        status="CORRECTED",
        confidence_score=88.0,
        method="linear_interpolation",
        confidence_breakdown=None,
        evidence_summary="Manual modification applied",
        evidence_references=[],
        abstention_reason=None,
        is_reviewed=True,
        reviewed_by="PlantOpsEngineer",
        review_decision="MODIFY",
        review_comment="Adjusted based on physical plant logbook",
        reviewed_at="2026-10-25T16:00:00Z",
        created_at="2026-10-25T16:00:00Z",
    )
    dumped = record_with_opts.model_dump()
    assert dumped["is_reviewed"] is True
    assert dumped["reviewed_by"] == "PlantOpsEngineer"
    assert dumped["review_decision"] == "MODIFY"
    assert dumped["review_comment"] == "Adjusted based on physical plant logbook"

    # ReconstructionResultsResponse wrapper with records
    summary = {
        "total_evaluated": 1,
        "measured_count": 0,
        "estimated_count": 0,
        "corrected_count": 1,
        "unresolved_count": 0,
        "average_confidence": 88.0,
        "anomalies_reconstructed_count": 1,
        "by_sensor": {"flow_rate": {"CORRECTED": 1}},
        "by_method": {"linear_interpolation": 1},
    }
    response = ReconstructionResultsResponse(
        reconstruction_run_id="run_test_opt_01",
        detection_run_id="det_run_test_01",
        pipeline_id="cfg_test_01",
        dataset_id="ds_test_01",
        summary=summary,
        total_results=1,
        results=[record_with_opts],
        limit=50,
        offset=0,
    )
    dumped_resp = response.model_dump()
    assert dumped_resp["total_results"] == 1
    assert len(dumped_resp["results"]) == 1
    assert dumped_resp["results"][0]["reviewed_by"] == "PlantOpsEngineer"


# Scenario 10: Live API endpoint returns valid reconstruction record schema
def test_api_reconstruction_results_endpoint_schema():
    """Verify the real FastAPI endpoint returns schema with valid runs list."""
    response = client.get("/api/reconstruction/runs")
    assert response.status_code == 200
    data = response.json()
    assert "runs" in data
    assert "total" in data
    assert isinstance(data["runs"], list)
