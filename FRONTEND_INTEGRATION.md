# KINTSUGI — Frontend Integration Guide & Developer Runbook

**Audience:** Frontend Engineers, UI/UX Contributors, Integration Developers  
**Frontend Framework:** React 19, TypeScript 6, Vite 8, TailwindCSS 4, Lucide React  
**Backend Framework:** FastAPI, Pydantic v2, Python 3.14  
**Date:** October 25, 2026 (Demo Freeze Edition)  

---

## 1. Environment Configuration

The frontend uses Vite environment variables. The API base URL is resolved at runtime via `import.meta.env.VITE_API_BASE_URL`.

### `.env` (in `frontend/`)
```env
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### Fallback Behavior
If `VITE_API_BASE_URL` is omitted or empty, `frontend/src/services/api.ts` defaults automatically to `http://127.0.0.1:8000`.

### CORS Configuration
The backend explicitly permits cross-origin requests from:
* `http://localhost:5173`
* `http://127.0.0.1:5173`

*(Note: Wildcard `*` CORS with credentials is intentionally disabled for security).*

---

## 2. API Service Layer Mapping

All frontend service calls route through strongly-typed modules in `frontend/src/services/`:

| Subsystem | Service File | Key Methods | Backend Route Prefix |
| :--- | :--- | :--- | :--- |
| **System Health** | `apiService.ts` | `checkHealth()` | `/api/health` |
| **Datasets** | `datasetService.ts` | `uploadDataset()`, `listDatasets()`, `getDataset()`, `getQuality()`, `getPreview()` | `/api/datasets` |
| **Pipelines** | `pipelineService.ts` | `validateConfig()`, `createConfig()`, `listConfigs()`, `getConfig()`, `listPipelineRuns()` | `/api/pipelines` |
| **Anomaly Detection**| `detectionService.ts` | `executeDetection()`, `listRuns()`, `getRun()`, `getResults()`, `getAnomaly()` | `/api/anomalies` |
| **Reconstruction** | `reconstructionService.ts` | `executeReconstruction()`, `listRuns()`, `getRun()`, `getResults()`, `reviewResult()` | `/api/reconstruction` |
| **Evaluations** | `evaluationService.ts` | `executeEvaluation()`, `getEvaluation()`, `getMetrics()`, `getManifest()` | `/api/evaluations` |
| **Audit Ledger** | `auditService.ts` | `listEvents()`, `getEvent()`, `verifyHashChain()`, `exportLedger()` | `/api/audit` |

---

## 3. Canonical TypeScript Models & Schema Rules

All interfaces in `frontend/src/types/` are 1-to-1 congruent with backend Pydantic models.

### 3.1 Reconstruction Types (`frontend/src/types/reconstruction.ts`)
```typescript
export interface ConfidenceBreakdown {
  neighbor_count_score: number;       // Range: 0.0 to 25.0
  method_agreement_score: number;     // Range: 0.0 to 25.0
  temporal_proximity_score: number;   // Range: 0.0 to 20.0
  local_variance_score: number;       // Range: 0.0 to 15.0 (Canonical)
  neighbor_cleanliness_score: number; // Range: 0.0 to 15.0
  cross_sensor_score: number;         // Range: -25.0 to 15.0
  total_score: number;                // Range: 0.0 to 100.0 (Canonical)
  penalty_reasons: string[];          // Explanatory strings (Canonical)

  // Backward-compatibility aliases (optional)
  local_stability_score?: number;
  factors_applied?: string[];
}

export interface EvidenceReference {
  source_row_index: number;
  timestamp?: string | null;
  sensor_column: string;
  value: number;
  distance: number;                   // Distance in rows / temporal delta
  weight: number;                     // Estimation weight (0.0 to 1.0)
  is_anomaly: boolean;                // Whether neighbor was itself anomalous
  role?: string;                      // Optional legacy fallback
}

export interface ReconstructionRecord {
  result_id: string;
  reconstruction_run_id: string;
  detection_run_id: string;
  anomaly_id?: string | null;
  dataset_id: string;
  configuration_id: string;
  sensor_column: string;
  source_row_index: number;
  timestamp?: string | null;
  original_value?: number | null;
  proposed_value?: number | null;
  final_value?: number | null;
  method: ReconstructionMethod;
  status: 'MEASURED' | 'ESTIMATED' | 'CORRECTED' | 'UNRESOLVED';
  confidence_score: number;
  confidence_breakdown?: ConfidenceBreakdown | null;
  evidence_summary: string;
  evidence_references: EvidenceReference[];
  abstention_reason?: string | null;
  is_reviewed: boolean;
  reviewed_by?: string | null;
  review_decision?: 'ACCEPT' | 'REJECT' | 'MODIFY' | null;
  review_comment?: string | null;
  reviewed_at?: string | null;
  created_at: string;
}
```

---

## 4. UI Rendering Conventions (Evidence Integrity)

To uphold industrial integrity standards and avoid misleading operators, adhere strictly to these rules:

1. **Genuine Zero Score vs Missing Score**:
   - A score of `0` or `0.0` must render as `+0.0 / <max>` (e.g., `+0.0 / 25`).
   - A `null`, `undefined`, or `NaN` score must render as `Unmeasured`.
   - Never use `(score ?? 0).toFixed(1)` which coerces missing telemetry into fake zeros.

2. **Completely Missing Confidence Breakdown**:
   - If `record.confidence_breakdown` is `null` or `undefined`, do not render six deceptive `+0.0` cards.
   - Display the explicit info banner: *"Evidence breakdown telemetry is unavailable for this observation. Factors are unmeasured."*

3. **Evidence Reference Table**:
   - Do not display an empty `Role` column.
   - Display **`Distance`** (`${ev.distance.toFixed(1)} rows`) and **`Anomaly Status`** (`Nominal` or `Flagged` badges).

4. **Status-Specific Guardrails**:
   - For `CORRECTED`: Display both proposed reconstruction and final committed value with green badge.
   - For `UNRESOLVED`: Display `None (Abstained)` under Proposed, display raw unmodified measurement under Final Value, and display the rose `Abstention Reason` banner.

---

## 5. Local Developer Workflow & Quality Gates

Run these commands before pushing any frontend changes:

```powershell
# 1. Start backend (Terminal 1)
cd backend
.\.venv\Scripts\uvicorn.exe app.main:app --host 127.0.0.1 --port 8000 --reload

# 2. Start frontend (Terminal 2)
cd frontend
npm run dev

# 3. Verify TypeScript production build (0 errors)
npm run build

# 4. Verify code linting (0 errors)
npm run lint

# 5. Run full Playwright browser test suite (13 passing)
npm run test:e2e
```

---

## 6. Common Frontend Integration Gotchas

* **Uncaught TypeError on `sensor_columns.length`**: When mocking or constructing pipelines, always include `sensor_columns: string[]` and `confidence_policy: { review_threshold: number, ... }`.
* **Playwright URL Wildcards**: When mocking API responses with `page.route()`, use wildcards for query strings (e.g., `**/api/reconstruction/runs*` and `**/api/pipelines/*/runs*`).
* **Cache Busting**: During local iteration, if Vite seems to display stale responses, perform a hard refresh (`Ctrl + Shift + R`).
