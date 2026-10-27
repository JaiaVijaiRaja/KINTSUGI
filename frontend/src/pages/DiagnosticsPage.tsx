import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Download,
  Server,
  Database,
  Wrench,
  Lock,
  HelpCircle,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { apiService } from '../services/api';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import { reconstructionService } from '../services/reconstructionService';
import { evaluationService } from '../services/evaluationService';
import { auditService } from '../services/auditService';
import type { HealthResponse } from '../types/api';
import type { HashChainVerificationResponse } from '../types/audit';

interface DiagnosticSummary {
  health: HealthResponse | null;
  latencyMs: number | null;
  totalDatasets: number;
  totalPipelines: number;
  totalReconstructions: number;
  totalEvaluations: number;
  auditVerification: HashChainVerificationResponse | null;
  auditEventCount: number;
  timestamp: string;
}

export const DiagnosticsPage: React.FC = () => {
  const [diagnostics, setDiagnostics] = useState<DiagnosticSummary>({
    health: null,
    latencyMs: null,
    totalDatasets: 0,
    totalPipelines: 0,
    totalReconstructions: 0,
    totalEvaluations: 0,
    auditVerification: null,
    auditEventCount: 0,
    timestamp: new Date().toISOString(),
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchDiagnostics = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [
        healthRes,
        datasetsRes,
        pipelinesRes,
        reconstructionRes,
        evaluationsRes,
        auditVerifyRes,
        auditEventsRes,
      ] = await Promise.allSettled([
        apiService.checkHealth(5000),
        datasetService.listDatasets(),
        pipelineService.listConfigs(),
        reconstructionService.listRuns(undefined, undefined, 100, 0),
        evaluationService.listEvaluations(undefined, undefined, 100, 0),
        auditService.verifyHashChain(),
        auditService.listEvents({ limit: 1 }),
      ]);

      setDiagnostics({
        health: healthRes.status === 'fulfilled' ? healthRes.value.data : null,
        latencyMs: healthRes.status === 'fulfilled' ? healthRes.value.latencyMs : null,
        totalDatasets:
          datasetsRes.status === 'fulfilled' ? datasetsRes.value.datasets.length : 0,
        totalPipelines:
          pipelinesRes.status === 'fulfilled' ? pipelinesRes.value.pipelines.length : 0,
        totalReconstructions:
          reconstructionRes.status === 'fulfilled' ? reconstructionRes.value.total : 0,
        totalEvaluations:
          evaluationsRes.status === 'fulfilled' ? evaluationsRes.value.total : 0,
        auditVerification:
          auditVerifyRes.status === 'fulfilled' ? auditVerifyRes.value : null,
        auditEventCount:
          auditEventsRes.status === 'fulfilled' ? auditEventsRes.value.total : 0,
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDiagnostics();
  }, [fetchDiagnostics]);

  const handleExportReport = () => {
    const reportData = {
      system: 'KINTSUGI — Confidence-Aware Self-Healing Industrial Data Pipeline',
      phase: 'Phase 10 Verified',
      generated_at: diagnostics.timestamp,
      runtime_diagnostics: {
        backend_status: diagnostics.health ? 'Operational' : 'Unavailable',
        latency_ms: diagnostics.latencyMs,
        active_datasets: diagnostics.totalDatasets,
        configured_pipelines: diagnostics.totalPipelines,
        reconstruction_runs: diagnostics.totalReconstructions,
        evaluation_benchmarks: diagnostics.totalEvaluations,
      },
      audit_integrity: {
        hash_chain_valid: diagnostics.auditVerification?.is_valid ?? false,
        total_events: diagnostics.auditEventCount,
        verified_at: diagnostics.auditVerification?.verified_at ?? null,
      },
      integrity_guarantees: [
        'Raw telemetry readings are permanently immutable and preserved.',
        'Extrapolation beyond sensor operational boundaries is strictly prohibited.',
        'Continuous communication dropouts exceeding 5 samples abstain as UNRESOLVED.',
        'Confidence scores are evidence-grounded mathematical assessments, never simulated probabilities.',
      ],
      known_operational_constraints: [
        'Isolation Forest requires minimum sample size (>20 rows) for stable estimator convergence.',
        'Zero-variance freeze detector requires minimum 3-tick threshold.',
        'Audit trail verifies against local SHA-256 hash chains, not external decentralized networks.',
      ],
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `kintsugi_diagnostic_report_${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const isAuditValid = diagnostics.auditVerification?.is_valid;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnostic Report"
        description="Comprehensive real-time system diagnostic audit, operational pipeline telemetry verification, cryptographic ledger status, and safety constraints."
        badge="Phase 10 Live"
        badgeVariant="emerald"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchDiagnostics}
              loading={isLoading}
              icon={RefreshCw}
            >
              Run Diagnostic
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleExportReport}
              icon={Download}
            >
              Export JSON Report
            </Button>
          </div>
        }
      />

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-3">
          <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
          <span>Diagnostic error: {errorMsg}</span>
        </div>
      )}

      {/* Top 4 Real Operational Diagnostic Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Backend Runtime */}
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
              <span className="flex items-center gap-1.5">
                <Server className="w-3.5 h-3.5 text-[#EE602C]" />
                FastAPI Runtime
              </span>
              <span className="text-[10px] uppercase font-bold text-emerald-700">
                {diagnostics.health ? 'Operational' : 'Unavailable'}
              </span>
            </div>
            <div className="text-xl font-bold text-stone-900 font-mono">
              {diagnostics.latencyMs !== null ? `${diagnostics.latencyMs} ms` : 'Not available'}
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Average round-trip health ping latency to Python core.
            </p>
          </CardContent>
        </Card>

        {/* Card 2: Datasets & Schema */}
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
              <span className="flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-[#EE602C]" />
                Dataset Storage
              </span>
              <span className="text-[10px] uppercase font-bold text-stone-700">
                Active Catalog
              </span>
            </div>
            <div className="text-xl font-bold text-stone-900 font-mono">
              {diagnostics.totalDatasets} Datasets
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Ingested industrial CSV files with verified schema.
            </p>
          </CardContent>
        </Card>

        {/* Card 3: Reconstruction Engine */}
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
              <span className="flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-[#EE602C]" />
                Self-Healing Engine
              </span>
              <span className="text-[10px] uppercase font-bold text-stone-700">
                Executed Runs
              </span>
            </div>
            <div className="text-xl font-bold text-stone-900 font-mono">
              {diagnostics.totalReconstructions} Runs
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Confidence-weighted repair runs with recorded decisions.
            </p>
          </CardContent>
        </Card>

        {/* Card 4: SHA-256 Hash Chain */}
        <Card>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
              <span className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#EE602C]" />
                Audit Chain Integrity
              </span>
              <span
                className={`text-[10px] uppercase font-bold ${
                  isAuditValid ? 'text-emerald-700' : 'text-amber-700'
                }`}
              >
                {isAuditValid ? 'Verified' : 'Pending Check'}
              </span>
            </div>
            <div className="text-xl font-bold text-stone-900 font-mono">
              {diagnostics.auditEventCount} Events
            </div>
            <p className="text-[11px] text-stone-500 leading-tight">
              Immutable SHA-256 append-only ledger entries verified.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Diagnostic Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Integrity Guarantees & Verification */}
        <Card>
          <CardHeader
            title="System Integrity & Safety Standards"
            subtitle="Deterministic mathematical constraints and provenance policies"
            icon={ShieldCheck}
          />
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Raw Telemetry Immutability
                </span>
                <p className="text-stone-600 leading-relaxed">
                  Raw sensor telemetry is never altered in-place. Repaired datasets exist as separate downstream streams with complete before-and-after provenance.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Zero Hallucination / Boundary Abstention
                </span>
                <p className="text-stone-600 leading-relaxed">
                  When anomalies occur at sequence boundaries (Row 0) or span communication gaps &gt; 5 rows, algorithms strictly abstain as UNRESOLVED rather than inventing values.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-stone-50 border border-stone-200">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Mathematical Confidence Scoring
                </span>
                <p className="text-stone-600 leading-relaxed">
                  Confidence scores combine multi-detector consensus, residual variance, and local context window completeness into a normalized 0-100 evidence metric.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Panel 2: Operational Bounds & Known Limitations */}
        <Card>
          <CardHeader
            title="Operational Bounds & Known Limitations"
            subtitle="Transparent engineering constraints of the pipeline"
            icon={AlertTriangle}
          />
          <CardContent className="space-y-3">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Local Cryptographic Ledger Scope
                </span>
                <p className="text-stone-600 leading-relaxed">
                  The SHA-256 audit chain provides tamper-evident local hash sequencing. It proves internal integrity across runs but is not a globally distributed blockchain.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Ground Truth Requirement for Benchmarks
                </span>
                <p className="text-stone-600 leading-relaxed">
                  F1 score, Precision, and Mean Absolute Error (MAE) can only be computed when a validated ground-truth baseline is uploaded. The system does not assume repaired values are ground truth.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
              <HelpCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <span className="font-semibold text-stone-800">
                  Single-Sensor Fallback Limits
                </span>
                <p className="text-stone-600 leading-relaxed">
                  Single-channel anomalies rely on rolling statistical MAD and local median imputation. Without cross-correlated channels, confidence evidence is capped at 75%.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
