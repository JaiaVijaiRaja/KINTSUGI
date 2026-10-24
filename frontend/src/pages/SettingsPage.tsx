import React from 'react';
import type { ConnectionState } from '../types/api';
import {
  Server,
  Globe,
  ExternalLink,
  FileCode,
  RefreshCw,
  Cpu,
  Lock,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { apiService } from '../services/api';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';

interface SettingsPageProps {
  connection: ConnectionState;
  onRefreshHealth: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({
  connection,
  onRefreshHealth,
}) => {
  const apiBaseUrl = apiService.getBaseUrl();
  const docsUrl = `${apiBaseUrl}/docs`;
  const redocUrl = `${apiBaseUrl}/redoc`;
  const openApiUrl = `${apiBaseUrl}/openapi.json`;
  const healthUrl = `${apiBaseUrl}/api/health`;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Settings & System Information"
        description="Runtime system configurations, network connectivity diagnostics, and interactive backend API documentation."
        badge="Phase 10 Verified"
        badgeVariant="primary"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshHealth}
            loading={connection.status === 'loading'}
            icon={RefreshCw}
          >
            Refresh Diagnostics
          </Button>
        }
      />

      {/* Grid: System Metadata and API Connection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Version & Metadata Card */}
        <Card>
          <CardHeader
            title="System Specifications & Versioning"
            subtitle="Core application identity and software stack metadata"
            icon={Cpu}
            badge={
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                Phase 10
              </span>
            }
          />
          <CardContent className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Application Name</span>
              <span className="text-slate-100 font-semibold">KINTSUGI</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Pipeline Description</span>
              <span className="text-slate-300 text-right text-[11px]">
                Confidence-Aware Industrial Pipeline
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Integration Milestone</span>
              <span className="text-emerald-300">Phase 10 — Demonstration & Deployment Ready</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Frontend Stack</span>
              <span className="text-slate-200">React 19 • Vite 8 • Tailwind v4</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Backend Stack</span>
              <span className="text-slate-200">Python 3.14 • FastAPI • Pydantic v2</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-400">Backend API Version</span>
              <span className="text-emerald-400">
                {connection.data ? `v${connection.data.version}` : 'v0.1.0 (offline)'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* API Diagnostics & Base URL Card */}
        <Card>
          <CardHeader
            title="Network & API Diagnostics"
            subtitle="Configured endpoints and real-time connectivity status"
            icon={Server}
            badge={
              connection.status === 'connected' ? (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Online
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Offline
                </span>
              )
            }
          />
          <CardContent className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Configured API Base URL</span>
              <span className="text-amber-300 font-semibold">{apiBaseUrl}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Health Endpoint Target</span>
              <span className="text-slate-300">{healthUrl}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Current Health State</span>
              <span className="flex items-center gap-1.5">
                {connection.status === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400 capitalize">
                      {connection.data?.status || 'Healthy'}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span className="text-rose-400">Disconnected</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-slate-800">
              <span className="text-slate-400">Roundtrip Latency</span>
              <span className="text-slate-200">
                {connection.latencyMs !== null ? `${connection.latencyMs} ms` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-slate-400">Permitted CORS Origins</span>
              <span className="text-slate-400 text-right text-[11px]">
                http://localhost:5173, http://127.0.0.1:5173
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Safe Environment Details Card */}
      <Card>
        <CardHeader
          title="Safe Runtime Environment Information"
          subtitle="Non-sensitive client execution properties (zero secrets exposed)"
          icon={Globe}
        />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">Client Build Mode</span>
              <span className="text-slate-200 font-semibold">{import.meta.env.MODE}</span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">Local Timezone</span>
              <span className="text-slate-200 font-semibold">
                {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
              </span>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 uppercase block">Secret Protection</span>
              <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5" /> Enforced (Zero Secrets)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Interactive Backend API Documentation Links */}
      <Card>
        <CardHeader
          title="FastAPI Interactive Documentation & Schema"
          subtitle="Live documentation hosted by the running backend service"
          icon={FileCode}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Interactive OpenAPI
            </span>
          }
        />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <a
              href={docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                    Swagger UI Docs
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Interactive API browser with live endpoint testing.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">/docs</span>
            </a>

            <a
              href={redocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                    ReDoc Reference
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Comprehensive three-panel technical API specifications.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">/redoc</span>
            </a>

            <a
              href={openApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                    OpenAPI JSON Schema
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Machine-readable OpenAPI 3.1 specification schema.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">/openapi.json</span>
            </a>

            <a
              href={healthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-900 hover:border-amber-500/40 transition-all flex flex-col justify-between space-y-3 group"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                    Live Health Endpoint
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500 group-hover:text-amber-400 transition-colors" />
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed font-sans">
                  Direct raw JSON response from GET /api/health.
                </p>
              </div>
              <span className="text-[10px] font-mono text-slate-500">/api/health</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
