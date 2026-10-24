# KINTSUGI — Live Demonstration Troubleshooting Guide

Emergency quick-reference for the presenter if unexpected behavior occurs during the hackathon demonstration.

---

### Incident 1: Top-Right Connection Badge Shows "Disconnected" / Red
* **Symptom**: Top-right connection indicator says `"API Unreachable"`.
* **Root Cause**: Backend uvicorn server is not running or crashed.
* **Resolution**:
  1. Open the backend terminal window.
  2. If process stopped, re-run:
     ```powershell
     cd backend
     .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
     ```
  3. In browser, click the **Probe API** or **Refresh Diagnostics** button. Connection badge will transition to emerald `"Connected"`.

---

### Incident 2: Port 8000 Already in Use
* **Symptom**: `ERROR: [Errno 10048] error while attempting to bind on address ('127.0.0.1', 8000)`.
* **Root Cause**: An orphaned Python process is holding port 8000.
* **Resolution**:
  ```powershell
  # Kill process holding port 8000
  Get-Process -Id (Get-NetTCPConnection -LocalPort 8000).OwningProcess | Stop-Process -Force
  # Restart backend
  .\backend\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
  ```

---

### Incident 3: File Upload Fails / "Permission Denied"
* **Symptom**: `Upload failed: [Errno 13] Permission denied`.
* **Root Cause**: The CSV file `turbine_telemetry_demo.csv` is open and locked by Microsoft Excel.
* **Resolution**:
  1. Close Excel or any text editor locking the file.
  2. Drag and drop the file again into the `/datasets` upload dropzone.

---

### Incident 4: Hash-Chain Verification Reports "Tamper Detected"
* **Symptom**: `POST /api/audit/verify` reports `is_valid: false`.
* **Root Cause**: A manual file modification was made to `storage/audit/events.jsonl` outside the pipeline.
* **Resolution**:
  1. This is actually a feature! Point out to the jury: *"KINTSUGI's SHA-256 cryptographic chain immediately detected unauthorized post-hoc record manipulation!"*
  2. To reset the ledger to a pristine valid state:
     ```powershell
     Remove-Item backend\storage\audit\events.jsonl -ErrorAction SilentlyContinue
     ```
     Restart the workflow by uploading `demo/turbine_telemetry_demo.csv`.

---

### Incident 5: Browser Displays Stale Interface or Cached State
* **Symptom**: Page changes are not reflected or old state appears.
* **Resolution**:
  1. Perform a hard refresh: `Ctrl + Shift + R` (Windows) or `Cmd + Shift + R` (Mac).
  2. Alternatively, open in an Incognito/Private window at `http://localhost:5173`.
