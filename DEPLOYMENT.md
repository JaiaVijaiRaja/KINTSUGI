# KINTSUGI — Deployment Readiness & Production Architecture Guide

This document provides a realistic, technically rigorous review of KINTSUGI's deployment architecture, hosting requirements, persistent storage guarantees, and operational procedures.

---

## 1. Architecture & Deployment Matrix

| Tier | Component | Technology | Production Serving Pattern |
| :--- | :--- | :--- | :--- |
| **Frontend** | Single Page Application (SPA) | React 19 + TypeScript + Vite 8 | Static assets served via Nginx with HTML5 History fallback |
| **Backend** | REST API & ML Processing | Python 3.14 + FastAPI + Pydantic v2 | ASGI Uvicorn workers behind reverse proxy (Nginx / Cloud Load Balancer) |
| **Storage** | Persistence Layer | File-based atomic JSON & CSV ledger | POSIX volume mount (`kintsugi_persistent_storage`) |

---

## 2. Persistent Storage: Guarantees & Honest Limitations

### Storage Guarantees Implemented
* **File Atomicity**: All file writes across pipelines, detection runs, reconstructions, evaluations, and audit records write to `.tmp` files and commit via atomic `os.replace` (POSIX `rename`). Half-written records cannot corrupt the store during mid-write process crashes.
* **Source Telemetry Immutability**: Uploaded raw CSV files in `storage/datasets/{id}/data.csv` are mounted read-only and cryptographically verified via SHA-256 before and after executions.
* **Audit Ledger Integrity**: The append-only ledger in `storage/audit/events.jsonl` contains unbroken SHA-256 parent-child hash links verified via `/api/audit/verify`.

### Honest Storage Limitations in Cloud Hosting
> [!WARNING]
> **Ephemeral Containers Alert**: If deployed onto serverless container platforms (e.g. AWS Fargate, Google Cloud Run, Heroku Dynos) without a persistent volume mount, local filesystem storage (`/app/storage`) **will be lost upon container restart or deployment recycling**.
> 
> For durable cloud hosting:
> 1. In Docker Compose: Bind to the named Docker volume `kintsugi_persistent_storage` (configured in `docker-compose.yml`).
> 2. In Kubernetes: Bind to a `PersistentVolumeClaim` (ReadWriteOnce EBS/GCP-PD).
> 3. For Enterprise Multi-Region Clustering: The filesystem repository interfaces (`DatasetService`, `PipelineService`, etc.) must be backed by an object store (AWS S3 / Google Cloud Storage) and an ACID transactional database (PostgreSQL).

---

## 3. Production Configuration & Environment Variables

| Variable | Description | Safe Example (Production) | Default |
| :--- | :--- | :--- | :--- |
| `ENVIRONMENT` | Runtime mode (`development`, `staging`, `production`) | `production` | `development` |
| `HOST` | Backend listener binding host | `0.0.0.0` | `127.0.0.1` |
| `PORT` | Backend listener port | `8000` | `8000` |
| `CORS_ORIGINS` | Comma-delimited list of allowed web origins | `http://localhost,http://localhost:80,https://kintsugi.example.com` | `http://localhost:5173,http://127.0.0.1:5173` |
| `VITE_API_BASE_URL` | Base URL used by the frontend to contact backend | `http://localhost:8000` (or `/api` behind reverse proxy) | `http://127.0.0.1:8000` |

> [!NOTE]
> No database passwords, private API keys, or cloud credentials are required by the current file-persisted architecture. Never commit secrets to repository tracking.

---

## 4. Containerized Deployment (Docker & Compose)

### Single-Command Compose Deployment
To launch the complete KINTSUGI application stack with persistent volumes and Nginx reverse proxy:
```bash
docker compose up -d --build
```

### Verified Stack Endpoints:
* Frontend Dashboard: `http://localhost:80`
* Backend API Health: `http://localhost:8000/api/health`
* Interactive OpenAPI Docs: `http://localhost:8000/docs`

---

## 5. Local Bare-Metal / Development Startup

### 1. Backend Service
```powershell
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload
```

### 2. Frontend Development Server
```powershell
cd frontend
npm run dev
```
Access in browser: `http://localhost:5173`

---

## 6. HTML5 History Router Fallback (Nginx Verification)

Because KINTSUGI uses zero-dependency client-side HTML5 History routing (`/overview`, `/datasets`, `/pipeline`, `/anomalies`, `/reconstruction`, `/audit`, `/evaluation`, `/settings`), direct navigation or browser refresh on a nested route requires the web server to fallback to `index.html`.

In `frontend/nginx.conf`:
```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```
This guarantees that refreshing any nested page in production returns HTTP 200 and loads the appropriate client view rather than an Nginx 404.
