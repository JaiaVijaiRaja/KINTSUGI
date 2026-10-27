import React, { useState, useEffect, useCallback } from 'react';
import {
  History,
  ShieldCheck,
  Filter,
  Lock,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Eye,
  RefreshCw,
  FileText,
  Database,
  GitCommit,
  Cpu,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Download,
  Activity,
  Sparkles,
  Info,
  Sliders,
  ShieldAlert,
  Wrench,
  Award,
} from 'lucide-react';
import { useRouter } from '../router';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { auditService } from '../services/auditService';
import { datasetService } from '../services/datasetService';
import type {
  AuditEvent,
  AuditEventType,
  CausalTraceResponse,
  HashChainVerificationResponse,
  ObservationHistoryResponse,
} from '../types/audit';
import type { DatasetMetadata } from '../types/dataset';

type TabMode = 'explorer' | 'trace' | 'observation' | 'integrity' | 'export';

export const AuditPage: React.FC = () => {
  const { navigate } = useRouter();
  const [activeTab, setActiveTab] = useState<TabMode>('explorer');

  // Datasets for filter dropdown
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);

  // Explorer State
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [totalEvents, setTotalEvents] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [page, setPage] = useState(0);
  const limit = 25;

  // Filters
  const [filterDataset, setFilterDataset] = useState('');
  const [filterEventType, setFilterEventType] = useState('');
  const [filterSensor, setFilterSensor] = useState('');
  const [filterRunId, setFilterRunId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Selected Event Detail Modal
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Causal Trace State
  const [traceResultId, setTraceResultId] = useState('');
  const [activeTrace, setActiveTrace] = useState<CausalTraceResponse | null>(null);
  const [loadingTrace, setLoadingTrace] = useState(false);
  const [traceError, setTraceError] = useState<string | null>(null);

  // Observation History State
  const [obsDatasetId, setObsDatasetId] = useState('');
  const [obsRowIndex, setObsRowIndex] = useState<number>(0);
  const [activeObsHistory, setActiveObsHistory] = useState<ObservationHistoryResponse | null>(null);
  const [loadingObsHistory, setLoadingObsHistory] = useState(false);
  const [obsError, setObsError] = useState<string | null>(null);

  // Hash-Chain Integrity State
  const [verificationResult, setVerificationResult] = useState<HashChainVerificationResponse | null>(null);
  const [verifyingChain, setVerifyingChain] = useState(false);

  // Export State
  const [exportFormat, setExportFormat] = useState<'jsonl' | 'csv'>('jsonl');
  const [exporting, setExporting] = useState(false);

  // Load Datasets
  useEffect(() => {
    datasetService.listDatasets().then((res) => {
      setDatasets(res.datasets);
      if (res.datasets.length > 0 && !obsDatasetId) {
        setObsDatasetId(res.datasets[0].dataset_id);
      }
    }).catch((err) => {
      console.error('Failed to load datasets', err);
    });
  }, [obsDatasetId]);

  // Load Events
  const fetchEvents = useCallback(async () => {
    setLoadingEvents(true);
    try {
      const res = await auditService.listEvents({
        dataset_id: filterDataset || undefined,
        event_type: filterEventType || undefined,
        sensor_column: filterSensor || undefined,
        run_id: filterRunId || undefined,
        status: filterStatus || undefined,
        limit,
        offset: page * limit,
      });
      setEvents(res.events);
      setTotalEvents(res.total);
    } catch (err) {
      console.error('Failed to load audit events', err);
    } finally {
      setLoadingEvents(false);
    }
  }, [filterDataset, filterEventType, filterSensor, filterRunId, filterStatus, page]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Run Hash Chain Verification
  const runVerification = async () => {
    setVerifyingChain(true);
    try {
      const res = await auditService.verifyHashChain();
      setVerificationResult(res);
    } catch (err) {
      console.error('Failed to verify chain', err);
    } finally {
      setVerifyingChain(false);
    }
  };

  // Run Causal Trace Search
  const handleFetchTrace = async (idToFetch?: string) => {
    const targetId = idToFetch || traceResultId;
    if (!targetId.trim()) return;
    setLoadingTrace(true);
    setTraceError(null);
    try {
      const trace = await auditService.getCausalTrace(targetId.trim());
      setActiveTrace(trace);
      setActiveTab('trace');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to assemble causal trace';
      setTraceError(msg);
      setActiveTrace(null);
    } finally {
      setLoadingTrace(false);
    }
  };

  // Run Observation History Search
  const handleFetchObsHistory = async () => {
    if (!obsDatasetId) return;
    setLoadingObsHistory(true);
    setObsError(null);
    try {
      const hist = await auditService.getObservationHistory(obsDatasetId, Number(obsRowIndex));
      setActiveObsHistory(hist);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to fetch observation history';
      setObsError(msg);
      setActiveObsHistory(null);
    } finally {
      setLoadingObsHistory(false);
    }
  };

  // Trigger Export
  const handleExport = async () => {
    setExporting(true);
    try {
      await auditService.downloadExport(
        {
          dataset_id: filterDataset || undefined,
          event_type: filterEventType || undefined,
          sensor_column: filterSensor || undefined,
          run_id: filterRunId || undefined,
          status: filterStatus || undefined,
        },
        exportFormat
      );
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(label);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Render Event Type Badge
  const renderEventTypeBadge = (type: AuditEventType) => {
    let bg = 'bg-slate-800 text-slate-300 border-slate-700';
    if (type.startsWith('DATASET_')) {
      bg = 'bg-sky-950/60 text-sky-300 border-sky-800';
    } else if (type.startsWith('PIPELINE_')) {
      bg = 'bg-indigo-950/60 text-indigo-300 border-indigo-800';
    } else if (type.startsWith('DETECTION_')) {
      bg = 'bg-purple-950/60 text-purple-300 border-purple-800';
    } else if (type === 'ANOMALY_DETECTED') {
      bg = 'bg-amber-950/70 text-amber-300 border-amber-800 font-semibold';
    } else if (type === 'CORRECTION_ACCEPTED') {
      bg = 'bg-emerald-950/70 text-emerald-300 border-emerald-800 font-semibold';
    } else if (type === 'RECONSTRUCTION_UNRESOLVED') {
      bg = 'bg-rose-950/70 text-rose-300 border-rose-800';
    } else if (type.startsWith('REVIEW_')) {
      bg = 'bg-teal-950/60 text-teal-300 border-teal-800';
    } else if (type.startsWith('EVALUATION_')) {
      bg = 'bg-cyan-950/60 text-cyan-300 border-cyan-800';
    }

    return (
      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${bg}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Audit Trail & Explainability Engine"
        description="Append-only cryptographic ledger tracking every dataset ingestion, anomaly detection, repair proposal, confidence breakdown, and policy commit."
        badge="Cryptographic Ledger Active"
        badgeVariant="emerald"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={ShieldCheck}
              onClick={() => {
                setActiveTab('integrity');
                runVerification();
              }}
              loading={verifyingChain}
            >
              Verify Ledger Chain
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={() => setActiveTab('export')}
            >
              Export Records
            </Button>
          </div>
        }
      />

      {/* Nav Tabs */}
      <div className="flex border-b border-slate-800 space-x-1">
        <button
          onClick={() => setActiveTab('explorer')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'explorer'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Audit Ledger & Events</span>
          <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-slate-800 text-slate-400">
            {totalEvents}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('trace')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'trace'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
          <span>Causal Provenance & Explanations</span>
          {activeTrace && (
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('observation')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'observation'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Observation Row Lifecycle</span>
        </button>

        <button
          onClick={() => setActiveTab('integrity')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'integrity'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Cryptographic Hash Chain</span>
          {verificationResult && (
            <span
              className={`w-2 h-2 rounded-full ${
                verificationResult.is_valid ? 'bg-emerald-400' : 'bg-rose-500 animate-ping'
              }`}
            />
          )}
        </button>

        <button
          onClick={() => setActiveTab('export')}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-medium border-b-2 transition-all ${
            activeTab === 'export'
              ? 'border-emerald-500 text-emerald-400 bg-slate-900/40'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          <span>Compliance Export</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: AUDIT EVENT EXPLORER */}
      {/* ========================================================================= */}
      {activeTab === 'explorer' && (
        <div className="space-y-6">
          {/* Filter Bar */}
          <Card>
            <CardHeader
              title="Audit Filters"
              subtitle="Filter sequential append-only ledger by target dataset, event type, sensor channel, or run ID"
              icon={Filter}
            />
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Dataset</label>
                  <select
                    value={filterDataset}
                    onChange={(e) => {
                      setFilterDataset(e.target.value);
                      setPage(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">All Datasets</option>
                    {datasets.map((d) => (
                      <option key={d.dataset_id} value={d.dataset_id}>
                        {d.filename} ({d.dataset_id.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Event Type</label>
                  <select
                    value={filterEventType}
                    onChange={(e) => {
                      setFilterEventType(e.target.value);
                      setPage(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">All Event Types</option>
                    <option value="DATASET_UPLOADED">DATASET_UPLOADED</option>
                    <option value="DETECTION_RUN_COMPLETED">DETECTION_RUN_COMPLETED</option>
                    <option value="ANOMALY_DETECTED">ANOMALY_DETECTED</option>
                    <option value="RECONSTRUCTION_RUN_COMPLETED">RECONSTRUCTION_RUN_COMPLETED</option>
                    <option value="CORRECTION_ACCEPTED">CORRECTION_ACCEPTED</option>
                    <option value="RECONSTRUCTION_UNRESOLVED">RECONSTRUCTION_UNRESOLVED</option>
                    <option value="REVIEW_APPROVED">REVIEW_APPROVED</option>
                    <option value="REVIEW_REJECTED">REVIEW_REJECTED</option>
                    <option value="EVALUATION_COMPLETED">EVALUATION_COMPLETED</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Sensor Column</label>
                  <input
                    type="text"
                    placeholder="e.g. vibration, temp"
                    value={filterSensor}
                    onChange={(e) => {
                      setFilterSensor(e.target.value);
                      setPage(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Run ID</label>
                  <input
                    type="text"
                    placeholder="e.g. run_... or rec_run_..."
                    value={filterRunId}
                    onChange={(e) => {
                      setFilterRunId(e.target.value);
                      setPage(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Status</label>
                  <select
                    value={filterStatus}
                    onChange={(e) => {
                      setFilterStatus(e.target.value);
                      setPage(0);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="">All Statuses</option>
                    <option value="MEASURED">MEASURED</option>
                    <option value="ESTIMATED">ESTIMATED</option>
                    <option value="CORRECTED">CORRECTED</option>
                    <option value="UNRESOLVED">UNRESOLVED</option>
                    <option value="completed">completed</option>
                    <option value="failed">failed</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events Table */}
          <Card>
            <CardHeader
              title="Sequential Audit Ledger"
              subtitle={`Showing events ${page * limit + 1}–${Math.min((page + 1) * limit, totalEvents)} of ${totalEvents}`}
              icon={History}
              badge={
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">
                    Page {page + 1} of {Math.max(1, Math.ceil(totalEvents / limit))}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={page === 0 || loadingEvents}
                      onClick={() => setPage((p) => Math.max(0, p - 1))}
                      icon={ChevronLeft}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={(page + 1) * limit >= totalEvents || loadingEvents}
                      onClick={() => setPage((p) => p + 1)}
                      icon={ChevronRight}
                    />
                  </div>
                </div>
              }
            />
            <CardContent>
              {loadingEvents ? (
                <div className="py-16 text-center text-xs text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-5 h-5 text-emerald-400 animate-spin" />
                  <span>Loading ledger events from append-only storage...</span>
                </div>
              ) : events.length === 0 ? (
                <EmptyState
                  icon={History}
                  title="No Audit Events Found"
                  description="No audit records match the current filter criteria."
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setFilterDataset('');
                        setFilterEventType('');
                        setFilterSensor('');
                        setFilterRunId('');
                        setFilterStatus('');
                        setPage(0);
                      }}
                    >
                      Clear All Filters
                    </Button>
                  }
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                    <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                      <tr>
                        <th className="py-2.5 px-3">Seq #</th>
                        <th className="py-2.5 px-3">Timestamp (UTC)</th>
                        <th className="py-2.5 px-3">Event Type</th>
                        <th className="py-2.5 px-3">Sensor / Channel</th>
                        <th className="py-2.5 px-3">Row</th>
                        <th className="py-2.5 px-3">Raw Value</th>
                        <th className="py-2.5 px-3">Final Value</th>
                        <th className="py-2.5 px-3">Status</th>
                        <th className="py-2.5 px-3">Reason / Summary</th>
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {events.map((evt) => (
                        <tr
                          key={evt.event_id}
                          className="hover:bg-slate-900/40 transition-colors group"
                        >
                          <td className="py-2.5 px-3 font-semibold text-slate-400">
                            #{evt.sequence_number}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 text-[11px]">
                            {evt.timestamp ? new Date(evt.timestamp).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            {renderEventTypeBadge(evt.event_type)}
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">
                            {evt.sensor_column || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="py-2.5 px-3 text-slate-400">
                            {evt.source_row_index !== null && evt.source_row_index !== undefined ? (
                              <button
                                onClick={() => {
                                  if (evt.dataset_id) {
                                    setObsDatasetId(evt.dataset_id);
                                    setObsRowIndex(evt.source_row_index!);
                                    setActiveTab('observation');
                                    handleFetchObsHistory();
                                  }
                                }}
                                className="text-emerald-400 hover:underline"
                                title="Inspect Row History"
                              >
                                Row {evt.source_row_index}
                              </button>
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {evt.original_value !== null && evt.original_value !== undefined ? (
                              evt.original_value.toFixed(3)
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-semibold text-emerald-400">
                            {evt.final_value !== null && evt.final_value !== undefined ? (
                              evt.final_value.toFixed(3)
                            ) : (
                              <span className="text-slate-600">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            {evt.new_status ? (
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                  evt.new_status === 'CORRECTED'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : evt.new_status === 'UNRESOLVED'
                                    ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                    : evt.new_status === 'ANOMALY'
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                    : 'bg-stone-100 text-stone-800 border border-stone-200'
                                }`}
                              >
                                {evt.new_status}
                              </span>
                            ) : (
                              <span className="text-stone-400">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-stone-600 max-w-xs truncate font-sans text-xs">
                            {evt.decision_reason || evt.error_details || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right space-x-1">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Eye}
                              onClick={() => setSelectedEvent(evt)}
                              title="Inspect Full Event"
                            />
                            {evt.reconstruction_result_id && (
                              <Button
                                variant="outline"
                                size="sm"
                                icon={GitCommit}
                                onClick={() => handleFetchTrace(evt.reconstruction_result_id!)}
                                title="Causal Trace"
                              />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: CAUSAL PROVENANCE & EXPLANATIONS */}
      {/* ========================================================================= */}
      {activeTab === 'trace' && (
        <div className="space-y-6">
          {/* Result ID Search Bar */}
          <Card>
            <CardHeader
              title="Causal Lineage Search"
              subtitle="Inspect the full causal lifecycle of an individual reconstructed sensor anomaly"
              icon={GitCommit}
            />
            <CardContent>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <div className="relative flex-1 w-full">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Enter Reconstruction Result ID (e.g. rec_res_...)"
                    value={traceResultId}
                    onChange={(e) => setTraceResultId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowRight}
                  onClick={() => handleFetchTrace()}
                  loading={loadingTrace}
                >
                  Assemble Trace
                </Button>
              </div>

              {traceError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{traceError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {activeTrace && (
            <div className="space-y-6">
              {/* Provenance Key Indicators */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-mono text-slate-400">Target Sensor / Row</span>
                  <div className="text-sm font-semibold text-slate-200 font-mono">
                    {activeTrace.sensor_column} (Row {activeTrace.source_row_index})
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">Dataset: {activeTrace.dataset_id}</div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-mono text-slate-400">Raw vs Proposed Value</span>
                  <div className="flex items-center gap-2 text-sm font-mono">
                    <span className="text-slate-400 line-through">
                      {activeTrace.raw_value != null ? activeTrace.raw_value.toFixed(3) : 'NaN'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-emerald-400 font-semibold">
                      {activeTrace.proposed_value != null ? activeTrace.proposed_value.toFixed(3) : 'None'}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono">
                    Final Status: {activeTrace.final_status}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-mono text-slate-400">Contextual Confidence</span>
                  <div className="text-base font-bold text-amber-400 font-mono">
                    {activeTrace.confidence_score.toFixed(1)} / 100
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Evidence-based heuristic score (not calibrated probability)
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-1">
                  <span className="text-[11px] font-mono text-slate-400">Run Linkage</span>
                  <div className="text-[11px] font-mono text-slate-300 truncate">
                    Det: {activeTrace.detection_run_id}
                  </div>
                  <div className="text-[11px] font-mono text-slate-300 truncate">
                    Rec: {activeTrace.reconstruction_run_id}
                  </div>
                </div>
              </div>

              {/* Step-by-Step Causal Lineage Flow */}
              <Card>
                <CardHeader
                  title="Step-by-Step Causal Provenance"
                  subtitle="Verifiable chronological progression from raw signal ingestion to committed downstream value"
                  icon={GitCommit}
                />
                <CardContent>
                  <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                    {activeTrace.trace_steps.map((step) => (
                      <div key={step.step_index} className="relative group">
                        {/* Step Marker */}
                        <div className="absolute -left-[27px] top-1 w-4 h-4 rounded-full bg-slate-900 border-2 border-emerald-500 flex items-center justify-center text-[9px] font-mono text-emerald-400">
                          {step.step_index}
                        </div>

                        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-slate-200">
                                {step.title}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-800 text-slate-300">
                                {step.stage}
                              </span>
                            </div>
                            {step.timestamp && (
                              <span className="text-[10px] font-mono text-slate-500">
                                {new Date(step.timestamp).toISOString()}
                              </span>
                            )}
                          </div>

                          {/* Step Details Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono pt-1">
                            {Object.entries(step.details).map(([k, v]) => (
                              <div key={k} className="p-2 rounded bg-slate-900/60 border border-slate-800/40">
                                <span className="text-[10px] text-slate-500 uppercase block">{k.replace(/_/g, ' ')}</span>
                                <span className="text-slate-300 truncate block">
                                  {v !== null && v !== undefined ? String(v) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Explanations Side-by-Side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Detection Explanation */}
                {activeTrace.detection_explanation && (
                  <Card>
                    <CardHeader
                      title="Detection Algorithmic Explanation"
                      subtitle="Why this observation was flagged by the anomaly detectors"
                      icon={Cpu}
                    />
                    <CardContent className="space-y-4">
                      <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/60 text-xs text-amber-200 space-y-1">
                        <span className="font-semibold block">Decision Logic</span>
                        <p className="text-slate-300 leading-relaxed font-mono">
                          {activeTrace.detection_explanation.flagged_reason}
                        </p>
                      </div>

                      <div className="space-y-2 text-xs">
                        <span className="text-slate-400 font-mono text-[11px] block">Detector Scores</span>
                        <div className="grid grid-cols-2 gap-2 font-mono">
                          {Object.entries(activeTrace.detection_explanation.detector_scores).map(([det, score]) => (
                            <div key={det} className="p-2 rounded bg-slate-950 border border-slate-800">
                              <span className="text-[10px] text-slate-500 block">{det}</span>
                              <span className="text-slate-200 font-semibold">{score.toFixed(3)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {activeTrace.detection_explanation.neighbor_observations.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-slate-400 font-mono text-[11px] block">
                            Neighboring Observations (Temporal Context)
                          </span>
                          <div className="grid grid-cols-4 gap-2 font-mono text-xs">
                            {activeTrace.detection_explanation.neighbor_observations.map((n) => (
                              <div
                                key={n.row_index}
                                className="p-2 rounded bg-slate-950 border border-slate-800 text-center"
                              >
                                <span className="text-[10px] text-slate-500 block">
                                  {n.offset > 0 ? `+${n.offset}` : n.offset} (Row {n.row_index})
                                </span>
                                <span className="text-slate-200 font-semibold">
                                  {n.value !== null && n.value !== undefined ? n.value.toFixed(2) : 'NaN'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Reconstruction Explanation */}
                {activeTrace.reconstruction_explanation && (
                  <Card>
                    <CardHeader
                      title="Reconstruction Algorithmic Explanation"
                      subtitle="How the candidate was computed and why this policy was applied"
                      icon={Sparkles}
                    />
                    <CardContent className="space-y-4">
                      <div className="p-3 rounded-lg bg-emerald-950/20 border border-emerald-800/60 text-xs text-emerald-200 space-y-1">
                        <span className="font-semibold block">Commit Rationale</span>
                        <p className="text-slate-300 leading-relaxed font-mono">
                          {activeTrace.reconstruction_explanation.decision_reason}
                        </p>
                      </div>

                      {/* Confidence Sub-factor Bars */}
                      <div className="space-y-2">
                        <span className="text-slate-400 font-mono text-[11px] block">
                          Confidence Factor Breakdown (0–100 Consolidation)
                        </span>
                        <div className="space-y-1.5 font-mono text-xs">
                          {Object.entries(activeTrace.reconstruction_explanation.confidence_breakdown).map(
                            ([k, v]) => (
                              <div key={k} className="space-y-0.5">
                                <div className="flex justify-between text-[10px] text-slate-400">
                                  <span className="capitalize">{k.replace(/_/g, ' ')}</span>
                                  <span className="text-slate-200 font-semibold">{v.toFixed(1)}</span>
                                </div>
                                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-emerald-500 rounded-full"
                                    style={{ width: `${Math.min(100, Math.max(0, (v / 25) * 100))}%` }}
                                  />
                                </div>
                              </div>
                            )
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Method</span>
                          <span className="text-slate-200 font-semibold">
                            {activeTrace.reconstruction_explanation.reconstruction_method}
                          </span>
                        </div>
                        <div className="p-2 rounded bg-slate-950 border border-slate-800">
                          <span className="text-[10px] text-slate-500 block">Valid Neighbors</span>
                          <span className="text-slate-200 font-semibold">
                            {activeTrace.reconstruction_explanation.valid_neighbors_count} observations
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: OBSERVATION ROW LIFECYCLE */}
      {/* ========================================================================= */}
      {activeTab === 'observation' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Observation Row Audit Explorer"
              subtitle="Inspect all decisions, anomalies, and historical values recorded for a specific dataset row index"
              icon={Activity}
            />
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Target Dataset</label>
                  <select
                    value={obsDatasetId}
                    onChange={(e) => setObsDatasetId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                  >
                    {datasets.map((d) => (
                      <option key={d.dataset_id} value={d.dataset_id}>
                        {d.filename} ({d.dataset_id.slice(0, 10)})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono text-slate-400">Source Row Index</label>
                  <input
                    type="number"
                    min={0}
                    value={obsRowIndex}
                    onChange={(e) => setObsRowIndex(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-end">
                  <Button
                    variant="primary"
                    size="sm"
                    className="w-full"
                    icon={Search}
                    onClick={handleFetchObsHistory}
                    loading={loadingObsHistory}
                  >
                    Query Row History
                  </Button>
                </div>
              </div>

              {obsError && (
                <div className="mt-3 p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{obsError}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {activeObsHistory && (
            <div className="space-y-6">
              {/* Raw CSV Row Values Card */}
              <Card>
                <CardHeader
                  title={`Original Measurement (CSV Row ${activeObsHistory.source_row_index})`}
                  subtitle="Unaltered raw telemetry stored in immutable storage"
                  icon={Database}
                />
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2">
                    {Object.entries(activeObsHistory.row_values).map(([k, v]) => (
                      <div key={k} className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono">
                        <span className="text-[10px] text-slate-500 uppercase block truncate">{k}</span>
                        <span className="text-xs font-semibold text-slate-200">
                          {v !== null && v !== undefined ? String(v) : 'NaN'}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Related Anomalies & Repairs on this Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader
                    title="Flagged Anomalies on this Row"
                    subtitle={`${activeObsHistory.anomalies.length} anomaly detections recorded`}
                    icon={AlertTriangle}
                  />
                  <CardContent>
                    {activeObsHistory.anomalies.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">
                        No anomaly flags recorded on row {activeObsHistory.source_row_index}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeObsHistory.anomalies.map((a, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-amber-400">
                                {a.sensor_column as string}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800">
                                {a.consensus as string}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 font-sans">
                              {a.detection_reason as string}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader
                    title="Reconstruction Records on this Row"
                    subtitle={`${activeObsHistory.reconstructions.length} repair candidates evaluated`}
                    icon={Sparkles}
                  />
                  <CardContent>
                    {activeObsHistory.reconstructions.length === 0 ? (
                      <p className="text-xs text-slate-500 italic py-4 text-center">
                        No reconstruction evaluations recorded on row {activeObsHistory.source_row_index}.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {activeObsHistory.reconstructions.map((r, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs space-y-1.5"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold text-emerald-400">
                                {r.sensor_column as string}
                              </span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                  r.status === 'CORRECTED'
                                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                                    : 'bg-rose-950 text-rose-300 border border-rose-800'
                                }`}
                              >
                                {r.status as string}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300 flex items-center gap-2">
                              <span>Raw: {Number(r.original_value).toFixed(2)}</span>
                              <ArrowRight className="w-3 h-3 text-slate-500" />
                              <span className="text-emerald-400 font-semibold">
                                Final: {Number(r.final_value).toFixed(2)}
                              </span>
                              <span className="ml-auto text-amber-400">
                                Conf: {Number(r.confidence_score).toFixed(0)}/100
                              </span>
                            </div>
                            {Boolean(r.result_id) && (
                              <Button
                                variant="ghost"
                                size="sm"
                                icon={GitCommit}
                                className="w-full text-[10px] h-6 mt-1"
                                onClick={() => handleFetchTrace(String(r.result_id))}
                              >
                                Open Causal Trace
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: CRYPTOGRAPHIC HASH CHAIN INTEGRITY */}
      {/* ========================================================================= */}
      {activeTab === 'integrity' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Sequential SHA-256 Hash Chain Verification"
              subtitle="Verifies cryptographic integrity digests across every persisted audit ledger record"
              icon={Lock}
              action={
                <Button
                  variant="primary"
                  size="sm"
                  icon={ShieldCheck}
                  onClick={runVerification}
                  loading={verifyingChain}
                >
                  Run Full Audit Verification
                </Button>
              }
            />
            <CardContent className="space-y-6">
              {verificationResult ? (
                <div className="space-y-4">
                  {/* Status Banner */}
                  <div
                    className={`p-4 rounded-xl border flex items-start gap-3 ${
                      verificationResult.is_valid
                        ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                        : 'bg-rose-950/40 border-rose-800 text-rose-300'
                    }`}
                  >
                    {verificationResult.is_valid ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    ) : (
                      <XCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1">
                      <span className="font-semibold text-sm">
                        {verificationResult.is_valid
                          ? 'Ledger Hash Chain Verified Intact'
                          : 'Ledger Integrity Discrepancy Detected'}
                      </span>
                      <p className="text-xs text-slate-300 leading-relaxed font-sans">
                        {verificationResult.is_valid
                          ? `All ${verificationResult.total_events_checked} sequential records verified against canonical SHA-256 digests. No missing, altered, or reordered entries detected.`
                          : `Verification detected ${verificationResult.errors.length} integrity discrepancy issues. See detailed errors below.`}
                      </p>
                    </div>
                  </div>

                  {/* Hash Chain Anchor Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase block">Events Verified</span>
                      <span className="text-base font-bold text-slate-200">
                        {verificationResult.total_events_checked}
                      </span>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase block">Genesis Digest</span>
                      <div className="flex items-center justify-between text-slate-300 text-[11px] truncate">
                        <span>{verificationResult.genesis_hash.slice(0, 16)}...</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={copiedHash === 'genesis' ? Check : Copy}
                          onClick={() => copyToClipboard(verificationResult.genesis_hash, 'genesis')}
                        />
                      </div>
                    </div>

                    <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                      <span className="text-[10px] text-slate-500 uppercase block">Latest Block Digest</span>
                      <div className="flex items-center justify-between text-slate-300 text-[11px] truncate">
                        <span>{verificationResult.latest_hash.slice(0, 16)}...</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={copiedHash === 'latest' ? Check : Copy}
                          onClick={() => copyToClipboard(verificationResult.latest_hash, 'latest')}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Discrepancy Errors (if any) */}
                  {verificationResult.errors.length > 0 && (
                    <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 space-y-2">
                      <span className="text-xs font-semibold text-rose-300 block">
                        Detected Discrepancies ({verificationResult.errors.length}):
                      </span>
                      <ul className="list-disc pl-5 text-xs text-rose-200 space-y-1 font-mono">
                        {verificationResult.errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Limitations Disclaimer */}
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 space-y-2 font-sans">
                    <div className="flex items-center gap-2 font-semibold text-slate-300">
                      <Info className="w-4 h-4 text-amber-400" />
                      <span>Cryptographic Boundaries & Limitations</span>
                    </div>
                    <ul className="list-disc pl-5 space-y-1 text-slate-400">
                      {verificationResult.limitations.map((lim, idx) => (
                        <li key={idx}>{lim}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-xs text-slate-400 space-y-3">
                  <Lock className="w-8 h-8 text-slate-600 mx-auto" />
                  <p>Click &quot;Run Full Audit Verification&quot; to recompute SHA-256 digests across the entire ledger.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: COMPLIANCE EXPORT */}
      {/* ========================================================================= */}
      {activeTab === 'export' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Audit Ledger Export Engine"
              subtitle="Export cryptographically verifiable records for external regulatory audits or third-party safety certification"
              icon={Download}
            />
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Format: JSONL */}
                <div
                  onClick={() => setExportFormat('jsonl')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    exportFormat === 'jsonl'
                      ? 'bg-emerald-950/30 border-emerald-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                      <Terminal className="w-4 h-4 text-emerald-400" />
                      <span>JSON Lines (NDJSON)</span>
                    </div>
                    {exportFormat === 'jsonl' && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    Complete machine-readable audit event payloads including nested confidence breakdowns,
                    evidence references, and SHA-256 digests.
                  </p>
                </div>

                {/* Format: CSV */}
                <div
                  onClick={() => setExportFormat('csv')}
                  className={`p-4 rounded-xl border cursor-pointer transition-all space-y-2 ${
                    exportFormat === 'csv'
                      ? 'bg-emerald-950/30 border-emerald-500'
                      : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-semibold text-sm text-slate-200">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span>Tabular CSV</span>
                    </div>
                    {exportFormat === 'csv' && (
                      <Check className="w-4 h-4 text-emerald-400" />
                    )}
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed font-sans">
                    Flattened tabular export suited for spreadsheet audits, reporting dashboards, and
                    rapid compliance review.
                  </p>
                </div>
              </div>

              {/* Active Filter Scope */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
                <span className="text-[10px] uppercase text-slate-500 block">Export Scope</span>
                <p>
                  Export will respect current active filters (Dataset: {filterDataset || 'ALL'}, Event Type: {filterEventType || 'ALL'}).
                </p>
              </div>

              <Button
                variant="primary"
                size="md"
                icon={Download}
                onClick={handleExport}
                loading={exporting}
              >
                Download Verified {exportFormat.toUpperCase()} Export
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EVENT DETAILS MODAL */}
      {/* ========================================================================= */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-emerald-400" />
                <span className="font-semibold text-sm text-slate-200">
                  Audit Event #{selectedEvent.sequence_number}
                </span>
                {renderEventTypeBadge(selectedEvent.event_type)}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={XCircle}
                onClick={() => setSelectedEvent(null)}
              />
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6 font-mono text-xs">
              {/* Event Summary Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Event ID</span>
                  <span className="text-slate-300 font-semibold">{selectedEvent.event_id}</span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Sensor</span>
                  <span className="text-slate-300 font-semibold">
                    {selectedEvent.sensor_column || '—'}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Source Row</span>
                  <span className="text-slate-300 font-semibold">
                    {selectedEvent.source_row_index !== null && selectedEvent.source_row_index !== undefined
                      ? selectedEvent.source_row_index
                      : '—'}
                  </span>
                </div>
                <div className="p-2.5 rounded bg-slate-950 border border-slate-800">
                  <span className="text-[10px] text-slate-500 uppercase block">Status</span>
                  <span className="text-emerald-400 font-semibold">
                    {selectedEvent.new_status || '—'}
                  </span>
                </div>
              </div>

              {/* Value Transitions */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <span className="text-[10px] text-slate-500 uppercase block">Signal Transition</span>
                <div className="flex items-center justify-between text-xs">
                  <div>
                    <span className="text-slate-500 text-[10px] block">Raw Measurement</span>
                    <span className="text-slate-200">
                      {selectedEvent.original_value !== null && selectedEvent.original_value !== undefined
                        ? selectedEvent.original_value.toFixed(4)
                        : 'NaN'}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div>
                    <span className="text-slate-500 text-[10px] block">Candidate Proposal</span>
                    <span className="text-amber-400">
                      {selectedEvent.proposed_value !== null && selectedEvent.proposed_value !== undefined
                        ? selectedEvent.proposed_value.toFixed(4)
                        : '—'}
                    </span>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600" />
                  <div>
                    <span className="text-slate-500 text-[10px] block">Committed Final</span>
                    <span className="text-emerald-400 font-bold">
                      {selectedEvent.final_value !== null && selectedEvent.final_value !== undefined
                        ? selectedEvent.final_value.toFixed(4)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Decision Reason */}
              {selectedEvent.decision_reason && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
                  <span className="text-[10px] text-slate-500 uppercase block">Decision Rationale</span>
                  <p className="text-slate-300 font-sans text-xs leading-relaxed">
                    {selectedEvent.decision_reason}
                  </p>
                </div>
              )}

              {/* Associated Pipeline Entities (Interactive Cross-Module Navigation) */}
              {(selectedEvent.dataset_id || selectedEvent.pipeline_id || selectedEvent.detection_run_id || selectedEvent.reconstruction_run_id || selectedEvent.evaluation_run_id) && (
                <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                  <span className="text-[10px] text-slate-500 uppercase block">Associated Pipeline Entities</span>
                  <div className="flex flex-wrap gap-2 text-xs">
                    {selectedEvent.dataset_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Database}
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate('/datasets');
                        }}
                      >
                        Dataset: {selectedEvent.dataset_id}
                      </Button>
                    )}
                    {selectedEvent.pipeline_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Sliders}
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate('/pipeline');
                        }}
                      >
                        Pipeline: {selectedEvent.pipeline_id}
                      </Button>
                    )}
                    {selectedEvent.detection_run_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={ShieldAlert}
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate('/anomalies');
                        }}
                      >
                        Detection: {selectedEvent.detection_run_id}
                      </Button>
                    )}
                    {selectedEvent.reconstruction_run_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Wrench}
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate('/reconstruction');
                        }}
                      >
                        Reconstruction: {selectedEvent.reconstruction_run_id}
                      </Button>
                    )}
                    {selectedEvent.evaluation_run_id && (
                      <Button
                        variant="outline"
                        size="sm"
                        icon={Award}
                        onClick={() => {
                          setSelectedEvent(null);
                          navigate('/evaluation');
                        }}
                      >
                        Evaluation: {selectedEvent.evaluation_run_id}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {/* Cryptographic Proof Linkage */}
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-slate-400 text-xs">
                  <Lock className="w-3.5 h-3.5 text-emerald-400" />
                  <span>SHA-256 Hash Chain Proof</span>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500">Previous Hash (Parent Block)</div>
                  <div className="p-1.5 rounded bg-slate-900 text-slate-400 truncate">
                    {selectedEvent.previous_hash}
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] text-slate-500">Event Hash (Digest)</div>
                  <div className="p-1.5 rounded bg-slate-900 text-emerald-400 font-semibold truncate">
                    {selectedEvent.event_hash}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-800 flex items-center justify-between bg-slate-950">
              {selectedEvent.reconstruction_result_id ? (
                <Button
                  variant="primary"
                  size="sm"
                  icon={GitCommit}
                  onClick={() => {
                    const id = selectedEvent.reconstruction_result_id!;
                    setSelectedEvent(null);
                    handleFetchTrace(id);
                  }}
                >
                  View Causal Lineage
                </Button>
              ) : (
                <span />
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
