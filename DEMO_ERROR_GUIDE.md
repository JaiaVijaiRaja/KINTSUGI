# KINTSUGI — Demonstration & Operational Error Guide

## 1. Overview & Security Philosophy

KINTSUGI enforces a strict **Zero-Leakage Error Policy**:
1. **No Stack Trace Exposure**: Python tracebacks, exception names, and internal stack frames are never returned in HTTP responses.
2. **No Path or Secret Leaks**: Absolute filesystem paths (`C:\...`, `/home/...`), internal tokens, database connection strings, and server environment variables are sanitized.
3. **Actionable Recovery Guidance**: Every error response provides a human-readable message and a safe next step for the industrial operator or data engineer.
4. **Data Non-Destruction**: Rejections and processing failures preserve all preexisting uploaded datasets and completed audit records.

---

## 2. Comprehensive Error Catalog

### 2.1 Upload & Ingestion Errors

| HTTP Status | Error Code | User-Facing Message | Likely Cause | Safe Recovery Action |
|:---:|:---:|:---|:---|:---|
| **400** | `UNSUPPORTED_MEDIA_TYPE` | *"Unable to process this file. Please upload a supported CSV file."* | User uploaded `.xlsx`, `.json`, `.parquet`, or binary file instead of CSV. | Save or export the industrial telemetry dataset as a standard comma-separated text file (`.csv`) and retry upload. |
| **400** | `FILE_TOO_LARGE` | *"This file exceeds the maximum permitted size. Please reduce the file size and try again."* | Uploaded file size exceeds the configured safety ceiling (e.g., $>50\text{ MB}$). | Downsample telemetry frequency or slice time interval into shorter segments before uploading. |
| **400** | `EMPTY_FILE` | *"The uploaded file contains no readable data. Please choose a valid dataset."* | File size is 0 bytes or contains only whitespace. | Verify file contents in a text editor to confirm data rows exist before uploading. |
| **422** | `MALFORMED_CSV` | *"We couldn't read this CSV file. Please check its formatting and try again."* | Inconsistent delimiters, unescaped quotes, or corrupted line endings. | Inspect CSV structure, ensure comma delimiter consistency, and re-export. |
| **422** | `MISSING_REQUIRED_COLUMNS` | *"The dataset is missing one or more required columns. Review the selected timestamp and sensor columns."* | The CSV does not contain the specified timestamp or sensor column headers. | Verify channel names in the dataset preview and adjust channel mappings in the pipeline configuration. |
| **422** | `EMPTY_DATASET` | *"No usable observations were found. Please check the dataset and upload it again."* | The file contains header row only, with 0 data observations. | Ensure the sensor stream contains at least one observation row. |

---

### 2.2 Validation & Configuration Errors

| HTTP Status | Error Code | User-Facing Message | Likely Cause | Safe Recovery Action |
|:---:|:---:|:---|:---|:---|
| **422** | `INVALID_SENSOR_SELECTION` | *"The selected sensor column is not available in this dataset. Please select a valid column."* | Pipeline configured with a sensor name that was dropped or renamed. | Reselect available channels from the validated column dropdown. |
| **422** | `INVALID_TIMESTAMPS` | *"The timestamp data could not be interpreted consistently. Please review the timestamp format."* | Non-chronological timestamps, unrecognized date formats, or non-parseable strings. | Standardize timestamps to ISO-8601 UTC format (`YYYY-MM-DDTHH:MM:SSZ`). |
| **422** | `INVALID_NUMERICAL_VALUES` | *"Some values could not be interpreted as valid numerical measurements. Review the affected rows before continuing."* | Non-numeric string literals in a sensor column (e.g., `"ERR"`, `"OFF"`). | Clean non-numeric tokens or mark them as missing (`NaN`) before pipeline ingestion. |
| **422** | `INVALID_CONFIGURATION` | *"One or more processing settings are invalid. Review the settings and try again."* | Incompatible parameters (e.g., `window_size <= 0`, `mad_threshold < 1.0`, `review_threshold > 1.0`). | Restore default industrial detection settings (`window_size = 15`, `mad_threshold = 3.0`). |
| **400** | `REQUEST_REJECTED` | *"We couldn't start the processing run because the request is invalid. Review the selected dataset and settings."* | Payload failed Pydantic schema validation. | Inspect error details field in the response; check required fields. |

---

### 2.3 Pipeline & Algorithm Outcomes

| Category | Status Code | User-Facing Message | Meaning & Behavioral Invariant |
|:---:|:---:|:---|:---|
| **Processing Abstained** | `200` (Ledger `UNRESOLVED`) | *"There is not enough reliable evidence to reconstruct this value safely. The observation has been marked unresolved."* | **Expected Outcome (Not a Failure)**: Sequence gap exceeds `max_gap_size`, point is at boundary, or neighbor quorum is insufficient. Original raw reading is preserved. |
| **Conflicting Evidence** | `200` (Ledger `UNRESOLVED`) | *"The available sensor evidence is inconsistent. No unsupported replacement has been applied."* | **Expected Safety Behavior**: Cross-sensor residual analysis revealed opposing trends. Rather than guessing, the pipeline abstains. |
| **Reconstruction Unavailable** | `200` (Ledger `UNRESOLVED`) | *"A reliable reconstruction could not be produced for this observation. The value has been left unresolved for review."* | **Expected Safety Behavior**: Candidate interpolation failed safety bounds. The point is flagged for domain operator review. |
| **Processing Failed** | `500` | *"Processing could not be completed. Your original dataset has been preserved. Please review the error details and retry."* | Unhandled internal exception during execution. Incomplete run is marked `failed`; raw data remains intact. |
| **Persistence Failure** | `500` | *"The result could not be saved completely. The run has not been marked as successfully completed."* | Filesystem I/O failure or permission error during finalization. The system aborts cleanly without recording false success. |
| **Audit Verification Failure** | `200` (`is_valid = false`) | *"Audit verification failed. The recorded processing history requires investigation."* | SHA-256 hash-chain continuity check detected historical record modification, deletion, or reordering. |
| **Export Failure** | `500` | *"We couldn't export the results. Your completed processing run remains available for review if storage succeeded."* | Temporary stream failure during CSV serialization. Original run remains accessible via the UI. |

---

### 2.4 Network, Service & Connection Errors

| HTTP Status | Error Code | User-Facing Message | Safe Recovery Action |
|:---:|:---:|:---|:---|
| **0 / Network** | `BACKEND_UNAVAILABLE` | *"The processing service is currently unavailable. Check the backend connection and try again."* | 1. Confirm FastAPI server is running on port 8000.<br>2. Check terminal logs for port binding errors.<br>3. Click "Refresh Dashboard" or "Probe API". |
| **408 / 504** | `REQUEST_TIMEOUT` | *"The request took longer than expected. Check the run status before retrying to avoid starting duplicate processing."* | Query the run list or audit trail before re-triggering heavy operations to prevent duplicate runs. |
| **404** | `RUN_NOT_FOUND` | *"This processing run could not be found. Refresh the run list and select an available run."* | Refresh page; check if run ID exists in historical run registry. |
| **500** | `INTERNAL_SERVER_ERROR` | *"An unexpected processing error occurred. Please retry if safe or contact the project administrator."* | Inspect sanitized server error log; retry if idempotent. |

---

## 3. Frontend Error Display Guidelines

1. **Card Notifications**: Rendered in a dedicated `<div className="p-4 rounded-xl bg-red-950/60 border border-red-800/80 ...">` with `XCircle` icon.
2. **Non-Blocking Recovery**: Users can switch tabs, reload the demo catalog, or view the audit log even when a pipeline run fails.
3. **No Hanging Spinners**: All async operations use `try / catch / finally` blocks to guarantee that `setIsProcessing(false)` and `loading` states are reset.
4. **Retry Protection**: Execution buttons are disabled (`disabled={isProcessing}`) during active runs to prevent duplicate submissions.
