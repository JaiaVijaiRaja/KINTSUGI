import io
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_test_storage(tmp_path: Path, monkeypatch):
    """Ensure all tests use an isolated temporary storage directory."""
    test_storage = tmp_path / "test_datasets"
    test_storage.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "STORAGE_DIR", str(test_storage))
    yield test_storage


def test_1_successful_upload_valid_csv():
    """Verify that uploading a valid CSV returns 201 with metadata and quality metrics."""
    csv_content = (
        "timestamp,vibration_x,temperature,status\n"
        "2026-10-22T00:00:00Z,0.12,45.2,NORMAL\n"
        "2026-10-22T00:00:01Z,0.15,45.4,NORMAL\n"
        "2026-10-22T00:00:02Z,0.13,45.3,NORMAL\n"
    )
    response = client.post(
        "/api/datasets/upload",
        files={"file": ("test_sensor.csv", io.BytesIO(csv_content.encode("utf-8")), "text/csv")},
    )
    assert response.status_code == 201
    data = response.json()
    assert "metadata" in data
    assert "quality" in data

    meta = data["metadata"]
    assert meta["dataset_id"].startswith("ds_")
    assert meta["filename"] == "test_sensor.csv"
    assert meta["row_count"] == 3
    assert meta["column_count"] == 4
    assert meta["columns"] == ["timestamp", "vibration_x", "temperature", "status"]

    qual = data["quality"]
    assert qual["total_rows"] == 3
    assert qual["total_columns"] == 4
    assert qual["duplicate_rows_count"] == 0
    assert len(qual["columns"]) == 4

    # Timestamp candidate check
    assert len(qual["timestamp_candidates"]) >= 1
    ts_cand = qual["timestamp_candidates"][0]
    assert ts_cand["column_name"] == "timestamp"
    assert ts_cand["is_monotonic"] is True


def test_2_listing_uploaded_datasets():
    """Verify listing all uploaded datasets in storage."""
    csv1 = "timestamp,vibr\n2026-10-22T00:00:00Z,1.1\n"
    csv2 = "timestamp,temp\n2026-10-22T00:00:00Z,22.5\n"

    client.post("/api/datasets/upload", files={"file": ("d1.csv", io.BytesIO(csv1.encode()), "text/csv")})
    client.post("/api/datasets/upload", files={"file": ("d2.csv", io.BytesIO(csv2.encode()), "text/csv")})

    response = client.get("/api/datasets")
    assert response.status_code == 200
    data = response.json()
    assert "datasets" in data
    assert data["total"] >= 2
    filenames = [d["filename"] for d in data["datasets"]]
    assert "d1.csv" in filenames
    assert "d2.csv" in filenames


def test_3_retrieve_dataset_metadata():
    """Verify retrieving specific dataset metadata by ID."""
    csv = "time,press\n2026-10-22T00:00:00Z,101.3\n"
    up_res = client.post("/api/datasets/upload", files={"file": ("pressure.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert up_res.status_code == 201
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    res = client.get(f"/api/datasets/{dataset_id}")
    assert res.status_code == 200
    meta = res.json()
    assert meta["dataset_id"] == dataset_id
    assert meta["filename"] == "pressure.csv"
    assert meta["row_count"] == 1


def test_4_preview_actual_dataset_rows():
    """Verify preview returns actual row contents bounded by limit and offset."""
    csv_rows = ["timestamp,channel_a"]
    for i in range(10):
        csv_rows.append(f"2026-10-22T00:00:{i:02d}Z,{100 + i}")
    csv = "\n".join(csv_rows)

    up_res = client.post("/api/datasets/upload", files={"file": ("chunk.csv", io.BytesIO(csv.encode()), "text/csv")})
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    # Preview with limit 3, offset 2
    res = client.get(f"/api/datasets/{dataset_id}/preview?limit=3&offset=2")
    assert res.status_code == 200
    preview = res.json()
    assert preview["dataset_id"] == dataset_id
    assert preview["total_rows"] == 10
    assert preview["preview_rows"] == 3
    assert preview["offset"] == 2
    assert preview["rows"][0]["channel_a"] == 102
    assert preview["rows"][1]["channel_a"] == 103
    assert preview["rows"][2]["channel_a"] == 104


def test_5_correct_missing_value_counts():
    """Verify missing values are accurately counted per column."""
    csv = (
        "sensor_a,sensor_b,sensor_c\n"
        "10.5,,active\n"
        ",20.5,active\n"
        "NaN,22.0,\n"
        "12.0,null,None\n"
    )
    up_res = client.post("/api/datasets/upload", files={"file": ("missing.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert up_res.status_code == 201
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    qual_res = client.get(f"/api/datasets/{dataset_id}/quality")
    assert qual_res.status_code == 200
    qual = qual_res.json()

    cols_by_name = {c["name"]: c for c in qual["columns"]}
    assert cols_by_name["sensor_a"]["missing_count"] == 2  # row 2 empty, row 3 NaN
    assert cols_by_name["sensor_b"]["missing_count"] == 2  # row 1 empty, row 4 null
    assert cols_by_name["sensor_c"]["missing_count"] == 2  # row 3 empty, row 4 None


def test_6_correct_duplicate_row_counts():
    """Verify full duplicate row detection."""
    csv = (
        "sensor_1,sensor_2\n"
        "1.0,2.0\n"
        "1.0,2.0\n"
        "1.0,2.0\n"
        "3.0,4.0\n"
    )
    up_res = client.post("/api/datasets/upload", files={"file": ("dup.csv", io.BytesIO(csv.encode()), "text/csv")})
    assert up_res.status_code == 201
    qual = up_res.json()["quality"]
    assert qual["total_rows"] == 4
    assert qual["duplicate_rows_count"] == 2  # 2 duplicated occurrences of the first row
    assert qual["duplicate_rows_percentage"] == 50.0


def test_7_invalid_file_extension():
    """Verify non-.csv extensions are rejected with 400."""
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("dataset.json", io.BytesIO(b'{"key": "value"}'), "application/json")},
    )
    assert res.status_code == 400
    data = res.json()
    assert "Invalid file extension" in data["error"]["message"]


def test_8_empty_upload():
    """Verify empty 0-byte file is rejected with 400."""
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("empty.csv", io.BytesIO(b""), "text/csv")},
    )
    assert res.status_code == 400
    data = res.json()
    assert "empty" in data["error"]["message"].lower()


def test_9_malformed_csv():
    """Verify unparseable or inconsistent CSV content is rejected with 400."""
    broken_csv = b"col1,col2\nval1,val2,val3_unexpected_extra\n"
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("malformed.csv", io.BytesIO(broken_csv), "text/csv")},
    )
    assert res.status_code == 400
    assert "malformed csv" in res.json()["error"]["message"].lower()


def test_10_dataset_with_headers_but_no_data_rows():
    """Verify CSV with only headers and 0 data rows is rejected with 400."""
    header_only = "timestamp,vibration,temperature\n"
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("header_only.csv", io.BytesIO(header_only.encode()), "text/csv")},
    )
    assert res.status_code == 400
    data = res.json()
    assert "no data rows" in data["error"]["message"].lower()


def test_11_missing_or_unknown_dataset_id():
    """Verify unknown dataset ID returns 404 for metadata, preview, and quality."""
    res1 = client.get("/api/datasets/ds_unknown_999")
    assert res1.status_code == 404
    assert res1.json()["error"]["code"] == 404

    res2 = client.get("/api/datasets/ds_unknown_999/preview")
    assert res2.status_code == 404

    res3 = client.get("/api/datasets/ds_unknown_999/quality")
    assert res3.status_code == 404


def test_12_oversized_upload(monkeypatch):
    """Verify file exceeding size limit is rejected with 413."""
    # Set limit to 50 bytes
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 50)
    large_csv = "timestamp,sensor\n" + ("2026-10-22T00:00:00Z,100\n" * 10)
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("oversized.csv", io.BytesIO(large_csv.encode()), "text/csv")},
    )
    assert res.status_code == 413
    data = res.json()
    assert "exceeds maximum permitted limit" in data["error"]["message"].lower()


def test_13_preview_limits():
    """Verify preview limits are bounded properly."""
    csv_rows = ["idx,val"]
    for i in range(25):
        csv_rows.append(f"{i},{i*2}")
    csv = "\n".join(csv_rows)

    up_res = client.post("/api/datasets/upload", files={"file": ("limits.csv", io.BytesIO(csv.encode()), "text/csv")})
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    # Request limit larger than rows
    res = client.get(f"/api/datasets/{dataset_id}/preview?limit=100")
    assert res.status_code == 200
    assert res.json()["preview_rows"] == 25


def test_14_safe_handling_of_unusual_filenames():
    """Verify path traversal attempt in filename is sanitized and stored safely."""
    csv = "col1,col2\n1,2\n"
    dangerous_filename = "../../../etc/passwd.csv"

    up_res = client.post(
        "/api/datasets/upload",
        files={"file": (dangerous_filename, io.BytesIO(csv.encode()), "text/csv")},
    )
    assert up_res.status_code == 201
    meta = up_res.json()["metadata"]
    # Path traversal must be stripped to safe basename
    assert ".." not in meta["filename"]
    assert meta["filename"] == "passwd.csv"


def test_15_persistence_behavior(setup_test_storage: Path):
    """Verify files and metadata persist in the designated storage folder."""
    csv = "timestamp,val\n2026-10-22T00:00:00Z,99\n"
    up_res = client.post("/api/datasets/upload", files={"file": ("persist.csv", io.BytesIO(csv.encode()), "text/csv")})
    dataset_id = up_res.json()["metadata"]["dataset_id"]

    # Verify physical files exist on disk
    dataset_dir = setup_test_storage / dataset_id
    assert dataset_dir.is_dir()
    assert (dataset_dir / "data.csv").is_file()
    assert (dataset_dir / "metadata.json").is_file()
    assert (dataset_dir / "quality.json").is_file()


def test_16_duplicate_column_headers_rejected():
    """Verify duplicate column headers are rejected with 400."""
    csv = "sensor_x,sensor_x\n1,2\n"
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("dup_headers.csv", io.BytesIO(csv.encode()), "text/csv")},
    )
    assert res.status_code == 400
    assert "duplicate column headers" in res.json()["error"]["message"].lower()


def test_17_empty_column_name_rejected():
    """Verify empty or whitespace column headers are rejected with 400."""
    csv = "timestamp, ,sensor_1\n2026-10-22,1,2\n"
    res = client.post(
        "/api/datasets/upload",
        files={"file": ("empty_header.csv", io.BytesIO(csv.encode()), "text/csv")},
    )
    assert res.status_code == 400
    assert "empty" in res.json()["error"]["message"].lower()
