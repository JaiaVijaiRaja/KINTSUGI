# KINTSUGI — Local Application Setup & Runtime Guide

## 1. System Overview

**KINTSUGI** is a confidence-aware, self-healing industrial telemetry data pipeline. This repository is configured as a **locally runnable demonstration of a SaaS-style industrial telemetry application**.

> [!NOTE]
> **Deployment Scope Clarification**  
> This runtime executes entirely on your local machine using a FastAPI backend and a Vite/React frontend with filesystem-based persistence. It is **not** a publicly hosted cloud SaaS service. All processing, anomaly detection, mathematical reconstruction, and cryptographic audit hashing run locally on your hardware.

---

## 2. Quick Start — Single Command Launch

From a fresh Windows terminal in the project root directory, launch the entire KINTSUGI application with:

```powershell
powershell -ExecutionPolicy Bypass -File .\run.ps1
```

### What the Launcher Does Automatically:
1. **Verifies Environment**: Validates Python virtualenv (`backend\.venv`) and Node.js/npm.
2. **Detects & Resolves Port Conflicts**: Checks if port `8000` or `5173` is occupied and cleans up previous orphan processes.
3. **Starts Backend Service**: Launches FastAPI / Uvicorn on `http://127.0.0.1:8000`.
4. **Starts Frontend Service**: Launches Vite / React dev server on `http://127.0.0.1:5173`.
5. **Polls Service Health**: Waits until both `/api/health` and the frontend return HTTP 200 OK.
6. **Opens Main Application**: Automatically opens `http://localhost:5173` in your default web browser (single browser tab).
7. **Graceful Teardown**: Pressing `Ctrl+C` in the terminal terminates all child processes cleanly without leaving background port listeners.

---

## 3. Environment & Service Ports

| Service | Technology | Local URL | Description |
| :--- | :--- | :--- | :--- |
| **Primary User Application** | React 18 + Vite + Tailwind CSS | [http://localhost:5173](http://localhost:5173) | Main operator interface for dataset upload, pipeline configuration, anomaly review, and CSV export |
| **Backend API Service** | Python 3 + FastAPI + Uvicorn | [http://127.0.0.1:8000](http://127.0.0.1:8000) | REST API powering detection, reconstruction, and audit services |
| **Diagnostic Health Endpoint** | FastAPI Health Route | [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health) | Machine-readable health check (`{"status": "healthy"}`) |
| **Interactive API Documentation** | OpenAPI / Swagger UI | [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) | Internal developer documentation for REST endpoints |

---

## 4. Manual / Individual Service Startup (Optional)

If you prefer to run services in separate terminal windows:

### Terminal 1: Backend
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000
```

### Terminal 2: Frontend
```powershell
cd frontend
npm run dev -- --host 127.0.0.1 --port 5173
```

---

## 5. Verification & Testing Commands

To run all automated verification checks and regression suites locally:

### Run Backend Unit & Integration Tests (166 tests):
```powershell
.\backend\.venv\Scripts\pytest backend
```

### Run Demonstration Dataset End-to-End Verification:
```powershell
.\backend\.venv\Scripts\python.exe backend\scripts\verify_demo_pipeline.py
```

### Run Frontend Production Build & Typecheck:
```powershell
cd frontend
npm run build
npm run lint
```

---

## 6. Troubleshooting

### Port Conflicts (Port 8000 or 5173 already in use)
The `run.ps1` script automatically detects and terminates conflicting processes. If you encounter a stubborn port conflict manually:
```powershell
# Identify processes listening on port 8000 or 5173:
Get-NetTCPConnection -LocalPort 8000, 5173 -State Listen | Select-Object LocalPort, OwningProcess

# Terminate process by PID:
Stop-Process -Id <PID> -Force
```

### Missing Python Virtual Environment
If `run.ps1` reports `Backend virtual environment not found`:
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\pip install -r requirements.txt
```

### Frontend Dependencies Missing
If Vite fails to start:
```powershell
cd frontend
npm install
```

### Backend Unavailable in Browser
* Check that backend health returns `{"status": "healthy"}` at [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health).
* Ensure your Windows Firewall or corporate proxy allows localhost loopback traffic on ports 8000 and 5173.
