import React, { useState, useEffect, useCallback } from 'react';
import type { ConnectionState } from '../types/api';
import {
  Server,
  Activity,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  Database,
  Sliders,
  ShieldAlert,
  Wrench,
  History,
  Award,
  ArrowRight,
  GitBranch,
  ShieldCheck,
  Lock,
  Eye,
  AlertTriangle,
  Upload,
} from 'lucide-react';
import { apiService } from '../services/api';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import { reconstructionService } from '../services/reconstructionService';
import { evaluationService } from '../services/evaluationService';
import { auditService } from '../services/auditService';
import { useRouter } from '../router';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import type { DatasetMetadata } from '../types/dataset';
import type { PipelineConfig } from '../types/pipeline';
import type { ReconstructionRun } from '../types/reconstruction';
import type { EvaluationSummaryItem } from '../types/evaluation';
import type { AuditEvent } from '../types/audit';

interface OverviewPageProps {
  connection: ConnectionState;
  onRetry: () => void;
}

interface DashboardMetrics {
  totalDatasets: number;
  totalPipelines: number;
  totalDetectionRuns: number;
  totalAnomaliesDetected: number;
  totalReconstructionRuns: number;
  totalCorrected: number;
  totalUnresolved: number;
  totalEstimated: number;
  totalEvaluations: number;
  benchmarkModeCount: number;
  existingRunModeCount: number;
  totalAuditEvents: number;
  isHashChainValid: boolean | null;
}

export const OverviewPage: React.FC<OverviewPageProps> = ({ connection, onRetry }) => {
  const { navigate } = useRouter();
  const apiUrl = `${apiService.getBaseUrl()}/api/health`;

  // Live System State
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalDatasets: 0,
    totalPipelines: 0,
    totalDetectionRuns: 0,
    totalAnomaliesDetected: 0,
    totalReconstructionRuns: 0,
    totalCorrected: 0,
    totalUnresolved: 0,
    totalEstimated: 0,
    totalEvaluations: 0,
    benchmarkModeCount: 0,
    existingRunModeCount: 0,
    totalAuditEvents: 0,
    isHashChainValid: null,
  });

  const [recentEvents, setRecentEvents] = useState<AuditEvent[]>([]);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState<boolean>(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  // Fetch real data from all backend services
  const loadDashboardData = useCallback(async () => {
    setIsLoadingMetrics(true);
    setMetricsError(null);

    try {
      const [
        datasetsRes,
        pipelinesRes,
        reconstructionRes,
        evaluationsRes,
        auditEventsRes,
        verifyRes,
      ] = await Promise.allSettled([
        datasetService.listDatasets(),
        pipelineService.listConfigs(),
        reconstructionService.listRuns(undefined, undefined, 100, 0),
        evaluationService.listEvaluations(undefined, undefined, 100, 0),
        auditService.listEvents({ limit: 8 }),
        auditService.verifyHashChain(),
      ]);

      const datasets: DatasetMetadata[] =
        datasetsRes.status === 'fulfilled' ? datasetsRes.value.datasets : [];
      const pipelines: PipelineConfig[] =
        pipelinesRes.status === 'fulfilled' ? pipelinesRes.value.pipelines : [];
      const reconstructionRuns: ReconstructionRun[] =
        reconstructionRes.status === 'fulfilled' ? reconstructionRes.value.runs : [];
      const evaluations: EvaluationSummaryItem[] =
        evaluationsRes.status === 'fulfilled' ? evaluationsRes.value.evaluations : [];
      const totalEvaluationsCount =
        evaluationsRes.status === 'fulfilled' ? evaluationsRes.value.total : 0;
      const auditEvents: AuditEvent[] =
        auditEventsRes.status === 'fulfilled' ? auditEventsRes.value.events : [];
      const totalAuditCount =
        auditEventsRes.status === 'fulfilled' ? auditEventsRes.value.total : 0;
      const isHashChainValid =
        verifyRes.status === 'fulfilled' ? verifyRes.value.is_valid : null;

      // Calculate aggregated observation outcomes across all historical reconstruction runs
      let totalCorrected = 0;
      let totalUnresolved = 0;
      let totalEstimated = 0;
      for (const run of reconstructionRuns) {
        if (run.summary) {
          totalCorrected += run.summary.corrected_count || 0;
          totalUnresolved += run.summary.unresolved_count || 0;
          totalEstimated += run.summary.estimated_count || 0;
        }
      }

      // Query detection runs for saved pipelines (first 5)
      let totalDetectionRuns = 0;
      let totalAnomaliesDetected = 0;
      if (pipelines.length > 0) {
        try {
          const runResults = await Promise.allSettled(
            pipelines.slice(0, 5).map((p) => pipelineService.listPipelineRuns(p.configuration_id))
          );
          for (const res of runResults) {
            if (res.status === 'fulfilled') {
              totalDetectionRuns += res.value.runs.length;
              for (const r of res.value.runs) {
                totalAnomaliesDetected += r.summary?.total_anomalies_detected || 0;
              }
            }
          }
        } catch {
          // Non-blocking detection run count
        }
      }

      const benchmarkModeCount = evaluations.filter(
        (e) => e.evaluation_mode === 'mode_a_benchmark'
      ).length;
      const existingRunModeCount = evaluations.filter(
        (e) => e.evaluation_mode === 'mode_b_existing_run'
      ).length;

      setMetrics({
        totalDatasets: datasets.length,
        totalPipelines: pipelines.length,
        totalDetectionRuns,
        totalAnomaliesDetected,
        totalReconstructionRuns: reconstructionRuns.length,
        totalCorrected,
        totalUnresolved,
        totalEstimated,
        totalEvaluations: totalEvaluationsCount,
        benchmarkModeCount,
        existingRunModeCount,
        totalAuditEvents: totalAuditCount,
        isHashChainValid,
      });

      setRecentEvents(auditEvents);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMetricsError(msg);
    } finally {
      setIsLoadingMetrics(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const pipelineStages = [
    {
      num: '01',
      title: 'Sensor Ingestion',
      phase: 'Phase 3 (Operational)',
      desc: 'High-frequency telemetry ingestion (CSV) with schema and quality validation.',
    },
    {
      num: '02',
      title: 'Pipeline Configuration',
      phase: 'Phase 4 (Operational)',
      desc: 'Channel mapping, robust detection bounds, and persistent versioned configurations.',
    },
    {
      num: '03',
      title: 'Anomaly Detection',
      phase: 'Phase 5 (Operational)',
      desc: 'Rolling MAD and Isolation Forest detectors with multi-detector consensus.',
    },
    {
      num: '04',
      title: 'Signal Reconstruction',
      phase: 'Phase 6 (Operational)',
      desc: 'Contextual signal healing while preserving original raw telemetry.',
    },
    {
      num: '05',
      title: 'Confidence Engine',
      phase: 'Phase 6 (Operational)',
      desc: 'Evidence-based confidence scoring; strictly abstains when evidence is insufficient.',
    },
    {
      num: '06',
      title: 'Benchmark Evaluation',
      phase: 'Phase 7 (Operational)',
      desc: 'Precision, recall, MAE, and RMSE benchmarking against synthetic fault suites.',
    },
    {
      num: '07',
      title: 'Auditable Ledger',
      phase: 'Phase 8 (Operational)',
      desc: 'Append-only SHA-256 cryptographic hash-chain ledger with causal trace provenance.',
    },
  ];

  const quickNavModules = [
    {
      title: 'Dataset Management',
      path: '/datasets',
      icon: Database,
      desc: 'Register multi-sensor CSV datasets and inspect data quality schemas.',
      phase: 'Phase 3 Live',
    },
    {
      title: 'Pipeline Configuration',
      path: '/pipeline',
      icon: Sliders,
      desc: 'Configure channel mapping, outlier bounds, and signal healing policies.',
      phase: 'Phase 4 Live',
    },
    {
      title: 'Anomaly Explorer',
      path: '/anomalies',
      icon: ShieldAlert,
      desc: 'Inspect detected signal anomalies with multivariate time-series overlays.',
      phase: 'Phase 5 Live',
    },
    {
      title: 'Reconstruction Studio',
      path: '/reconstruction',
      icon: Wrench,
      desc: 'Compare raw versus healed readings and review confidence statuses.',
      phase: 'Phase 6 Live',
    },
    {
      title: 'Evaluation Center',
      path: '/evaluation',
      icon: Award,
      desc: 'Examine precision, recall, MAE, and RMSE against benchmark datasets.',
      phase: 'Phase 7 Live',
    },
    {
      title: 'Audit Trail',
      path: '/audit',
      icon: History,
      desc: 'Query append-only hash-chain ledger entries preserving full traceability.',
      phase: 'Phase 8 Live',
    },
  ];

  const renderEventTypeBadge = (type: string) => {
    switch (type) {
      case 'DATASET_UPLOADED':
      case 'DATASET_VALIDATED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800">
            {type}
          </span>
        );
      case 'PIPELINE_CREATED':
      case 'PIPELINE_UPDATED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-800">
            {type}
          </span>
        );
      case 'DETECTION_RUN_COMPLETED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-200 border border-amber-500/40">
            {type}
          </span>
        );
      case 'RECONSTRUCTION_RUN_COMPLETED':
      case 'OBSERVATION_CORRECTED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800">
            {type}
          </span>
        );
      case 'OBSERVATION_UNRESOLVED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-800">
            {type}
          </span>
        );
      case 'EVALUATION_COMPLETED':
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800">
            {type}
          </span>
        );
      default:
        return (
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            {type}
          </span>
        );
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Context Header */}
      <PageHeader
        title="System Overview"
        description="Confidence-Aware, Self-Healing Industrial Data Pipeline. Real-time system metrics, non-negotiable data integrity invariants, and operational status."
        badge="Phase 10 Demonstration Ready"
        badgeVariant="primary"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onRetry();
                loadDashboardData();
              }}
              loading={connection.status === 'loading' || isLoadingMetrics}
              icon={RefreshCw}
            >
              Refresh Dashboard
            </Button>
          </div>
        }
      />

      {/* Project Philosophy & Architectural Boundary Alert */}
      {metricsError && (
        <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          Telemetry registry notice: {metricsError}
        </div>
      )}

      <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5 backdrop-blur-xs">
        <div className="flex items-start gap-3.5">
          <div className="p-2 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-semibold text-amber-300 font-mono tracking-wide uppercase">
                KINTSUGI Non-Negotiable Invariants
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-medium">
                Core Philosophy
              </span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-4xl">
              Like the Japanese art of <em>Kintsugi</em> (repairing broken ceramics with gold lacquer), KINTSUGI treats signal repairs with complete transparency. 
              <strong> Original raw sensor telemetry is never overwritten or discarded.</strong> Every proposed reconstruction carries an evidence-based confidence score, and when evidence is insufficient, the pipeline strictly abstains by recording <span className="text-amber-300 font-semibold font-mono">UNRESOLVED</span> rather than guessing.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* LIVE OPERATIONAL KPI GRID (Real Backend Populations & Clear Scopes) */}
      {/* ========================================================================= */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wide font-mono">
              Pipeline Operational Metrics
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-500">
            Source: Live Backend Storage Registries
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          {/* Card 1: Registered Datasets */}
          <div
            onClick={() => navigate('/datasets')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-amber-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Datasets
              </span>
              <Database className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics.totalDatasets}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: Catalog Population
            </div>
          </div>

          {/* Card 2: Pipeline Configurations */}
          <div
            onClick={() => navigate('/pipeline')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-amber-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Pipelines
              </span>
              <Sliders className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics.totalPipelines}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: Config Registry
            </div>
          </div>

          {/* Card 3: Reconstruction Executions */}
          <div
            onClick={() => navigate('/reconstruction')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-amber-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Repair Runs
              </span>
              <Wrench className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics.totalReconstructionRuns}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: Historical Runs
            </div>
          </div>

          {/* Card 4: Accepted Signal Repairs */}
          <div
            onClick={() => navigate('/reconstruction')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-emerald-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Accepted (CORRECTED)
              </span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {metrics.totalCorrected}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: All Evaluated Readings
            </div>
          </div>

          {/* Card 5: Explicit Abstentions */}
          <div
            onClick={() => navigate('/reconstruction')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-rose-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Abstained (UNRESOLVED)
              </span>
              <AlertTriangle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {metrics.totalUnresolved}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: Insufficient Evidence
            </div>
          </div>

          {/* Card 6: Benchmark Evaluations */}
          <div
            onClick={() => navigate('/evaluation')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-purple-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Evaluations
              </span>
              <Award className="w-4 h-4 text-purple-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics.totalEvaluations}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: {metrics.benchmarkModeCount} Mode A • {metrics.existingRunModeCount} Mode B
            </div>
          </div>

          {/* Card 7: Cryptographic Audit Ledger */}
          <div
            onClick={() => navigate('/audit')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 hover:border-amber-500/40 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Audit Events
              </span>
              <History className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {metrics.totalAuditEvents}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: Append-Only Ledger
            </div>
          </div>

          {/* Card 8: SHA-256 Ledger Tamper Status */}
          <div
            onClick={() => navigate('/audit')}
            className="p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/80 transition-all cursor-pointer group space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono text-slate-400 uppercase tracking-wider">
                Ledger Proof
              </span>
              <Lock className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-lg font-bold font-mono mt-1">
              {metrics.isHashChainValid === null ? (
                <span className="text-slate-500">Verifying...</span>
              ) : metrics.isHashChainValid ? (
                <span className="text-emerald-400 flex items-center gap-1.5 text-base">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  VERIFIED
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1.5 text-base">
                  <XCircle className="w-4 h-4 shrink-0" />
                  TAMPERED
                </span>
              )}
            </div>
            <div className="text-[10px] font-mono text-slate-500">
              Scope: SHA-256 Continuity
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* RECENT PIPELINE RUNS & OPERATIONAL ACTIVITY (Live Stream) */}
      {/* ========================================================================= */}
      <Card>
        <CardHeader
          title="Recent Pipeline Activity Stream"
          subtitle="Chronological audit records queried from the immutable SHA-256 ledger"
          icon={Activity}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Live Ledger Stream
            </span>
          }
          action={
            <Button
              variant="outline"
              size="sm"
              icon={History}
              onClick={() => navigate('/audit')}
            >
              Open Audit Trail
            </Button>
          }
        />
        <CardContent>
          {recentEvents.length === 0 ? (
            <EmptyState
              icon={Upload}
              title="No Pipeline Runs Recorded Yet"
              description="No sensor datasets or execution runs have been recorded in the persistent ledger. Upload an industrial CSV dataset to initiate the confidence-aware data pipeline."
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={Database}
                  onClick={() => navigate('/datasets')}
                >
                  Upload First Telemetry Dataset
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden font-mono">
                <thead className="bg-slate-950 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Seq #</th>
                    <th className="py-2.5 px-3">Timestamp (UTC)</th>
                    <th className="py-2.5 px-3">Event Type</th>
                    <th className="py-2.5 px-3">Target Entity</th>
                    <th className="py-2.5 px-3">Sensor / Channel</th>
                    <th className="py-2.5 px-3">Outcome</th>
                    <th className="py-2.5 px-3">Decision Reason</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {recentEvents.map((evt) => (
                    <tr
                      key={evt.event_id}
                      className="hover:bg-slate-900/40 transition-colors"
                    >
                      <td className="py-2.5 px-3 font-semibold text-slate-400">
                        #{evt.sequence_number}
                      </td>
                      <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                        {evt.timestamp
                          ? new Date(evt.timestamp).toISOString().replace('T', ' ').slice(0, 19)
                          : '—'}
                      </td>
                      <td className="py-2.5 px-3">
                        {renderEventTypeBadge(evt.event_type)}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 text-[11px] truncate max-w-[130px]">
                        {evt.dataset_id || evt.pipeline_id || evt.detection_run_id || evt.reconstruction_run_id || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-200">
                        {evt.sensor_column || <span className="text-slate-600">—</span>}
                      </td>
                      <td className="py-2.5 px-3">
                        {evt.new_status ? (
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              evt.new_status === 'CORRECTED'
                                ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800'
                                : evt.new_status === 'UNRESOLVED'
                                ? 'bg-rose-950/60 text-rose-300 border border-rose-800'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {evt.new_status}
                          </span>
                        ) : (
                          <span className="text-slate-500">{evt.processing_outcome || '—'}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate font-sans text-xs">
                        {evt.decision_reason || evt.error_details || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={Eye}
                          onClick={() => navigate('/audit')}
                          title="Inspect in Audit Trail"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Live Backend API Health Card */}
      <Card>
        <CardHeader
          title="Backend API Health & Service Contract"
          subtitle="Real-time operational status queried from the live FastAPI health endpoint"
          icon={Server}
          badge={
            <span className="text-xs font-mono text-slate-400">
              GET /api/health
            </span>
          }
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={onRetry}
              disabled={connection.status === 'loading'}
              icon={RefreshCw}
              loading={connection.status === 'loading'}
            >
              {connection.status === 'loading' ? 'Probing...' : 'Probe API'}
            </Button>
          }
        />
        <CardContent>
          <div className="space-y-4">
            <div className="text-xs text-slate-400 font-mono">
              Target Endpoint: <span className="text-slate-200">{apiUrl}</span>
            </div>

            {connection.status === 'connected' && connection.data && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span className="text-sm font-semibold tracking-wide">
                    FastAPI Service is Online and Operational
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">
                      Service Identifier
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-200 mt-0.5 block truncate">
                      {connection.data.service}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">
                      API Version
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-200 mt-0.5 block">
                      v{connection.data.version}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">
                      Environment
                    </span>
                    <span className="text-xs font-mono font-medium text-emerald-400 mt-0.5 block capitalize">
                      {connection.data.environment}
                    </span>
                  </div>
                  <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
                    <span className="text-[10px] uppercase font-mono text-slate-400 block">
                      Roundtrip Latency
                    </span>
                    <span className="text-xs font-mono font-medium text-amber-400 mt-0.5 block">
                      {connection.latencyMs !== null ? `${connection.latencyMs} ms` : '—'}
                    </span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-800/60">
                  <span>Server UTC: {connection.data.timestamp}</span>
                  <span>
                    Last verified: {connection.lastChecked ? connection.lastChecked.toLocaleTimeString() : '—'}
                  </span>
                </div>
              </div>
            )}

            {connection.status === 'loading' && (
              <div className="py-6 flex flex-col items-center justify-center space-y-3">
                <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
                <p className="text-xs font-semibold text-slate-200">
                  Probing backend API endpoint at {apiUrl}...
                </p>
              </div>
            )}

            {(connection.status === 'disconnected' || connection.status === 'error') && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 text-rose-400 bg-rose-950/30 border border-rose-900/60 rounded-lg p-4">
                  <XCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Backend API Unreachable</p>
                    <p className="text-xs text-rose-300/90 leading-relaxed font-mono">
                      {connection.error || 'Failed to establish HTTP connection with backend API.'}
                    </p>
                  </div>
                </div>

                <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                    <Terminal className="w-4 h-4 text-amber-400" />
                    <span>Actionable Recovery Steps</span>
                  </div>
                  <ol className="text-xs text-slate-400 space-y-1.5 list-decimal list-inside pl-1">
                    <li>Start the FastAPI backend service from your terminal:</li>
                    <li className="font-mono text-[11px] text-amber-300/90 bg-slate-900 px-2 py-1 rounded inline-block">
                      .\backend\.venv\Scripts\uvicorn.exe app.main:app --port 8000 --reload
                    </li>
                    <li>Verify frontend configuration in <code className="text-slate-200">.env</code>: <code className="text-slate-200">VITE_API_BASE_URL=http://127.0.0.1:8000</code>.</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Quick Navigation to Main Modules */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Activity className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-200 uppercase tracking-wide font-mono">
              Pipeline Navigation
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            All 8 Modules Operational
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickNavModules.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.path}
                type="button"
                onClick={() => navigate(mod.path)}
                className="group rounded-xl border border-slate-800 bg-slate-900/40 hover:bg-slate-900/70 hover:border-amber-500/40 p-5 text-left transition-all duration-150 flex flex-col justify-between space-y-3 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="p-2 rounded-lg bg-slate-800 text-amber-400 group-hover:bg-amber-500/10 transition-colors">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 group-hover:text-amber-300">
                      {mod.phase}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-200 group-hover:text-amber-300 transition-colors">
                      {mod.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {mod.desc}
                    </p>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-400 group-hover:text-slate-200">
                  <span className="font-mono text-[11px]">Open Module</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-400 transform group-hover:translate-x-1 transition-transform" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pipeline Workflow Architecture */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <GitBranch className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-200 uppercase tracking-wide font-mono">
              Industrial Pipeline Workflow
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            7 End-to-End Stages
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pipelineStages.map((stage) => (
            <div
              key={stage.num}
              className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 space-y-2.5 hover:border-slate-700 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-amber-400">
                  {stage.num}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                  {stage.phase}
                </span>
              </div>
              <h3 className="text-sm font-semibold text-slate-200">
                {stage.title}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {stage.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
