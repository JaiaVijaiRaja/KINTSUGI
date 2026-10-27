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
import { ThresholdsManager } from '../components/settings/ThresholdsManager';

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
        title="Settings & System Configuration"
        description="Configure human supervisory threshold boundaries, control policies, network connectivity diagnostics, and interactive backend API documentation."
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

      {/* Human-Managed Operational Thresholds Section */}
      <ThresholdsManager />

      {/* Grid: System Metadata and API Connection */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Version & Metadata Card */}
        <Card>
          <CardHeader
            title="System Specifications & Versioning"
            subtitle="Core application identity and software stack metadata"
            icon={Cpu}
            badge={
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                Phase 10
              </span>
            }
          />
          <CardContent className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Application Name</span>
              <span className="text-stone-900 font-semibold">KINTSUGI</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Pipeline Description</span>
              <span className="text-stone-700 text-right text-[11px]">
                Confidence-Aware Industrial Pipeline
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Integration Milestone</span>
              <span className="text-emerald-700 font-medium">Phase 10 — Demonstration & Deployment Ready</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Frontend Stack</span>
              <span className="text-stone-800">React 19 • Vite 8 • Tailwind v4</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Backend Stack</span>
              <span className="text-stone-800">Python 3.14 • FastAPI • Pydantic v2</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-stone-500">Backend API Version</span>
              <span className="text-emerald-700 font-bold">
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
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Online
                </span>
              ) : (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-800 border border-rose-200">
                  Offline
                </span>
              )
            }
          />
          <CardContent className="space-y-3 font-mono text-xs">
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Configured API Base URL</span>
              <span className="text-stone-900 font-semibold">{apiBaseUrl}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Health Endpoint Target</span>
              <span className="text-stone-700">{healthUrl}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Current Health State</span>
              <span className="flex items-center gap-1.5">
                {connection.status === 'connected' ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700 font-semibold capitalize">
                      {connection.data?.status || 'Healthy'}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span className="text-rose-700 font-semibold">Disconnected</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-stone-200">
              <span className="text-stone-500">Roundtrip Latency</span>
              <span className="text-stone-800 font-medium">
                {connection.latencyMs !== null ? `${connection.latencyMs} ms` : '—'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-stone-500">Permitted CORS Origins</span>
              <span className="text-stone-600 text-right text-[11px]">
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
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <span className="text-[10px] text-stone-500 uppercase block">Client Build Mode</span>
              <span className="text-stone-900 font-semibold">{import.meta.env.MODE}</span>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <span className="text-[10px] text-stone-500 uppercase block">Local Timezone</span>
              <span className="text-stone-900 font-semibold">
                {Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <span className="text-[10px] text-stone-500 uppercase block">Secret Protection</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" /> Enforced (Zero Secrets)
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-300">
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
              className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-100/90 hover:border-[#EE602C]/40 transition-all flex flex-col justify-between space-y-3 group shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900 group-hover:text-[#EE602C] transition-colors">
                    Swagger UI Docs
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#EE602C] transition-colors" />
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                  Interactive API browser with live endpoint testing.
                </p>
              </div>
              <span className="text-[10px] font-mono text-stone-400">/docs</span>
            </a>

            <a
              href={redocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-100/90 hover:border-[#EE602C]/40 transition-all flex flex-col justify-between space-y-3 group shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900 group-hover:text-[#EE602C] transition-colors">
                    ReDoc Reference
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#EE602C] transition-colors" />
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                  Comprehensive three-panel technical API specifications.
                </p>
              </div>
              <span className="text-[10px] font-mono text-stone-400">/redoc</span>
            </a>

            <a
              href={openApiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-100/90 hover:border-[#EE602C]/40 transition-all flex flex-col justify-between space-y-3 group shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900 group-hover:text-[#EE602C] transition-colors">
                    OpenAPI JSON Schema
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#EE602C] transition-colors" />
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                  Machine-readable OpenAPI 3.1 specification schema.
                </p>
              </div>
              <span className="text-[10px] font-mono text-stone-400">/openapi.json</span>
            </a>

            <a
              href={healthUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-4 rounded-xl border border-stone-200 bg-stone-50/70 hover:bg-stone-100/90 hover:border-[#EE602C]/40 transition-all flex flex-col justify-between space-y-3 group shadow-2xs"
            >
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-stone-900 group-hover:text-[#EE602C] transition-colors">
                    Live Health Endpoint
                  </span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#EE602C] transition-colors" />
                </div>
                <p className="text-[11px] text-stone-600 leading-relaxed font-sans">
                  Direct raw JSON response from GET /api/health.
                </p>
              </div>
              <span className="text-[10px] font-mono text-stone-400">/api/health</span>
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
