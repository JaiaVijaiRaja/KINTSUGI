import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Wrench,
  Info,
  Play,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Sliders,
  Layers,
  Activity,
  Database,
  X,
  ShieldCheck,
  UserCheck,
  Check,
  Download,
  Sparkles,
} from 'lucide-react';
import { calculateValueDifference, getRemediationProtocol } from '../utils/remediationGuide';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { StatusBadge } from '../components/common/StatusBadge';
import { pipelineService } from '../services/pipelineService';
import { datasetService } from '../services/datasetService';
import { reconstructionService } from '../services/reconstructionService';
import { useRouter } from '../router';
import type { PipelineConfig } from '../types/pipeline';
import type { DatasetMetadata } from '../types/dataset';
import type { DetectionRun } from '../types/anomaly';
import type {
  ReconstructionRecord,
  ReconstructionRun,
  ReviewDecision,
} from '../types/reconstruction';

const renderFactorScore = (val: number | null | undefined, maxPts: number): React.ReactNode => {
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) {
    return <span className="text-amber-400/80 font-mono italic text-[11px]">Unmeasured</span>;
  }
  return <span>+{val.toFixed(1)} / {maxPts}</span>;
};

const renderCrossSensorScore = (val: number | null | undefined): React.ReactNode => {
  if (val === null || val === undefined || typeof val !== 'number' || isNaN(val)) {
    return <span className="text-amber-400/80 font-mono italic text-[11px]">Unmeasured</span>;
  }
  const prefix = val >= 0 ? '+' : '';
  return <span>{prefix}{val.toFixed(1)}</span>;
};

export const ReconstructionPage: React.FC = () => {
  const { navigate } = useRouter();

  // Catalogs
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Detection Runs for selected pipeline
  const [detectionRuns, setDetectionRuns] = useState<DetectionRun[]>([]);
  const [selectedDetectionRunId, setSelectedDetectionRunId] = useState<string>('');
  const [isLoadingDetectionRuns, setIsLoadingDetectionRuns] = useState<boolean>(false);

  // Reconstruction Runs for selected detection run
  const [reconstructionRuns, setReconstructionRuns] = useState<ReconstructionRun[]>([]);
  const [activeReconstructionRun, setActiveReconstructionRun] = useState<ReconstructionRun | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Reconstruction Results ledger
  const [results, setResults] = useState<ReconstructionRecord[]>([]);
  const [totalResults, setTotalResults] = useState<number>(0);
  const [isLoadingResults, setIsLoadingResults] = useState<boolean>(false);
  const [resultsError, setResultsError] = useState<string | null>(null);

  // Filters
  const [sensorFilter, setSensorFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Inspector modal state
  const [inspectedRecord, setInspectedRecord] = useState<ReconstructionRecord | null>(null);

  // Review modal / action state
  const [reviewDecision, setReviewDecision] = useState<ReviewDecision>('ACCEPT');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [customModifiedValue, setCustomModifiedValue] = useState<string>('');
  const [reviewerName, setReviewerName] = useState<string>('operator_local');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewSuccess, setReviewSuccess] = useState<string | null>(null);

  // 1. Initial Load: Pipelines & Datasets
  const loadCatalogs = useCallback(async () => {
    setIsLoadingCatalogs(true);
    setCatalogError(null);
    try {
      const [pipeRes, dataRes] = await Promise.all([
        pipelineService.listConfigs(),
        datasetService.listDatasets(),
      ]);
      const activeDsId =
        new URLSearchParams(window.location.search).get('dataset_id') ||
        localStorage.getItem('kintsugi_active_dataset_id');

      let matchedPipeId = selectedPipelineId;
      if (activeDsId) {
        const match = pipeRes.pipelines.find((p) => p.dataset_id === activeDsId);
        if (match) {
          matchedPipeId = match.configuration_id;
        }
      }

      if (!matchedPipeId && pipeRes.pipelines.length > 0) {
        matchedPipeId = pipeRes.pipelines[0].configuration_id;
      }

      setPipelines(pipeRes.pipelines);
      setDatasets(dataRes.datasets);

      if (matchedPipeId) {
        setSelectedPipelineId(matchedPipeId);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCatalogError(`Failed to load pipelines or datasets: ${msg}`);
    } finally {
      setIsLoadingCatalogs(false);
    }
  }, [selectedPipelineId]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  // Current selected pipeline object
  const selectedPipeline = useMemo(() => {
    return pipelines.find((p) => p.configuration_id === selectedPipelineId) || null;
  }, [pipelines, selectedPipelineId]);

  // Target dataset object
  const targetDataset = useMemo(() => {
    if (!selectedPipeline) return null;
    return datasets.find((d) => d.dataset_id === selectedPipeline.dataset_id) || null;
  }, [selectedPipeline, datasets]);

  // Deduplicated pipelines showing each unique dataset filename exactly once
  const uniquePipelines = useMemo(() => {
    const activeDsId =
      new URLSearchParams(window.location.search).get('dataset_id') ||
      localStorage.getItem('kintsugi_active_dataset_id');

    const fileGroups = new Map<string, PipelineConfig[]>();
    for (const pipe of pipelines) {
      const ds = datasets.find((d) => d.dataset_id === pipe.dataset_id);
      const fileKey = (ds?.filename || pipe.configuration_name).trim().toLowerCase();
      if (!fileGroups.has(fileKey)) {
        fileGroups.set(fileKey, []);
      }
      fileGroups.get(fileKey)!.push(pipe);
    }

    const deduplicated: PipelineConfig[] = [];
    for (const group of fileGroups.values()) {
      let chosen = group.find((p) => p.configuration_id === selectedPipelineId);
      if (!chosen && activeDsId) {
        chosen = group.find((p) => p.dataset_id === activeDsId);
      }
      if (!chosen) {
        chosen = [...group].sort((a, b) => {
          const timeA = new Date(a.created_at || 0).getTime();
          const timeB = new Date(b.created_at || 0).getTime();
          return timeB - timeA;
        })[0];
      }
      if (chosen) {
        deduplicated.push(chosen);
      }
    }

    return deduplicated.sort((a, b) => {
      if (a.dataset_id === activeDsId) return -1;
      if (b.dataset_id === activeDsId) return 1;
      const dsA = datasets.find((d) => d.dataset_id === a.dataset_id);
      const dsB = datasets.find((d) => d.dataset_id === b.dataset_id);
      const nameA = dsA?.filename || a.configuration_name;
      const nameB = dsB?.filename || b.configuration_name;
      return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
    });
  }, [pipelines, datasets, selectedPipelineId]);

  // Keep selectedPipelineId aligned with uniquePipelines
  useEffect(() => {
    if (uniquePipelines.length > 0) {
      const exists = uniquePipelines.some((p) => p.configuration_id === selectedPipelineId);
      if (!exists) {
        setSelectedPipelineId(uniquePipelines[0].configuration_id);
      }
    }
  }, [uniquePipelines, selectedPipelineId]);

  // 2. Fetch Detection Runs when Pipeline Changes
  const loadDetectionRuns = useCallback(async (pipelineId: string) => {
    if (!pipelineId) {
      setDetectionRuns([]);
      setSelectedDetectionRunId('');
      return;
    }
    setIsLoadingDetectionRuns(true);
    try {
      const res = await pipelineService.listPipelineRuns(pipelineId);
      // Filter only completed runs
      const completed = res.runs.filter((r) => r.status === 'completed');
      setDetectionRuns(completed);
      if (completed.length > 0) {
        setSelectedDetectionRunId(completed[0].run_id);
      } else {
        setSelectedDetectionRunId('');
      }
    } catch (err) {
      console.error('Failed to load detection runs', err);
      setDetectionRuns([]);
      setSelectedDetectionRunId('');
    } finally {
      setIsLoadingDetectionRuns(false);
    }
  }, []);

  useEffect(() => {
    if (selectedPipelineId) {
      loadDetectionRuns(selectedPipelineId);
    }
  }, [selectedPipelineId, loadDetectionRuns]);

  // Selected detection run object
  const selectedDetectionRun = useMemo(() => {
    return detectionRuns.find((r) => r.run_id === selectedDetectionRunId) || null;
  }, [detectionRuns, selectedDetectionRunId]);

  // 3. Load Reconstruction Runs when Detection Run Changes
  const loadReconstructionRuns = useCallback(async (detectionRunId: string) => {
    if (!detectionRunId) {
      setReconstructionRuns([]);
      setActiveReconstructionRun(null);
      return;
    }
    try {
      const res = await reconstructionService.listRuns(undefined, detectionRunId);
      setReconstructionRuns(res.runs);
      if (res.runs.length > 0) {
        setActiveReconstructionRun(res.runs[0]);
      } else {
        setActiveReconstructionRun(null);
        setResults([]);
        setTotalResults(0);
      }
    } catch (err) {
      console.error('Failed to load reconstruction runs', err);
      setReconstructionRuns([]);
      setActiveReconstructionRun(null);
    }
  }, []);

  useEffect(() => {
    if (selectedDetectionRunId) {
      loadReconstructionRuns(selectedDetectionRunId);
    } else {
      setReconstructionRuns([]);
      setActiveReconstructionRun(null);
      setResults([]);
      setTotalResults(0);
    }
  }, [selectedDetectionRunId, loadReconstructionRuns]);

  // 4. Load Results when Active Reconstruction Run or Filters Change
  const loadResults = useCallback(async (recRunId: string, sensor: string, status: string) => {
    if (!recRunId) return;
    setIsLoadingResults(true);
    setResultsError(null);
    try {
      const res = await reconstructionService.getResults(
        recRunId,
        sensor === 'ALL' ? undefined : sensor,
        status === 'ALL' ? undefined : status,
        100,
        0
      );
      setResults(res.results);
      setTotalResults(res.total_results);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setResultsError(`Failed to load reconstruction records: ${msg}`);
      setResults([]);
      setTotalResults(0);
    } finally {
      setIsLoadingResults(false);
    }
  }, []);

  useEffect(() => {
    if (activeReconstructionRun) {
      loadResults(
        activeReconstructionRun.reconstruction_run_id,
        sensorFilter,
        statusFilter
      );
    }
  }, [activeReconstructionRun, sensorFilter, statusFilter, loadResults]);

  // 5. Execute Reconstruction Run
  const handleStartReconstruction = async () => {
    if (!selectedPipelineId || !selectedDetectionRunId || isExecuting) return;
    setIsExecuting(true);
    setExecutionError(null);
    try {
      const res = await reconstructionService.executeReconstruction(
        selectedPipelineId,
        selectedDetectionRunId
      );
      setActiveReconstructionRun(res.run);
      // Refresh run list
      const listRes = await reconstructionService.listRuns(undefined, selectedDetectionRunId);
      setReconstructionRuns(listRes.runs);
      // Load results
      await loadResults(res.run.reconstruction_run_id, sensorFilter, statusFilter);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(msg);
    } finally {
      setIsExecuting(false);
    }
  };

  // Export reconstructed dataset
  const handleExportCsv = async () => {
    if (!activeReconstructionRun || isExporting) return;
    setIsExporting(true);
    try {
      await reconstructionService.downloadExport(
        activeReconstructionRun.reconstruction_run_id,
        'csv'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(`Export failed: ${msg}`);
    } finally {
      setIsExporting(false);
    }
  };

  // 6. Operator Review Submission
  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectedRecord) return;

    setIsSubmittingReview(true);
    setReviewError(null);
    setReviewSuccess(null);

    let parsedModifiedVal: number | undefined = undefined;
    if (reviewDecision === 'MODIFY') {
      const num = parseFloat(customModifiedValue);
      if (isNaN(num)) {
        setReviewError('Please enter a valid numeric value for the manual modification.');
        setIsSubmittingReview(false);
        return;
      }
      parsedModifiedVal = num;
    }

    try {
      const updated = await reconstructionService.reviewResult(inspectedRecord.result_id, {
        decision: reviewDecision,
        modified_value: parsedModifiedVal,
        reviewer_name: reviewerName || 'operator_local',
        review_comment: reviewComment || undefined,
      });

      setInspectedRecord(updated);
      setReviewSuccess(`Decision ${reviewDecision} applied successfully.`);

      // Update in local records list
      setResults((prev) =>
        prev.map((r) => (r.result_id === updated.result_id ? updated : r))
      );

      // Refresh run summary
      if (activeReconstructionRun) {
        const refreshedRun = await reconstructionService.getRun(
          activeReconstructionRun.reconstruction_run_id
        );
        setActiveReconstructionRun(refreshedRun);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setReviewError(`Failed to save review decision: ${msg}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Filtered results for client-side search query
  const displayedResults = useMemo(() => {
    if (!searchQuery.trim()) return results;
    const q = searchQuery.toLowerCase().trim();
    return results.filter(
      (r) =>
        r.result_id.toLowerCase().includes(q) ||
        r.sensor_column.toLowerCase().includes(q) ||
        r.source_row_index.toString().includes(q) ||
        (r.timestamp && r.timestamp.toLowerCase().includes(q)) ||
        (r.abstention_reason && r.abstention_reason.toLowerCase().includes(q))
    );
  }, [results, searchQuery]);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Reconstruction Studio"
        description="Confidence-aware self-healing signal repair engine. Computes evidence-based candidate reconstructions with transparent scoring (0–100), enforcing deterministic acceptance policies and strict source dataset immutability."
        badge="Phase 6 Active"
        badgeVariant="emerald"
      />

      {/* Critical Pipeline Invariants Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
          <Database className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-200">100% Immutable Source</span>
            <p className="text-slate-400 leading-relaxed">
              Raw telemetry files are read-only. Original measurements are never overwritten or altered.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
          <Activity className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-200">Evidence-Based Scoring (0–100)</span>
            <p className="text-slate-400 leading-relaxed">
              Confidence is a transparent evidence index composed of neighbor density, concordance, and temporal stability.
            </p>
          </div>
        </div>
        <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/60 border border-slate-800 text-xs text-slate-300">
          <ShieldCheck className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold text-slate-200">Mandatory Abstention</span>
            <p className="text-slate-400 leading-relaxed">
              When supporting evidence is insufficient or contradictory, the system tags the observation as UNRESOLVED.
            </p>
          </div>
        </div>
      </div>

      {/* SECTION 1: Run Selection & Reconstruction Controls */}
      <Card variant="default">
        <CardHeader
          title="Reconstruction Execution Setup"
          subtitle="Select a validated pipeline and completed anomaly detection run to evaluate and reconstruct flagged signals."
          icon={Sliders}
        />
        <CardContent className="space-y-6">
          {catalogError && (
            <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{catalogError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pipeline Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-800 flex items-center justify-between">
                <span>Select Target Pipeline</span>
                <span className="text-[10px] text-stone-500 font-mono font-medium">
                  {uniquePipelines.length} datasets ready
                </span>
              </label>
              <select
                value={selectedPipelineId}
                onChange={(e) => setSelectedPipelineId(e.target.value)}
                disabled={isLoadingCatalogs || isExecuting || uniquePipelines.length === 0}
                className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-2 focus:ring-[#EE602C]/20 transition-all cursor-pointer disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
              >
                {uniquePipelines.length === 0 ? (
                  <option value="" disabled className="bg-white text-stone-400">
                    No pipelines configured — please configure a pipeline first
                  </option>
                ) : (
                  uniquePipelines.map((p) => {
                    const ds = datasets.find((d) => d.dataset_id === p.dataset_id);
                    const fileName = ds?.filename || '';
                    const labelText = fileName
                      ? p.configuration_name.toLowerCase().includes(fileName.toLowerCase())
                        ? `📁 ${p.configuration_name}`
                        : `📁 ${fileName} — ${p.configuration_name}`
                      : p.configuration_name;
                    return (
                      <option key={p.configuration_id} value={p.configuration_id} className="bg-white text-stone-900 font-medium">
                        {labelText}
                      </option>
                    );
                  })
                )}
              </select>
              {selectedPipeline && (
                <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl text-[11px] text-stone-600 space-y-1">
                  <div>
                    <span className="text-stone-500">Dataset:</span>{' '}
                    <span className="text-stone-800 font-mono font-medium">
                      {targetDataset?.filename || selectedPipeline.dataset_id}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500">Monitored Sensors:</span>{' '}
                    <span className="text-stone-800 font-medium">
                      {selectedPipeline.sensor_columns.join(', ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500">Policy:</span>{' '}
                    <span className="text-[#EE602C] font-mono font-semibold">
                      Threshold &ge;{' '}
                      {(selectedPipeline.confidence_policy?.review_threshold * 100).toFixed(0)}%
                      {selectedPipeline.confidence_policy?.human_review_required
                        ? ' (Human Review Required)'
                        : ' (Auto-Correction Permitted)'}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Completed Detection Run Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-800 flex items-center justify-between">
                <span>Completed Anomaly Detection Run</span>
                <span className="text-[10px] text-stone-500 font-mono font-medium">
                  {detectionRuns.length} completed
                </span>
              </label>
              {detectionRuns.length === 0 ? (
                <div className="p-4 bg-stone-50 border border-dashed border-stone-300 rounded-xl text-center space-y-2.5">
                  <p className="text-xs text-stone-600 font-medium">
                    No completed detection runs found for this pipeline.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate('/anomalies')}
                    className="shadow-2xs"
                  >
                    Go to Anomaly Explorer
                  </Button>
                </div>
              ) : (
                <select
                  value={selectedDetectionRunId}
                  onChange={(e) => setSelectedDetectionRunId(e.target.value)}
                  disabled={isLoadingDetectionRuns || isExecuting}
                  className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-2 focus:ring-[#EE602C]/20 transition-all cursor-pointer disabled:bg-stone-100 disabled:text-stone-400 disabled:cursor-not-allowed"
                >
                  {detectionRuns.map((r) => (
                    <option key={r.run_id} value={r.run_id} className="bg-white text-stone-900">
                      {r.run_id} — {r.summary.total_anomalies_detected} anomalies detected (
                      {new Date(r.start_time).toLocaleString()})
                    </option>
                  ))}
                </select>
              )}

              {selectedDetectionRun && (
                <div className="p-3.5 bg-stone-50 border border-stone-200/80 rounded-xl text-[11px] text-stone-600 flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <span className="text-stone-500">Flagged Anomalies:</span>{' '}
                    <span className="font-mono text-rose-600 font-semibold">
                      {selectedDetectionRun.summary.total_anomalies_detected}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500">Rows Evaluated:</span>{' '}
                    <span className="font-mono text-stone-800 font-medium">
                      {selectedDetectionRun.summary.total_rows_analyzed}
                    </span>
                  </div>
                  <div>
                    <span className="text-stone-500">Detectors:</span>{' '}
                    <span className="text-stone-700 font-mono text-[10px]">
                      {selectedDetectionRun.detector_methods.join(', ')}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Trigger & Historical Reconstruction Selector */}
          <div className="pt-4 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <Button
                variant="primary"
                onClick={handleStartReconstruction}
                loading={isExecuting}
                disabled={!selectedDetectionRunId || isExecuting}
                icon={Play}
              >
                {isExecuting ? 'Reconstructing Telemetry...' : 'Start Reconstruction Run'}
              </Button>
              {activeReconstructionRun && (
                <>
                  <Button
                    variant="outline"
                    size="md"
                    onClick={() =>
                      loadResults(
                        activeReconstructionRun.reconstruction_run_id,
                        sensorFilter,
                        statusFilter
                      )
                    }
                    loading={isLoadingResults}
                    icon={RefreshCw}
                  >
                    Refresh
                  </Button>
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleExportCsv}
                    loading={isExporting}
                    disabled={isExporting}
                    icon={Download}
                  >
                    Export Repaired CSV
                  </Button>
                </>
              )}
            </div>

            {/* Historical Reconstruction Selector */}
            {reconstructionRuns.length > 0 && (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <span className="text-xs text-slate-400 whitespace-nowrap">Run Version:</span>
                <select
                  value={activeReconstructionRun?.reconstruction_run_id || ''}
                  onChange={(e) => {
                    const r = reconstructionRuns.find(
                      (run) => run.reconstruction_run_id === e.target.value
                    );
                    if (r) setActiveReconstructionRun(r);
                  }}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 font-mono focus:outline-hidden"
                >
                  {reconstructionRuns.map((r, idx) => (
                    <option key={r.reconstruction_run_id} value={r.reconstruction_run_id}>
                      #{reconstructionRuns.length - idx}: {r.reconstruction_run_id.slice(0, 16)}...
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {executionError && (
            <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-lg text-xs text-rose-300 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{executionError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: Reconstruction Summary KPI Cards */}
      {activeReconstructionRun && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {/* Total Evaluated */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
              Total Evaluated
            </span>
            <div className="text-2xl font-bold font-mono text-slate-100">
              {activeReconstructionRun.summary.total_evaluated}
            </div>
            <p className="text-[10px] text-slate-500">Flagged observations</p>
          </div>

          {/* Proposed Estimates */}
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-amber-300 uppercase tracking-wider">
                Estimates
              </span>
              <StatusBadge status="ESTIMATED" size="sm" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-400">
              {activeReconstructionRun.summary.estimated_count}
            </div>
            <p className="text-[10px] text-amber-300/60">Awaiting human review</p>
          </div>

          {/* Accepted Corrections */}
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-emerald-300 uppercase tracking-wider">
                Corrected
              </span>
              <StatusBadge status="CORRECTED" size="sm" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-400">
              {activeReconstructionRun.summary.corrected_count}
            </div>
            <p className="text-[10px] text-emerald-300/60">Approved signal repairs</p>
          </div>

          {/* Abstentions / Unresolved */}
          <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-500/30 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-rose-300 uppercase tracking-wider">
                Unresolved
              </span>
              <StatusBadge status="UNRESOLVED" size="sm" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-400">
              {activeReconstructionRun.summary.unresolved_count}
            </div>
            <p className="text-[10px] text-rose-300/60">Strictly abstained</p>
          </div>

          {/* Average Confidence */}
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 space-y-1 col-span-2 md:col-span-1">
            <span className="text-[11px] font-medium text-cyan-300 uppercase tracking-wider">
              Avg Confidence
            </span>
            <div className="text-2xl font-bold font-mono text-cyan-400">
              {activeReconstructionRun.summary.average_confidence.toFixed(1)}%
            </div>
            <p className="text-[10px] text-cyan-300/60">Evidence score index</p>
          </div>
        </div>
      )}

      {/* SECTION 3: Results Ledger Table & Filters */}
      <Card variant="default">
        <CardHeader
          title="Reconstruction Records & Audit Ledger"
          subtitle={
            activeReconstructionRun
              ? `Viewing ${displayedResults.length} of ${totalResults} evaluated records for run ${activeReconstructionRun.reconstruction_run_id}`
              : 'Trigger a reconstruction run above to view evaluated observations.'
          }
          icon={Layers}
          action={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Sensor Filter */}
              <select
                value={sensorFilter}
                onChange={(e) => setSensorFilter(e.target.value)}
                className="bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20"
              >
                <option value="ALL">All Sensors</option>
                {selectedPipeline?.sensor_columns.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20"
              >
                <option value="ALL">All Statuses</option>
                <option value="ESTIMATED">ESTIMATED</option>
                <option value="CORRECTED">CORRECTED</option>
                <option value="UNRESOLVED">UNRESOLVED</option>
                <option value="MEASURED">MEASURED</option>
              </select>

              {/* Search Query */}
              <input
                type="text"
                placeholder="Search row, id, reason..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20 w-48"
              />
            </div>
          }
        />
        <CardContent className="p-0">
          {isLoadingResults ? (
            <div className="p-12 text-center text-stone-500 space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-[#EE602C]" />
              <p className="text-xs">Loading reconstruction records and audit breakdown...</p>
            </div>
          ) : resultsError ? (
            <div className="p-8 text-center text-rose-600 space-y-2">
              <AlertTriangle className="w-6 h-6 mx-auto" />
              <p className="text-xs">{resultsError}</p>
            </div>
          ) : !activeReconstructionRun ? (
            <div className="p-8">
              <EmptyState
                icon={Wrench}
                title="No Reconstruction Run Selected"
                description="Select a pipeline and detection run, then click 'Start Reconstruction Run' to generate candidate repairs."
              />
            </div>
          ) : displayedResults.length === 0 ? (
            <div className="p-10 text-center text-slate-500 text-xs">
              No reconstruction records match the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/70 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Row / Time</th>
                    <th className="py-3 px-4">Sensor</th>
                    <th className="py-3 px-4">Raw Original</th>
                    <th className="py-3 px-4">Proposed</th>
                    <th className="py-3 px-4">Final Value</th>
                    <th className="py-3 px-4">Value Differed (Δ)</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4">Confidence</th>
                    <th className="py-3 px-4">Explanation / Reason</th>
                    <th className="py-3 px-4 text-right">Audit Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {displayedResults.map((r) => {
                    const isEstimated = r.status === 'ESTIMATED';
                    const isCorrected = r.status === 'CORRECTED';
                    const isUnresolved = r.status === 'UNRESOLVED';
                    const valDiff = calculateValueDifference(r.original_value, r.final_value);

                    return (
                      <tr
                        key={r.result_id}
                        className="hover:bg-slate-800/30 transition-colors cursor-pointer group"
                        onClick={() => setInspectedRecord(r)}
                      >
                        <td className="py-3 px-4">
                          <div className="font-semibold text-slate-200">#{r.source_row_index}</div>
                          <div className="text-[10px] text-slate-500 font-sans">
                            {r.timestamp ? new Date(r.timestamp).toLocaleTimeString() : 'No timestamp'}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans font-medium text-slate-300">
                          {r.sensor_column}
                        </td>
                        <td className="py-3 px-4 text-cyan-300 font-semibold">
                          {r.original_value !== null && r.original_value !== undefined
                            ? r.original_value.toFixed(3)
                            : 'NaN'}
                        </td>
                        <td className="py-3 px-4">
                          {r.proposed_value !== null && r.proposed_value !== undefined ? (
                            <span className="text-amber-300 font-semibold">
                              {r.proposed_value.toFixed(3)}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {isCorrected ? (
                            <span className="text-emerald-400 font-bold">
                              {r.final_value?.toFixed(3)}
                            </span>
                          ) : isUnresolved ? (
                            <span className="text-rose-400 font-semibold">
                              {r.final_value?.toFixed(3)} (unmodified)
                            </span>
                          ) : isEstimated ? (
                            <span className="text-slate-400">
                              {r.final_value?.toFixed(3)} (holding raw)
                            </span>
                          ) : (
                            <span className="text-slate-300">{r.final_value?.toFixed(3)}</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded font-mono text-[11px] font-bold border ${valDiff.badgeColor}`}>
                            {valDiff.deltaFormatted} {valDiff.percentChange !== null ? `(${valDiff.percentFormatted})` : ''}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <StatusBadge status={r.status} size="sm" />
                        </td>
                        <td className="py-3 px-4 font-sans text-[11px] text-slate-400">
                          {r.method === 'linear_interpolation'
                            ? 'Linear Interp'
                            : r.method === 'local_median'
                            ? 'Local Median'
                            : r.method === 'cross_sensor'
                            ? 'Cross Sensor'
                            : 'None'}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-12 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                              <div
                                className={`h-full ${
                                  r.confidence_score >= 70
                                    ? 'bg-emerald-400'
                                    : r.confidence_score >= 40
                                    ? 'bg-amber-400'
                                    : 'bg-rose-500'
                                }`}
                                style={{ width: `${Math.min(100, r.confidence_score)}%` }}
                              />
                            </div>
                            <span
                              className={`text-[11px] ${
                                r.confidence_score >= 70
                                  ? 'text-emerald-400'
                                  : r.confidence_score >= 40
                                  ? 'text-amber-400'
                                  : 'text-rose-400'
                              }`}
                            >
                              {r.confidence_score.toFixed(0)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans text-[11px] text-slate-400 max-w-xs truncate">
                          {r.abstention_reason || r.evidence_summary}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setInspectedRecord(r);
                            }}
                            className="px-2.5 py-1 rounded-lg bg-white text-stone-900 hover:bg-stone-100 text-[11px] font-sans font-medium transition-colors inline-flex items-center gap-1 border border-stone-300 shadow-2xs cursor-pointer"
                          >
                            <Eye className="w-3 h-3 text-[#EE602C]" />
                            <span>Inspect</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 4: Evidence Inspector Modal / Drawer */}
      {inspectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl space-y-6 p-6">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-slate-100">
                    Evidence Inspector & Audit Trail
                  </h3>
                  <StatusBadge status={inspectedRecord.status} />
                </div>
                <p className="text-xs text-slate-400 font-mono">
                  Result ID: {inspectedRecord.result_id} | Sensor: {inspectedRecord.sensor_column} |
                  Row #{inspectedRecord.source_row_index}
                </p>
              </div>
              <button
                onClick={() => {
                  setInspectedRecord(null);
                  setReviewError(null);
                  setReviewSuccess(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Tri-Value Observation Comparison */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-3.5 bg-slate-950 rounded-xl border border-cyan-500/30 space-y-1">
                <span className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider">
                  Raw Original (Immutable)
                </span>
                <div className="text-xl font-bold font-mono text-cyan-300">
                  {inspectedRecord.original_value !== null &&
                  inspectedRecord.original_value !== undefined
                    ? inspectedRecord.original_value.toFixed(4)
                    : 'NaN'}
                </div>
                <p className="text-[10px] text-slate-500">Unmodified physical reading</p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-amber-500/30 space-y-1">
                <span className="text-[10px] font-mono text-amber-400 uppercase tracking-wider">
                  Proposed Reconstructed
                </span>
                <div className="text-xl font-bold font-mono text-amber-300">
                  {inspectedRecord.proposed_value !== null &&
                  inspectedRecord.proposed_value !== undefined
                    ? inspectedRecord.proposed_value.toFixed(4)
                    : 'None (Abstained)'}
                </div>
                <p className="text-[10px] text-slate-500">
                  Method: {inspectedRecord.method}
                </p>
              </div>

              <div className="p-3.5 bg-slate-950 rounded-xl border border-emerald-500/30 space-y-1">
                <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">
                  Final Committed Value
                </span>
                <div className="text-xl font-bold font-mono text-emerald-300">
                  {inspectedRecord.final_value !== null &&
                  inspectedRecord.final_value !== undefined
                    ? inspectedRecord.final_value.toFixed(4)
                    : 'NaN'}
                </div>
                <p className="text-[10px] text-slate-500">
                  {inspectedRecord.status === 'CORRECTED'
                    ? 'Committed repair'
                    : 'Holding original raw'}
                </p>
              </div>
            </div>

            {/* SECTION: Rectification Analysis, Value Difference & Field Instructions */}
            {(() => {
              const valDiff = calculateValueDifference(
                inspectedRecord.original_value,
                inspectedRecord.final_value
              );
              const remediation = getRemediationProtocol(
                inspectedRecord.sensor_column,
                inspectedRecord.method,
                inspectedRecord.original_value,
                inspectedRecord.final_value
              );

              return (
                <div className="space-y-4 p-4 rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-cyan-500/30 shadow-lg">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-400" />
                      <h4 className="text-xs font-mono font-bold text-slate-100 uppercase tracking-wider">
                        Signal Rectification Analysis & Value Difference (Δ)
                      </h4>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded text-[10px] font-mono font-bold border ${valDiff.badgeColor}`}>
                      {valDiff.adjustmentType}
                    </span>
                  </div>

                  {/* 3-Way Value Breakdown Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs">
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-slate-500 block uppercase">Raw Physical Reading</span>
                      <span className="font-bold text-cyan-300 text-base">{valDiff.originalFormatted}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">Immutable raw data</span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800">
                      <span className="text-[10px] text-emerald-400 block uppercase">Committed Final Reading</span>
                      <span className="font-bold text-emerald-300 text-base">{valDiff.repairedFormatted}</span>
                      <span className="text-[10px] text-slate-500 block mt-0.5 font-sans">
                        {inspectedRecord.status === 'CORRECTED' ? 'Repaired telemetry' : 'Holding raw'}
                      </span>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900/90 border border-amber-500/30">
                      <span className="text-[10px] text-amber-400 block uppercase">Value Differed (Δ Delta)</span>
                      <span className="font-bold text-amber-300 text-base">
                        {valDiff.deltaFormatted}{' '}
                        <span className="text-xs font-normal text-amber-400/80">({valDiff.percentFormatted})</span>
                      </span>
                      <span className="text-[10px] text-amber-400/80 block mt-0.5 font-sans">Corrective deviation</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 font-sans leading-relaxed bg-slate-900/60 p-3 rounded-xl border border-slate-800/80">
                    {valDiff.summaryText}
                  </p>

                  {/* Rectification Method Breakdown */}
                  <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-amber-400" />
                      <span className="text-xs font-mono font-bold text-slate-200">
                        Remediation Algorithm: {remediation.methodName}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 font-sans leading-relaxed">
                      {remediation.methodDescription}
                    </p>
                  </div>

                  {/* Actionable Problem Solving Instructions */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    {/* Digital Software Fix */}
                    <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
                      <span className="font-mono text-[11px] font-bold text-cyan-400 uppercase tracking-wider block flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                        1. Digital Software Healing Protocol
                      </span>
                      <ul className="space-y-1.5 text-slate-300 font-sans text-[11px]">
                        {remediation.digitalFixSteps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="font-mono font-bold text-cyan-400 shrink-0">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Physical Field Action */}
                    <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2">
                      <span className="font-mono text-[11px] font-bold text-amber-400 uppercase tracking-wider block flex items-center gap-1.5">
                        <Wrench className="w-3.5 h-3.5 text-amber-400" />
                        2. Field Engineering Maintenance Action
                      </span>
                      <ul className="space-y-1.5 text-slate-300 font-sans text-[11px]">
                        {remediation.fieldEngineeringSteps.map((step, idx) => (
                          <li key={idx} className="flex items-start gap-1.5">
                            <span className="font-mono font-bold text-amber-400 shrink-0">{idx + 1}.</span>
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Safety Notice */}
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 font-sans flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <span>{remediation.safetyNotice}</span>
                  </div>
                </div>
              );
            })()}

            {/* Method Explanation & Abstention Notice */}
            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-slate-200">
                <Info className="w-4 h-4 text-amber-400" />
                <span>Evidence Summary & Reason</span>
              </div>
              <p className="text-slate-300 leading-relaxed font-sans">
                {inspectedRecord.evidence_summary}
              </p>
              {inspectedRecord.abstention_reason && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-900/50 rounded-lg text-rose-300 text-[11px] flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
                  <span>
                    <strong>Abstention Reason:</strong> {inspectedRecord.abstention_reason}
                  </span>
                </div>
              )}
            </div>

            {/* Confidence Factor Breakdown */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-cyan-400" />
                  Evidence Factor Decomposition
                </span>
                <span className="text-xs font-mono font-bold text-amber-400">
                  Total Score:{' '}
                  {inspectedRecord.confidence_score !== null &&
                  inspectedRecord.confidence_score !== undefined &&
                  !isNaN(inspectedRecord.confidence_score)
                    ? `${inspectedRecord.confidence_score.toFixed(1)} / 100`
                    : 'Unmeasured'}
                </span>
              </div>

              {!inspectedRecord.confidence_breakdown ? (
                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-lg text-slate-400 text-xs flex items-center gap-2">
                  <Info className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Evidence breakdown telemetry is unavailable for this observation. Factors are unmeasured.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-[11px]">
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Neighbor Count</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderFactorScore(inspectedRecord.confidence_breakdown.neighbor_count_score, 25)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Method Agreement</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderFactorScore(inspectedRecord.confidence_breakdown.method_agreement_score, 25)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Temporal Proximity</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderFactorScore(inspectedRecord.confidence_breakdown.temporal_proximity_score, 20)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Signal Stability</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderFactorScore(
                        inspectedRecord.confidence_breakdown.local_variance_score ??
                          inspectedRecord.confidence_breakdown.local_stability_score,
                        15
                      )}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Neighbor Cleanliness</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderFactorScore(inspectedRecord.confidence_breakdown.neighbor_cleanliness_score, 15)}
                    </div>
                  </div>
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-lg">
                    <div className="text-slate-400">Cross-Sensor Impact</div>
                    <div className="text-sm font-mono font-bold text-slate-200">
                      {renderCrossSensorScore(inspectedRecord.confidence_breakdown.cross_sensor_score)}
                    </div>
                  </div>
                </div>
              )}

              {/* Factors applied / penalty chips */}
              {(((inspectedRecord.confidence_breakdown?.penalty_reasons ||
                inspectedRecord.confidence_breakdown?.factors_applied) ??
                []).length > 0) && (
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  {((inspectedRecord.confidence_breakdown?.penalty_reasons ||
                    inspectedRecord.confidence_breakdown?.factors_applied) ??
                    []).map((f, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 text-[10px] text-slate-300 font-mono border border-slate-700/60"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Supporting Observations Table */}
            {inspectedRecord.evidence_references && inspectedRecord.evidence_references.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-semibold text-slate-200">
                  Supporting Neighbor Observations ({inspectedRecord.evidence_references.length})
                </span>
                <div className="max-h-36 overflow-y-auto border border-slate-800 rounded-lg">
                  <table className="w-full text-left text-[11px] font-mono">
                    <thead className="bg-slate-950 sticky top-0 text-slate-400">
                      <tr>
                        <th className="py-1.5 px-3">Row Index</th>
                        <th className="py-1.5 px-3">Sensor</th>
                        <th className="py-1.5 px-3">Value</th>
                        <th className="py-1.5 px-3">Distance</th>
                        <th className="py-1.5 px-3">Weight</th>
                        <th className="py-1.5 px-3">Anomaly Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {inspectedRecord.evidence_references.map((ev, i) => (
                        <tr key={i} className="hover:bg-slate-800/20">
                          <td className="py-1.5 px-3 text-slate-200">#{ev.source_row_index}</td>
                          <td className="py-1.5 px-3 text-slate-400">{ev.sensor_column}</td>
                          <td className="py-1.5 px-3 text-cyan-300">
                            {ev.value !== undefined && ev.value !== null && !isNaN(ev.value)
                              ? ev.value.toFixed(3)
                              : 'NaN'}
                          </td>
                          <td className="py-1.5 px-3 text-slate-300">
                            {ev.distance !== undefined && ev.distance !== null && !isNaN(ev.distance)
                              ? `${ev.distance.toFixed(1)} rows`
                              : (ev.role || 'N/A')}
                          </td>
                          <td className="py-1.5 px-3 text-slate-400">
                            {ev.weight !== undefined && ev.weight !== null && !isNaN(ev.weight)
                              ? ev.weight.toFixed(2)
                              : '1.00'}
                          </td>
                          <td className="py-1.5 px-3">
                            {ev.is_anomaly ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-950/60 text-rose-400 border border-rose-800/50">
                                Flagged
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-950/50 text-emerald-400 border border-emerald-800/40">
                                Nominal
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Operator Review Action Panel */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-slate-200">
                    Operator Review & Ledger Commitment
                  </span>
                </div>
                {inspectedRecord.is_reviewed && (
                  <span className="text-[10px] font-mono text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/40">
                    Already Reviewed: {inspectedRecord.review_decision} by{' '}
                    {inspectedRecord.reviewed_by}
                  </span>
                )}
              </div>

              {reviewSuccess && (
                <div className="p-2.5 bg-emerald-950/40 border border-emerald-800/50 rounded-lg text-emerald-300 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{reviewSuccess}</span>
                </div>
              )}

              {reviewError && (
                <div className="p-2.5 bg-rose-950/40 border border-rose-800/50 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{reviewError}</span>
                </div>
              )}

              <form onSubmit={handleReviewSubmit} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Decision Action
                    </label>
                    <select
                      value={reviewDecision}
                      onChange={(e) => setReviewDecision(e.target.value as ReviewDecision)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-hidden"
                    >
                      <option value="ACCEPT">ACCEPT (Commit Proposed)</option>
                      <option value="REJECT">REJECT (Abstain UNRESOLVED)</option>
                      <option value="MODIFY">MODIFY (Custom Value)</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[11px] font-medium text-slate-400 block mb-1">
                      Reviewer Identifier
                    </label>
                    <input
                      type="text"
                      value={reviewerName}
                      onChange={(e) => setReviewerName(e.target.value)}
                      placeholder="operator_local"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-hidden"
                    />
                  </div>

                  {reviewDecision === 'MODIFY' && (
                    <div>
                      <label className="text-[11px] font-medium text-amber-400 block mb-1">
                        Custom Value
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={customModifiedValue}
                        onChange={(e) => setCustomModifiedValue(e.target.value)}
                        placeholder="e.g. 12.35"
                        className="w-full bg-slate-900 border border-amber-500/50 rounded-lg px-2.5 py-1.5 text-xs text-amber-200 focus:outline-hidden"
                        required
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-[11px] font-medium text-slate-400 block mb-1">
                    Justification / Audit Comment
                  </label>
                  <input
                    type="text"
                    value={reviewComment}
                    onChange={(e) => setReviewComment(e.target.value)}
                    placeholder="Rationale for review decision..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-hidden"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    loading={isSubmittingReview}
                    icon={CheckCircle2}
                  >
                    Commit Operator Decision
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
