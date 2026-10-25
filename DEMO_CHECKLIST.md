# KINTSUGI — Pre-Demonstration Verification Checklist

Use this checklist 15 minutes before the hackathon demonstration or live jury walkthrough.

---

## 1. Environment & Service Pre-Flight Checks

- [ ] **Python Runtime**: Python 3.14 verified in `backend/.venv`
  ```powershell
  .\backend\.venv\Scripts\python.exe --version
  ```
- [ ] **Node.js & Vite**: Node v20+ installed
  ```powershell
  node --version
  npm --version
  ```
- [ ] **Port Availability**:
  - [ ] Port `8000` (FastAPI backend) is free
  - [ ] Port `5173` (Vite frontend) is free
- [ ] **Demonstration Fixture Ready**:
  - [ ] `demo/turbine_telemetry_demo.csv` exists and is 60 rows
  - [ ] `demo/ground_truth_manifest.json` exists
  *(If missing, run: `.\backend\.venv\Scripts\python.exe backend/scripts/generate_demo_fixture.py`)*

---

## 2. Automated Quality Gates

- [ ] **Backend Test Suite (162 Tests Passing)**:
  ```powershell
  .\backend\.venv\Scripts\python.exe -m pytest backend/tests -v
  ```
  *Expected Output: `162 passed in ~15s (0 failures)`*

- [ ] **Frontend Linting (0 Errors)**:
  ```powershell
  cd frontend
  npm run lint
  cd ..
  ```
  *Expected Output: `0 errors across 56 files`*

- [ ] **Frontend Production Type-Check & Build (0 Errors)**:
  ```powershell
  cd frontend
  npm run build
  cd ..
  ```
  *Expected Output: `✓ built in ~500ms (0 errors)`*

- [ ] **Playwright Browser E2E Test Suite (13 Tests Passing)**:
  ```powershell
  cd frontend
  npm run test:e2e
  cd ..
  ```
  *Expected Output: `13 passed in ~14s (0 failures)`*

---

## 3. Starting the Services for Live Presentation

1. **Terminal 1 — Backend FastAPI**:
   ```powershell
   cd backend
   .\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   *Verify: `http://127.0.0.1:8000/api/health` returns `{"status": "healthy"}`*

2. **Terminal 2 — Frontend Dev Server**:
   ```powershell
   cd frontend
   npm run dev
   ```
   *Verify: `http://localhost:5173` opens to Overview page with green "Connected" badge*

---

## 4. Browser & Audio/Visual Setup

- [ ] **Browser Window**: Chrome or Edge set to 100% zoom (1920x1080 optimal).
- [ ] **Initial Page**: Open `http://localhost:5173/overview`.
- [ ] **Inspect Connection Badge**: Top-right connection indicator is **Connected** (`< 15ms`).
- [ ] **File Explorer Quick Access**: Keep folder `c:\WORK LAB-SL19\Workstation\MY PROJECT\ANTIGRAVITY\HORIZONXT26\demo\` open in Windows File Explorer ready for drag-and-drop.

---

## 5. Rapid Reset Command (Clean Slate for Demo)

If you need to wipe previous demonstration runs and start with a pristine catalog:
```powershell
# Optional: Clear demo storage artifacts (does not delete tests or fixtures)
Remove-Item -Recurse -Force backend\storage\runs\* -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend\storage\reconstruction\* -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force backend\storage\evaluations\* -ErrorAction SilentlyContinue
```
*(Note: Keep `backend\storage\datasets` and `backend\storage\pipelines` if you wish to skip re-uploading).*
