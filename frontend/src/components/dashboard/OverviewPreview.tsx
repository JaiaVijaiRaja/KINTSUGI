import React from 'react';
import type { ConnectionState } from '../../types/api';
import {
  Server,
  Activity,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Cpu,
  ShieldAlert,
  Database,
  Sliders,
  FileCheck2,
  Terminal,
} from 'lucide-react';
import { apiService } from '../../services/api';

interface OverviewPreviewProps {
  connection: ConnectionState;
  onRetry: () => void;
}

export const OverviewPreview: React.FC<OverviewPreviewProps> = ({
  connection,
  onRetry,
}) => {
  const apiUrl = `${apiService.getBaseUrl()}/api/health`;

  return (
    <div className="space-y-6">
      {/* Development Preview Banner */}
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 backdrop-blur-xs">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wide">
                Development Preview — Phase 1 Foundation
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium">
                Non-Operational Preview
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              This interface is an architectural foundation for <strong>KINTSUGI</strong>. No operational ML inference, synthetic anomalies, or live sensor feeds are fabricated. Real-time connectivity below reflects an actual live HTTP call to the FastAPI backend.
            </p>
          </div>
        </div>
      </div>

      {/* Backend Health Check Card (Live HTTP Request) */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-6 shadow-xl backdrop-blur-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800/80">
          <div className="flex items-center gap-3">
            <div
              className={`p-2.5 rounded-lg border ${
                connection.status === 'connected'
                  ? 'bg-emerald-950/50 border-emerald-500/30 text-emerald-400'
                  : connection.status === 'loading'
                  ? 'bg-amber-950/50 border-amber-500/30 text-amber-400'
                  : 'bg-rose-950/50 border-rose-500/30 text-rose-400'
              }`}
            >
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  Backend API Health Status
                </h3>
                <span className="text-xs font-mono text-slate-400">
                  (GET /api/health)
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono mt-0.5">
                Target: {apiUrl}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={onRetry}
              disabled={connection.status === 'loading'}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${
                  connection.status === 'loading' ? 'animate-spin' : ''
                }`}
              />
              <span>{connection.status === 'loading' ? 'Checking...' : 'Check Connection'}</span>
            </button>
          </div>
        </div>

        {/* Live Status Display Body */}
        <div className="pt-5">
          {connection.status === 'connected' && connection.data && (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-sm font-semibold tracking-wide">
                  Backend API is Online & Connected
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[11px] text-slate-400 block uppercase font-mono">Service ID</span>
                  <span className="text-xs font-mono font-medium text-slate-200 mt-0.5 block truncate">
                    {connection.data.service}
                  </span>
                </div>
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[11px] text-slate-400 block uppercase font-mono">API Version</span>
                  <span className="text-xs font-mono font-medium text-slate-200 mt-0.5 block">
                    v{connection.data.version}
                  </span>
                </div>
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[11px] text-slate-400 block uppercase font-mono">Environment</span>
                  <span className="text-xs font-mono font-medium text-emerald-400 mt-0.5 block capitalize">
                    {connection.data.environment}
                  </span>
                </div>
                <div className="bg-slate-950/70 border border-slate-800/80 rounded-lg p-3">
                  <span className="text-[11px] text-slate-400 block uppercase font-mono">Roundtrip Latency</span>
                  <span className="text-xs font-mono font-medium text-amber-400 mt-0.5 block">
                    {connection.latencyMs !== null ? `${connection.latencyMs} ms` : '—'}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-slate-500 pt-1">
                <span>Server UTC: {connection.data.timestamp}</span>
                <span>
                  Last check: {connection.lastChecked ? connection.lastChecked.toLocaleTimeString() : '—'}
                </span>
              </div>
            </div>
          )}

          {connection.status === 'loading' && (
            <div className="py-6 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
              <div className="text-center">
                <p className="text-xs font-semibold text-slate-200">
                  Executing HTTP GET request to backend...
                </p>
                <p className="text-[11px] font-mono text-slate-400 mt-1">
                  Connecting to {apiUrl}
                </p>
              </div>
            </div>
          )}

          {(connection.status === 'disconnected' || connection.status === 'error') && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-lg p-4">
                <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold">
                    Backend Disconnected
                  </p>
                  <p className="text-xs text-rose-300/90 leading-relaxed">
                    {connection.error || 'Failed to establish HTTP connection with backend API.'}
                  </p>
                </div>
              </div>

              {/* Actionable troubleshooting guidance */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                  <Terminal className="w-4 h-4 text-amber-400" />
                  <span>Actionable Troubleshooting Steps</span>
                </div>
                <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside pl-1">
                  <li>Verify that the FastAPI service is started in your terminal.</li>
                  <li className="font-mono text-[11px] text-amber-300/90 bg-slate-900 px-2 py-1 rounded inline-block">
                    .\backend\.venv\Scripts\uvicorn.exe app.main:app --port 8000 --reload
                  </li>
                  <li>Confirm that your frontend <code className="text-slate-200">.env</code> contains <code className="text-slate-200">VITE_API_BASE_URL=http://127.0.0.1:8000</code>.</li>
                  <li>Check that your browser is not blocking local network requests.</li>
                </ol>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Planned Pipeline Architecture Specification Cards (Clearly Sample/Preview) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wide">
              Pipeline Architecture Roadmap
            </h3>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            System Design Specification
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Ingestion */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 1 — Roadmap
              </span>
              <Database className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Sensor Dataset Ingestion
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Will accept multi-channel industrial sensor datasets (vibration, temperature, pressure). Preserves raw un-altered measurements for complete auditability.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: CSV / Parquet time-series schemas
            </div>
          </div>

          {/* Card 2: Anomaly Detection */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 2 — Roadmap
              </span>
              <ShieldAlert className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Anomaly & Quality Detection
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Detects packet loss, frozen sensor signals, out-of-spec transients, and statistical drift without altering the underlying raw data store.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: Multi-variate outlier auditing
            </div>
          </div>

          {/* Card 3: Signal Reconstruction */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 3 — Roadmap
              </span>
              <Sliders className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Self-Healing Signal Reconstruction
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reconstructs faulty or missing segments through evidence-based modeling while keeping original measurements completely intact.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: Contextual time-series healing
            </div>
          </div>

          {/* Card 4: Confidence Engine */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 4 — Roadmap
              </span>
              <Cpu className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Confidence Engine
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Assigns rigorous confidence metrics to all proposed corrections. Points with low support are strictly tagged as <strong className="text-amber-300">Unresolved</strong>.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: Bayesian / residual confidence scoring
            </div>
          </div>

          {/* Card 5: Auditable Log */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 5 — Roadmap
              </span>
              <FileCheck2 className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Auditable Decision History
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Maintains an immutable record of every detection, proposed repair, confidence score, and rationale for regulatory compliance.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: Append-only audit trail ledger
            </div>
          </div>

          {/* Card 6: Benchmark Evaluation */}
          <div className="rounded-xl border border-slate-800 bg-slate-900/30 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Stage 6 — Roadmap
              </span>
              <Activity className="w-4 h-4 text-slate-500" />
            </div>
            <h4 className="text-sm font-semibold text-slate-200">
              Controlled Benchmark Evaluation
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              Evaluates reconstruction accuracy against controlled synthetic and historical ground-truth benchmark datasets.
            </p>
            <div className="pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
              Preview Spec: RMSE, MAE & Uncertainty Calibration
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
