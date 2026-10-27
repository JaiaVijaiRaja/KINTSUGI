import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Award,
  CheckCircle2,
  TrendingUp,
  Zap,
  Sliders,
  BarChart2,
  Info,
  Play,
  RefreshCw,
  AlertTriangle,
  FileText,
  ShieldCheck,
  Check,
  XCircle,
  Eye,
  Activity,
  History,
  HelpCircle,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { EmptyState } from '../components/common/EmptyState';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import { reconstructionService } from '../services/reconstructionService';
import { evaluationService } from '../services/evaluationService';
import type { DatasetMetadata } from '../types/dataset';
import type { PipelineConfig } from '../types/pipeline';
import type { DetectionRun } from '../types/anomaly';
import type { ReconstructionRun } from '../types/reconstruction';
import type {
  CreateEvaluationRequest,
  EvaluationMode,
  EvaluationRun,
  EvaluationSummaryItem,
  EvaluationValidationResponse,
  FaultInjectionConfig,
  FaultManifest,
} from '../types/evaluation';

export const EvaluationPage: React.FC = () => {
  // Navigation tabs
  const [activeTab, setActiveTab] = useState<'setup' | 'overview' | 'visuals' | 'history' | 'methodology'>('overview');

  // Catalogs
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [historyRuns, setHistoryRuns] = useState<EvaluationSummaryItem[]>([]);
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState<boolean>(true);

  // Active / Selected Evaluation Run
  const [currentRun, setCurrentRun] = useState<EvaluationRun | null>(null);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Setup Form State
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [evaluationMode, setEvaluationMode] = useState<EvaluationMode>('mode_a_benchmark');
  const [selectedSensors, setSelectedSensors] = useState<string[]>([]);
  const [randomSeed, setRandomSeed] = useState<number>(42);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');

  // Mode B Selectors
  const [modeBPipelineId, setModeBPipelineId] = useState<string>('');
  const [pipelineDetectionRuns, setPipelineDetectionRuns] = useState<DetectionRun[]>([]);
  const [selectedDetectionRunId, setSelectedDetectionRunId] = useState<string>('');
  const [pipelineReconstructionRuns, setPipelineReconstructionRuns] = useState<ReconstructionRun[]>([]);
  const [selectedReconstructionRunId, setSelectedReconstructionRunId] = useState<string>('');

  // Fault Injection Parameters (Mode A)
  const [enableSpikes, setEnableSpikes] = useState<boolean>(true);
  const [spikeRate, setSpikeRate] = useState<number>(0.04);
  const [spikeMag, setSpikeMag] = useState<number>(5.0);
  const [spikeDir, setSpikeDir] = useState<'both' | 'positive' | 'negative'>('both');

  const [enableCorruption, setEnableCorruption] = useState<boolean>(true);
  const [corruptionRate, setCorruptionRate] = useState<number>(0.02);
  const [corruptionScale, setCorruptionScale] = useState<number>(10.0);

  const [enableMissing, setEnableMissing] = useState<boolean>(true);
  const [missingRate, setMissingRate] = useState<number>(0.03);

  const [enableDrift, setEnableDrift] = useState<boolean>(true);
  const [driftLength, setDriftLength] = useState<number>(15);
  const [driftSlope, setDriftSlope] = useState<number>(0.25);

  const [enableFrozen, setEnableFrozen] = useState<boolean>(true);
  const [frozenLength, setFrozenLength] = useState<number>(12);

  const [enableGap, setEnableGap] = useState<boolean>(true);
  const [gapLength, setGapLength] = useState<number>(8);

  // Modals
  const [validationModalOpen, setValidationModalOpen] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<EvaluationValidationResponse | null>(null);
  const [isValidating, setIsValidating] = useState<boolean>(false);

  const [manifestModalOpen, setManifestModalOpen] = useState<boolean>(false);
  const [manifestData, setManifestData] = useState<FaultManifest | null>(null);
  const [isLoadingManifest, setIsLoadingManifest] = useState<boolean>(false);

  // Load Catalogs
  const loadCatalogs = useCallback(async () => {
    setIsLoadingCatalogs(true);
    try {
      const [dsRes, pipeRes, evalRes] = await Promise.all([
        datasetService.listDatasets(),
        pipelineService.listConfigs(),
        evaluationService.listEvaluations(),
      ]);
      setDatasets(dsRes.datasets);
      setPipelines(pipeRes.pipelines);
      setHistoryRuns(evalRes.evaluations);

      // Default dataset
      if (dsRes.datasets.length > 0 && !selectedDatasetId) {
        const firstDs = dsRes.datasets[0];
        setSelectedDatasetId(firstDs.dataset_id);
      }

      // If evaluations exist and none selected, load latest
      if (evalRes.evaluations.length > 0 && !currentRun) {
        const latestId = evalRes.evaluations[0].evaluation_id;
        try {
          const runDetails = await evaluationService.getEvaluation(latestId);
          setCurrentRun(runDetails);
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      console.error('Failed to load evaluation catalogs:', err);
    } finally {
      setIsLoadingCatalogs(false);
    }
  }, [selectedDatasetId, currentRun]);

  useEffect(() => {
    loadCatalogs();
  }, [loadCatalogs]);

  // Update available sensors when selected dataset changes
  useEffect(() => {
    if (!selectedDatasetId) return;
    const ds = datasets.find((d) => d.dataset_id === selectedDatasetId);
    if (ds) {
      // Fetch full quality to find numeric sensor columns
      datasetService.getDatasetQuality(selectedDatasetId).then((q) => {
        const numericCols = q.columns.filter((c) => c.is_numeric).map((c) => c.name);
        setSelectedSensors(numericCols);
      }).catch(() => {
        setSelectedSensors(ds.columns);
      });
    }
  }, [selectedDatasetId, datasets]);

  // Handle Mode B Pipeline selection to load runs
  useEffect(() => {
    if (evaluationMode !== 'mode_b_existing_run' || !modeBPipelineId) return;
    pipelineService.listPipelineRuns(modeBPipelineId).then((res) => {
      setPipelineDetectionRuns(res.runs);
      if (res.runs.length > 0) {
        setSelectedDetectionRunId(res.runs[0].run_id);
      } else {
        setSelectedDetectionRunId('');
      }
    }).catch(() => {
      setPipelineDetectionRuns([]);
      setSelectedDetectionRunId('');
    });
  }, [evaluationMode, modeBPipelineId]);

  useEffect(() => {
    if (evaluationMode !== 'mode_b_existing_run' || !selectedDetectionRunId) return;
    reconstructionService.listRuns(modeBPipelineId, selectedDetectionRunId).then((res) => {
      setPipelineReconstructionRuns(res.runs);
      if (res.runs.length > 0) {
        setSelectedReconstructionRunId(res.runs[0].reconstruction_run_id);
      } else {
        setSelectedReconstructionRunId('');
      }
    }).catch(() => {
      setPipelineReconstructionRuns([]);
      setSelectedReconstructionRunId('');
    });
  }, [evaluationMode, modeBPipelineId, selectedDetectionRunId]);

  // Client validation
  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!selectedDatasetId) errors.push('Please select a target telemetry dataset.');
    if (selectedSensors.length === 0) errors.push('Select at least one numeric sensor channel.');
    if (evaluationMode === 'mode_a_benchmark') {
      const anyFault = enableSpikes || enableCorruption || enableMissing || enableDrift || enableFrozen || enableGap;
      if (!anyFault) errors.push('Enable at least one synthetic fault type for Mode A benchmark.');
      if (enableSpikes && (spikeRate <= 0 || spikeRate > 0.5)) errors.push('Spike rate must be between 0.1% and 50%.');
      if (enableCorruption && (corruptionRate <= 0 || corruptionRate > 0.5)) errors.push('Corruption rate must be between 0.1% and 50%.');
      if (enableMissing && (missingRate <= 0 || missingRate > 0.5)) errors.push('Missing rate must be between 0.1% and 50%.');
    } else {
      if (!selectedDetectionRunId) errors.push('Mode B requires a valid completed detection run.');
    }
    return errors;
  }, [
    selectedDatasetId,
    selectedSensors,
    evaluationMode,
    enableSpikes,
    enableCorruption,
    enableMissing,
    enableDrift,
    enableFrozen,
    enableGap,
    spikeRate,
    corruptionRate,
    missingRate,
    selectedDetectionRunId,
  ]);

  // Execute Evaluation Handler
  const handleStartEvaluation = async () => {
    if (validationErrors.length > 0) return;
    setIsExecuting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let faultConfig: FaultInjectionConfig | undefined = undefined;
      if (evaluationMode === 'mode_a_benchmark') {
        faultConfig = {
          seed: randomSeed,
          sensor_columns: selectedSensors,
          spikes: {
            enabled: enableSpikes,
            rate: spikeRate,
            magnitude_factor: spikeMag,
            direction: spikeDir,
          },
          corruption: {
            enabled: enableCorruption,
            rate: corruptionRate,
            scale_multiplier: corruptionScale,
            fixed_value: null,
          },
          missing: {
            enabled: enableMissing,
            rate: missingRate,
          },
          drift: {
            enabled: enableDrift,
            interval_length: driftLength,
            slope_factor: driftSlope,
            start_row: null,
          },
          frozen: {
            enabled: enableFrozen,
            interval_length: frozenLength,
            frozen_value: null,
            start_row: null,
          },
          gap: {
            enabled: enableGap,
            interval_length: gapLength,
            start_row: null,
          },
        };
      }

      const req: CreateEvaluationRequest = {
        evaluation_mode: evaluationMode,
        dataset_id: selectedDatasetId,
        pipeline_id: selectedPipelineId || undefined,
        detection_run_id: evaluationMode === 'mode_b_existing_run' ? selectedDetectionRunId : undefined,
        reconstruction_run_id: evaluationMode === 'mode_b_existing_run' ? selectedReconstructionRunId : undefined,
        sensor_columns: selectedSensors,
        fault_config: faultConfig,
        seed: randomSeed,
      };

      const run = await evaluationService.executeEvaluation(req);
      setCurrentRun(run);
      setSuccessMessage(`Evaluation ${run.evaluation_id} completed successfully in ${run.timing.total_elapsed_ms} ms!`);
      setActiveTab('overview');
      // Refresh list
      loadCatalogs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Evaluation execution failed: ${msg}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // Inspect run from history
  const handleInspectRun = async (evalId: string) => {
    try {
      const run = await evaluationService.getEvaluation(evalId);
      setCurrentRun(run);
      setActiveTab('overview');
    } catch (err) {
      console.error('Failed to load evaluation run:', err);
    }
  };

  // Trigger live consistency validation modal
  const handleValidateRun = async (evalId: string) => {
    setIsValidating(true);
    setValidationModalOpen(true);
    setValidationResult(null);
    try {
      const res = await evaluationService.validateEvaluation(evalId);
      setValidationResult(res);
    } catch (err) {
      console.error('Validation failed:', err);
    } finally {
      setIsValidating(false);
    }
  };

  // View manifest modal
  const handleViewManifest = async (evalId: string) => {
    setIsLoadingManifest(true);
    setManifestModalOpen(true);
    setManifestData(null);
    try {
      const res = await evaluationService.getEvaluationManifest(evalId);
      setManifestData(res.manifest);
    } catch (err) {
      console.error('Manifest fetch failed:', err);
    } finally {
      setIsLoadingManifest(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Evaluation Center & Benchmarking Engine"
        description="Confidence-aware industrial benchmark engine evaluating anomaly detection precision/recall, reconstruction MAE/RMSE, evidence calibration, and abstention safety against known ground truth."
        badge="Phase 7 Operational"
        badgeVariant="emerald"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              onClick={loadCatalogs}
              loading={isLoadingCatalogs}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Play}
              onClick={() => setActiveTab('setup')}
            >
              Configure Benchmark
            </Button>
          </div>
        }
      />

      {/* Strict Anti-Fabrication Invariant Alert */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 text-xs text-slate-300 shadow-md">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-amber-300">
            System Invariant: Zero Fabricated Metrics & Strict Ground-Truth Preservation
          </span>
          <p className="text-slate-400 leading-relaxed">
            In <strong>Mode A (Benchmark)</strong>, synthetic faults are injected strictly into a separate benchmark copy; source telemetry remains 100% immutable.
            In <strong>Mode B (Existing Runs)</strong>, true ground truth is unobserved; precision, recall, and RMSE are strictly disclaimed (<code className="text-amber-300 font-mono">—</code>) rather than fabricating synthetic scores.
          </p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-stone-200 text-xs font-medium bg-stone-100/60 p-1 rounded-t-xl gap-1">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent'
          }`}
        >
          <BarChart2 className="w-3.5 h-3.5 text-[#EE602C]" />
          <span>Evaluation Overview</span>
        </button>
        <button
          onClick={() => setActiveTab('visuals')}
          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'visuals'
              ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5 text-[#EE602C]" />
          <span>Visual Analytics</span>
        </button>
        <button
          onClick={() => setActiveTab('setup')}
          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'setup'
              ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent'
          }`}
        >
          <Sliders className="w-3.5 h-3.5 text-[#EE602C]" />
          <span>Benchmark Studio</span>
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'history'
              ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent'
          }`}
        >
          <History className="w-3.5 h-3.5 text-[#EE602C]" />
          <span>Run History ({historyRuns.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('methodology')}
          className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'methodology'
              ? 'bg-white text-stone-900 border border-stone-300 font-bold shadow-xs'
              : 'text-stone-600 hover:text-stone-900 hover:bg-white/60 border border-transparent'
          }`}
        >
          <HelpCircle className="w-3.5 h-3.5 text-[#EE602C]" />
          <span>Methodology & Math</span>
        </button>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <XCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
      {successMessage && (
        <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* =========================================================================
          TAB 1: OVERVIEW
         ========================================================================= */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {!currentRun ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  title="No Evaluation Run Selected"
                  description="Run a new controlled synthetic benchmark in Benchmark Studio or select a historical run from the Run History tab."
                  action={
                    <Button variant="primary" size="sm" onClick={() => setActiveTab('setup')}>
                      Configure Benchmark
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Active Evaluation Banner */}
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Award className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-200 text-sm">
                        {currentRun.evaluation_id}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        currentRun.status === 'completed'
                          ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40'
                          : 'bg-amber-950/60 text-amber-300 border-amber-500/40'
                      }`}>
                        {currentRun.status.toUpperCase()}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-cyan-300 border border-slate-700">
                        {currentRun.evaluation_mode === 'mode_a_benchmark' ? 'Mode A: Synthetic Benchmark' : 'Mode B: Unlabeled Inspection'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Source Dataset: <span className="text-slate-300 font-mono">{currentRun.source_dataset_id}</span> • Evaluated: {new Date(currentRun.start_time).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {currentRun.evaluation_mode === 'mode_a_benchmark' && (
                    <Button
                      variant="outline"
                      size="sm"
                      icon={FileText}
                      onClick={() => handleViewManifest(currentRun.evaluation_id)}
                    >
                      Ground Truth Manifest
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    icon={ShieldCheck}
                    onClick={() => handleValidateRun(currentRun.evaluation_id)}
                  >
                    Validate Integrity
                  </Button>
                </div>
              </div>

              {/* 4 Primary KPI Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* KPI 1: Detection Performance */}
                <Card>
                  <CardHeader
                    title="Detection Accuracy"
                    subtitle="Precision, Recall & F1-Score"
                    icon={CheckCircle2}
                    badge={
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                        {currentRun.evaluation_mode === 'mode_a_benchmark' ? 'Labeled Truth' : 'Unlabeled (Disclaimed)'}
                      </span>
                    }
                  />
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Harmonic F1-Score</span>
                      <span className="text-2xl font-mono font-bold text-amber-400">
                        {currentRun.detection_metrics.f1_score !== null ? (currentRun.detection_metrics.f1_score * 100).toFixed(1) + '%' : '—'}
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span>Precision:</span>
                        <span className="text-slate-200">
                          {currentRun.detection_metrics.precision !== null ? (currentRun.detection_metrics.precision * 100).toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Recall (TPR):</span>
                        <span className="text-slate-200">
                          {currentRun.detection_metrics.recall !== null ? (currentRun.detection_metrics.recall * 100).toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Specificity (TNR):</span>
                        <span className="text-slate-200">
                          {currentRun.detection_metrics.specificity !== null ? (currentRun.detection_metrics.specificity * 100).toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>False Positive Rate:</span>
                        <span className="text-slate-200">
                          {currentRun.detection_metrics.false_positive_rate !== null ? (currentRun.detection_metrics.false_positive_rate * 100).toFixed(2) + '%' : '—'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* KPI 2: Reconstruction Accuracy */}
                <Card>
                  <CardHeader
                    title="Reconstruction Error"
                    subtitle="MAE, RMSE & Residuals"
                    icon={Sliders}
                    badge={
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 border border-slate-700">
                        {currentRun.reconstruction_metrics.has_ground_truth ? 'Ground Truth' : 'Unlabeled'}
                      </span>
                    }
                  />
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Root Mean Squared (RMSE)</span>
                      <span className="text-2xl font-mono font-bold text-cyan-400">
                        {currentRun.reconstruction_metrics.rmse !== null ? currentRun.reconstruction_metrics.rmse.toFixed(3) : '—'}
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span>MAE (Accepted):</span>
                        <span className="text-slate-200">
                          {currentRun.reconstruction_metrics.mae !== null ? currentRun.reconstruction_metrics.mae.toFixed(3) : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>MAPE (%):</span>
                        <span className="text-slate-200">
                          {currentRun.reconstruction_metrics.mape !== null ? currentRun.reconstruction_metrics.mape.toFixed(2) + '%' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Error Reduction:</span>
                        <span className="text-emerald-400">
                          {currentRun.reconstruction_metrics.error_reduction_percent !== null ? currentRun.reconstruction_metrics.error_reduction_percent.toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Repairs Accepted:</span>
                        <span className="text-slate-200 font-semibold">
                          {currentRun.reconstruction_metrics.accepted_corrections_count} / {currentRun.reconstruction_metrics.total_evaluated_observations}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* KPI 3: Evidence Confidence */}
                <Card>
                  <CardHeader
                    title="Evidence Confidence"
                    subtitle="Score Distribution (0-100)"
                    icon={TrendingUp}
                    badge={
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 border border-slate-700">
                        Heuristic
                      </span>
                    }
                  />
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Abstention Rate</span>
                      <span className="text-2xl font-mono font-bold text-amber-400">
                        {currentRun.abstention_metrics.abstention_rate !== null ? (currentRun.abstention_metrics.abstention_rate * 100).toFixed(1) + '%' : '0.0%'}
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span>Unresolved (Abstained):</span>
                        <span className="text-amber-300 font-semibold">{currentRun.abstention_metrics.abstention_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Correctly Abstained:</span>
                        <span className="text-emerald-400">{currentRun.abstention_metrics.correctly_abstained_count}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Incorrect Acceptances:</span>
                        <span className={currentRun.abstention_metrics.incorrectly_accepted_count > 0 ? 'text-rose-400 font-bold' : 'text-slate-200'}>
                          {currentRun.abstention_metrics.incorrectly_accepted_count}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Safety Ratio:</span>
                        <span className="text-cyan-300 font-semibold">
                          {currentRun.abstention_metrics.safety_ratio !== null ? (currentRun.abstention_metrics.safety_ratio * 100).toFixed(1) + '%' : '—'}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* KPI 4: Runtime Performance */}
                <Card>
                  <CardHeader
                    title="Audit & Runtime"
                    subtitle="Elapsed Durations"
                    icon={Zap}
                    badge={
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-emerald-300 border border-slate-700">
                        Verified
                      </span>
                    }
                  />
                  <CardContent className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-slate-400">Total Duration</span>
                      <span className="text-2xl font-mono font-bold text-emerald-400">
                        {currentRun.timing.total_elapsed_ms.toFixed(0)} <span className="text-xs text-slate-400">ms</span>
                      </span>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] font-mono text-slate-400">
                      <div className="flex justify-between">
                        <span>Fault Injection:</span>
                        <span className="text-slate-200">{currentRun.timing.fault_injection_ms.toFixed(0)} ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Anomaly Detection:</span>
                        <span className="text-slate-200">{currentRun.timing.detection_ms.toFixed(0)} ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Reconstruction:</span>
                        <span className="text-slate-200">{currentRun.timing.reconstruction_ms.toFixed(0)} ms</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Metric Evaluation:</span>
                        <span className="text-slate-200">{currentRun.timing.metrics_ms.toFixed(0)} ms</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Summary Notes and Limitations */}
              {currentRun.limitations.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <span>Run Boundaries & Limitations</span>
                  </div>
                  <ul className="text-xs text-slate-400 space-y-1 list-disc list-inside">
                    {currentRun.limitations.map((lim, i) => (
                      <li key={i}>{lim}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: VISUAL ANALYTICS
         ========================================================================= */}
      {activeTab === 'visuals' && (
        <div className="space-y-6">
          {!currentRun ? (
            <Card>
              <CardContent className="py-12">
                <EmptyState
                  title="No Evaluation Data Available"
                  description="Run a benchmark evaluation to generate visual charts."
                />
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Row 1: Confusion Matrix & Accuracy by Fault Type */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 1. Confusion Matrix Card */}
                <Card>
                  <CardHeader
                    title="Observation-Level Confusion Matrix"
                    subtitle="Classification outcomes across sensor-observation pairs"
                    icon={CheckCircle2}
                  />
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 max-w-md mx-auto text-center font-mono">
                      {/* True Positive */}
                      <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40">
                        <span className="text-[10px] text-emerald-400 block uppercase tracking-wider">True Positives (TP)</span>
                        <span className="text-3xl font-bold text-emerald-300">
                          {currentRun.detection_metrics.confusion_matrix.true_positives}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">Correctly Flagged Faults</span>
                      </div>

                      {/* False Positive */}
                      <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/40">
                        <span className="text-[10px] text-amber-400 block uppercase tracking-wider">False Positives (FP)</span>
                        <span className="text-3xl font-bold text-amber-300">
                          {currentRun.detection_metrics.confusion_matrix.false_positives}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">Spurious False Alarms</span>
                      </div>

                      {/* False Negative */}
                      <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40">
                        <span className="text-[10px] text-rose-400 block uppercase tracking-wider">False Negatives (FN)</span>
                        <span className="text-3xl font-bold text-rose-300">
                          {currentRun.detection_metrics.confusion_matrix.false_negatives}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">Missed Fault Injections</span>
                      </div>

                      {/* True Negative */}
                      <div className="p-4 rounded-xl bg-slate-900 border border-slate-700">
                        <span className="text-[10px] text-slate-400 block uppercase tracking-wider">True Negatives (TN)</span>
                        <span className="text-3xl font-bold text-slate-300">
                          {currentRun.detection_metrics.confusion_matrix.true_negatives}
                        </span>
                        <span className="text-[10px] text-slate-400 block mt-1">Correctly Cleared Nominal</span>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-400 text-center border-t border-slate-800 pt-3">
                      Total Labeled Observations: <span className="font-mono text-slate-200">{currentRun.detection_metrics.confusion_matrix.total_labeled_observations}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* 2. Precision/Recall/F1 by Fault Type */}
                <Card>
                  <CardHeader
                    title="Performance by Synthetic Fault Type"
                    subtitle="Precision, Recall, and F1 comparison across fault categories"
                    icon={BarChart2}
                  />
                  <CardContent className="space-y-4">
                    {currentRun.fault_breakdowns.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">
                        No fault-type breakdowns available (Mode B unlabeled inspection).
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {currentRun.fault_breakdowns.map((fb) => (
                          <div key={fb.fault_type} className="space-y-1">
                            <div className="flex justify-between text-xs">
                              <span className="font-mono text-slate-300 capitalize">{fb.fault_type.replace('_', ' ')}</span>
                              <span className="font-mono text-slate-400 text-[11px]">
                                Injected: {fb.injected_count} • Detected: {fb.detected_count}
                              </span>
                            </div>
                            {/* Horizontal Bar */}
                            <div className="h-4 bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
                              <div
                                style={{ width: `${(fb.recall || 0) * 100}%` }}
                                className="bg-amber-500 h-full transition-all duration-500"
                                title={`Recall: ${((fb.recall || 0) * 100).toFixed(1)}%`}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-mono text-slate-400">
                              <span>P: {fb.precision !== null ? (fb.precision * 100).toFixed(0) + '%' : '—'}</span>
                              <span>R: {fb.recall !== null ? (fb.recall * 100).toFixed(0) + '%' : '—'}</span>
                              <span>F1: {fb.f1_score !== null ? (fb.f1_score * 100).toFixed(0) + '%' : '—'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Row 2: Accuracy vs Coverage & Confidence Scatter */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 3. Accuracy vs Coverage Curve */}
                <Card>
                  <CardHeader
                    title="Accuracy vs. Coverage Curve"
                    subtitle="Reconstruction MAE across increasing confidence threshold cutoffs"
                    icon={TrendingUp}
                  />
                  <CardContent>
                    {currentRun.confidence_metrics.coverage_vs_error.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-8">
                        Coverage analysis requires ground truth reference values.
                      </p>
                    ) : (
                      <div className="h-60 flex flex-col justify-between">
                        {/* SVG Line / Dot Chart */}
                        <svg viewBox="0 0 500 200" className="w-full h-full overflow-visible">
                          {/* Grid lines */}
                          <line x1="40" y1="20" x2="480" y2="20" stroke="#1e293b" strokeDasharray="3 3" />
                          <line x1="40" y1="80" x2="480" y2="80" stroke="#1e293b" strokeDasharray="3 3" />
                          <line x1="40" y1="140" x2="480" y2="140" stroke="#1e293b" strokeDasharray="3 3" />
                          <line x1="40" y1="170" x2="480" y2="170" stroke="#334155" />

                          {/* Data points */}
                          {currentRun.confidence_metrics.coverage_vs_error.map((pt, i, arr) => {
                            const x = 50 + (i / Math.max(1, arr.length - 1)) * 410;
                            // normalize MAE (higher is lower on screen)
                            const maxMae = Math.max(...arr.map((p) => p.mae || 1.0), 1.0);
                            const y = 170 - ((pt.mae || 0) / maxMae) * 130;

                            return (
                              <g key={i}>
                                <circle cx={x} cy={y} r="4" fill="#06b6d4" />
                                <text x={x} y="190" textAnchor="middle" fill="#64748b" fontSize="9" fontFamily="monospace">
                                  {pt.confidence_threshold}
                                </text>
                                <text x={x} y={y - 8} textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace">
                                  {pt.mae !== null ? pt.mae.toFixed(2) : ''}
                                </text>
                              </g>
                            );
                          })}
                        </svg>
                        <div className="flex justify-between text-[11px] font-mono text-slate-400 border-t border-slate-800 pt-2">
                          <span>X-Axis: Confidence Cutoff (Threshold)</span>
                          <span className="text-cyan-400">Blue Dots: Evaluated MAE</span>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 4. Per-Sensor Performance Comparison */}
                <Card>
                  <CardHeader
                    title="Per-Sensor Telemetry Comparison"
                    subtitle="Detected anomalies and repair error breakdown by sensor channel"
                    icon={Activity}
                  />
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      {currentRun.sensor_breakdowns.map((sb) => (
                        <div key={sb.sensor_column} className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="font-mono font-semibold text-slate-200">{sb.sensor_column}</span>
                            <span className="text-[11px] font-mono text-slate-400">
                              Detected: {sb.detected_count} / {sb.injected_count}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-[11px] font-mono text-slate-300">
                            <div>Precision: <span className="text-amber-400">{sb.precision !== null ? (sb.precision * 100).toFixed(0) + '%' : '—'}</span></div>
                            <div>Recall: <span className="text-amber-400">{sb.recall !== null ? (sb.recall * 100).toFixed(0) + '%' : '—'}</span></div>
                            <div>MAE: <span className="text-cyan-400">{sb.mae !== null ? sb.mae.toFixed(2) : '—'}</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 3: BENCHMARK STUDIO (SETUP)
         ========================================================================= */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Evaluation Setup & Benchmark Configuration"
              subtitle="Configure evaluation mode, target dataset, and synthetic fault parameters"
              icon={Sliders}
            />
            <CardContent className="space-y-6">
              {/* Mode Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Evaluation Mode</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setEvaluationMode('mode_a_benchmark')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      evaluationMode === 'mode_a_benchmark'
                        ? 'bg-amber-500/10 border-amber-500 text-slate-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <Award className="w-4 h-4 text-amber-400" />
                      <span>Mode A: Controlled Fault-Injection Benchmark</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Primary quantitative mode. Injects configurable synthetic anomalies into a separate benchmark copy with exact ground-truth manifests.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEvaluationMode('mode_b_existing_run')}
                    className={`p-4 rounded-xl border text-left cursor-pointer transition-all ${
                      evaluationMode === 'mode_b_existing_run'
                        ? 'bg-amber-500/10 border-amber-500 text-slate-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-semibold text-sm">
                      <History className="w-4 h-4 text-cyan-400" />
                      <span>Mode B: Inspection of Existing Runs</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      Audit existing detection and reconstruction runs on production data. Unlabeled observations strictly disclaim precision and recall metrics.
                    </p>
                  </button>
                </div>
              </div>

              {/* Dataset Selection */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300">Target Telemetry Dataset</label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => setSelectedDatasetId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono focus:border-amber-400 outline-none"
                >
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.filename} ({d.row_count} rows, {d.columns.length} columns) — {d.dataset_id}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sensor Column Checkboxes */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <label className="font-semibold text-slate-300">Target Sensor Channels</label>
                  <div className="space-x-2 text-[11px] text-amber-400 font-mono">
                    <button
                      type="button"
                      className="cursor-pointer hover:underline"
                      onClick={() => {
                        const ds = datasets.find((d) => d.dataset_id === selectedDatasetId);
                        if (ds) setSelectedSensors(ds.columns);
                      }}
                    >
                      Select All
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      className="cursor-pointer hover:underline"
                      onClick={() => setSelectedSensors([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedSensors.map((col) => (
                    <span
                      key={col}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-900 border border-slate-700 text-xs text-slate-200 font-mono"
                    >
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>{col}</span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Mode A Specific Configurations */}
              {evaluationMode === 'mode_a_benchmark' && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-semibold text-slate-200">Synthetic Fault Injection Configuration</span>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Random Seed:</span>
                      <input
                        type="number"
                        value={randomSeed}
                        onChange={(e) => setRandomSeed(parseInt(e.target.value) || 0)}
                        className="w-20 bg-slate-900 border border-slate-800 rounded px-2 py-1 font-mono text-xs text-slate-200"
                      />
                    </div>
                  </div>

                  {/* Fault Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
                    {/* Spike */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">1. Point Spikes</span>
                        <input
                          type="checkbox"
                          checked={enableSpikes}
                          onChange={(e) => setEnableSpikes(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span className="font-mono text-slate-200">{(spikeRate * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.2"
                          step="0.01"
                          value={spikeRate}
                          onChange={(e) => setSpikeRate(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableSpikes}
                        />
                        <div className="flex justify-between">
                          <span>Magnitude:</span>
                          <span className="font-mono text-slate-200">{spikeMag}x σ</span>
                        </div>
                        <input
                          type="range"
                          min="2.0"
                          max="15.0"
                          step="0.5"
                          value={spikeMag}
                          onChange={(e) => setSpikeMag(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableSpikes}
                        />
                        <div className="flex justify-between items-center pt-1">
                          <span>Direction:</span>
                          <select
                            value={spikeDir}
                            onChange={(e) => setSpikeDir(e.target.value as 'both' | 'positive' | 'negative')}
                            className="bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-200 font-mono"
                            disabled={!enableSpikes}
                          >
                            <option value="both">Both (±)</option>
                            <option value="positive">Positive (+)</option>
                            <option value="negative">Negative (-)</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Point Corruption */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">2. Point Corruption</span>
                        <input
                          type="checkbox"
                          checked={enableCorruption}
                          onChange={(e) => setEnableCorruption(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span className="font-mono text-slate-200">{(corruptionRate * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.15"
                          step="0.01"
                          value={corruptionRate}
                          onChange={(e) => setCorruptionRate(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableCorruption}
                        />
                        <div className="flex justify-between">
                          <span>Scale Multiplier:</span>
                          <span className="font-mono text-slate-200">{corruptionScale}x</span>
                        </div>
                        <input
                          type="range"
                          min="2.0"
                          max="20.0"
                          step="1.0"
                          value={corruptionScale}
                          onChange={(e) => setCorruptionScale(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableCorruption}
                        />
                      </div>
                    </div>

                    {/* Missing Values */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">3. Missing Values</span>
                        <input
                          type="checkbox"
                          checked={enableMissing}
                          onChange={(e) => setEnableMissing(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Rate:</span>
                          <span className="font-mono text-slate-200">{(missingRate * 100).toFixed(0)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0.01"
                          max="0.2"
                          step="0.01"
                          value={missingRate}
                          onChange={(e) => setMissingRate(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableMissing}
                        />
                        <span className="text-[10px] text-slate-500">Injects NaN / missing readings</span>
                      </div>
                    </div>

                    {/* Drift */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">4. Sensor Drift</span>
                        <input
                          type="checkbox"
                          checked={enableDrift}
                          onChange={(e) => setEnableDrift(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Ramp Interval:</span>
                          <span className="font-mono text-slate-200">{driftLength} rows</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="50"
                          step="1"
                          value={driftLength}
                          onChange={(e) => setDriftLength(parseInt(e.target.value))}
                          className="w-full"
                          disabled={!enableDrift}
                        />
                        <div className="flex justify-between">
                          <span>Slope Factor:</span>
                          <span className="font-mono text-slate-200">{driftSlope}x σ</span>
                        </div>
                        <input
                          type="range"
                          min="0.05"
                          max="1.0"
                          step="0.05"
                          value={driftSlope}
                          onChange={(e) => setDriftSlope(parseFloat(e.target.value))}
                          className="w-full"
                          disabled={!enableDrift}
                        />
                      </div>
                    </div>

                    {/* Frozen Sensor */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">5. Frozen Sensor</span>
                        <input
                          type="checkbox"
                          checked={enableFrozen}
                          onChange={(e) => setEnableFrozen(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Stuck Interval:</span>
                          <span className="font-mono text-slate-200">{frozenLength} rows</span>
                        </div>
                        <input
                          type="range"
                          min="5"
                          max="30"
                          step="1"
                          value={frozenLength}
                          onChange={(e) => setFrozenLength(parseInt(e.target.value))}
                          className="w-full"
                          disabled={!enableFrozen}
                        />
                        <span className="text-[10px] text-slate-500">Freezes reading at interval start</span>
                      </div>
                    </div>

                    {/* Communication Gap */}
                    <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-slate-200">6. Communication Gap</span>
                        <input
                          type="checkbox"
                          checked={enableGap}
                          onChange={(e) => setEnableGap(e.target.checked)}
                          className="rounded text-amber-500 focus:ring-amber-400"
                        />
                      </div>
                      <div className="space-y-1 text-slate-400 text-[11px]">
                        <div className="flex justify-between">
                          <span>Gap Interval:</span>
                          <span className="font-mono text-slate-200">{gapLength} rows</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="25"
                          step="1"
                          value={gapLength}
                          onChange={(e) => setGapLength(parseInt(e.target.value))}
                          className="w-full"
                          disabled={!enableGap}
                        />
                        <span className="text-[10px] text-slate-500">Contiguous packet drop interval</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Pipeline Template for Mode A */}
                  <div className="space-y-1 pt-2 border-t border-slate-900">
                    <label className="text-xs font-semibold text-slate-300">Pipeline Configuration Template (Optional)</label>
                    <select
                      value={selectedPipelineId}
                      onChange={(e) => setSelectedPipelineId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono"
                    >
                      <option value="">-- Auto-configure Default Statistical MAD & Repair Engine --</option>
                      {pipelines.map((p) => (
                        <option key={p.configuration_id} value={p.configuration_id}>
                          {p.configuration_name} ({p.configuration_id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Mode B Specific Configurations */}
              {evaluationMode === 'mode_b_existing_run' && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-300">Pipeline Configuration</label>
                    <select
                      value={modeBPipelineId}
                      onChange={(e) => setModeBPipelineId(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono"
                    >
                      <option value="">-- Select Saved Pipeline --</option>
                      {pipelines.map((p) => (
                        <option key={p.configuration_id} value={p.configuration_id}>
                          {p.configuration_name} ({p.configuration_id})
                        </option>
                      ))}
                    </select>
                  </div>

                  {modeBPipelineId && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Detection Run</label>
                      <select
                        value={selectedDetectionRunId}
                        onChange={(e) => setSelectedDetectionRunId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono"
                      >
                        {pipelineDetectionRuns.map((r) => (
                          <option key={r.run_id} value={r.run_id}>
                            {r.run_id} — {r.summary.total_anomalies_detected} anomalies ({new Date(r.start_time).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {selectedDetectionRunId && (
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-slate-300">Reconstruction Run (Optional)</label>
                      <select
                        value={selectedReconstructionRunId}
                        onChange={(e) => setSelectedReconstructionRunId(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-200 font-mono"
                      >
                        <option value="">-- None (Detection Only) --</option>
                        {pipelineReconstructionRuns.map((r) => (
                          <option key={r.reconstruction_run_id} value={r.reconstruction_run_id}>
                            {r.reconstruction_run_id} — {r.summary.corrected_count} corrected ({new Date(r.start_time).toLocaleString()})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Validation Warnings */}
              {validationErrors.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Configuration Validation</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Submit Button */}
              <div className="flex justify-end pt-4 border-t border-slate-800">
                <Button
                  variant="primary"
                  size="md"
                  icon={Play}
                  onClick={handleStartEvaluation}
                  loading={isExecuting}
                  disabled={validationErrors.length > 0}
                >
                  Start Evaluation
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          TAB 4: RUN HISTORY
         ========================================================================= */}
      {activeTab === 'history' && (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Evaluation Catalog & History"
              subtitle="All historical persisted benchmarks with reproducibility parameters"
              icon={History}
            />
            <CardContent>
              {historyRuns.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-400">
                  No evaluation runs recorded yet.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
                      <tr>
                        <th className="p-3">Evaluation ID</th>
                        <th className="p-3">Mode</th>
                        <th className="p-3">Dataset</th>
                        <th className="p-3">F1-Score</th>
                        <th className="p-3">RMSE</th>
                        <th className="p-3">Faults</th>
                        <th className="p-3">Duration</th>
                        <th className="p-3">Evaluated At</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {historyRuns.map((r) => (
                        <tr key={r.evaluation_id} className="hover:bg-slate-900/40">
                          <td className="p-3 font-semibold text-slate-200">{r.evaluation_id}</td>
                          <td className="p-3">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                              {r.evaluation_mode === 'mode_a_benchmark' ? 'Mode A' : 'Mode B'}
                            </span>
                          </td>
                          <td className="p-3 text-slate-300">{r.source_dataset_id}</td>
                          <td className="p-3 text-amber-400 font-bold">
                            {r.f1_score !== null ? (r.f1_score * 100).toFixed(1) + '%' : '—'}
                          </td>
                          <td className="p-3 text-cyan-400">
                            {r.rmse !== null ? r.rmse.toFixed(3) : '—'}
                          </td>
                          <td className="p-3 text-slate-300">{r.injected_faults_count}</td>
                          <td className="p-3 text-slate-400">{r.total_elapsed_ms.toFixed(0)} ms</td>
                          <td className="p-3 text-slate-400 text-[11px] font-sans">
                            {new Date(r.created_at).toLocaleString()}
                          </td>
                          <td className="p-3 text-right space-x-2">
                            <Button
                              variant="outline"
                              size="sm"
                              icon={Eye}
                              onClick={() => handleInspectRun(r.evaluation_id)}
                            >
                              Inspect
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={ShieldCheck}
                              onClick={() => handleValidateRun(r.evaluation_id)}
                            >
                              Verify
                            </Button>
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

      {/* =========================================================================
          TAB 5: METHODOLOGY & LIMITATIONS
         ========================================================================= */}
      {activeTab === 'methodology' && (
        <div className="space-y-6 text-xs text-slate-300">
          <Card>
            <CardHeader
              title="Evaluation Engine Methodology & Mathematical Foundations"
              subtitle="Formal definitions, zero-denominator safeguards, and evaluation boundaries"
              icon={HelpCircle}
            />
            <CardContent className="space-y-6">
              {/* Card 1: Ground Truth */}
              <div className="space-y-2">
                <span className="font-semibold text-sm text-slate-200">1. Preservation of Original Readings & Ground Truth</span>
                <p className="text-slate-400 leading-relaxed">
                  In all phases of KINTSUGI, the original uploaded telemetry CSV is immutable. Synthetic fault injection creates an isolated benchmark copy (<code className="text-amber-300 font-mono">ds_bm_*</code>).
                  Every synthetic modification is registered in a machine-readable JSON manifest recording row index, sensor, uncorrupted physical reading, corrupted reading, and overlap resolution notes.
                </p>
              </div>

              {/* Card 2: Detection Formulas */}
              <div className="space-y-2">
                <span className="font-semibold text-sm text-slate-200">2. Detection Metrics & Zero-Denominator Safety</span>
                <p className="text-slate-400 leading-relaxed">
                  Classification is evaluated at the observation level (<code className="text-cyan-300 font-mono">sensor_observation_pair</code>). Multiple detectors agreeing on a point are not counted as duplicate ground-truth observations.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-950 font-mono text-[11px] border border-slate-800">
                  <div>• Precision = TP / (TP + FP)</div>
                  <div>• Recall = TP / (TP + FN)</div>
                  <div>• F1-Score = 2 × (P × R) / (P + R)</div>
                  <div>• Specificity = TN / (TN + FP)</div>
                </div>
                <p className="text-slate-400 leading-relaxed">
                  <strong>Zero-Denominator Handling:</strong> If TP + FP = 0, precision is returned as <code className="text-amber-300 font-mono">null</code> with an explanatory warning, never as an invented 0% or 100%.
                </p>
              </div>

              {/* Card 3: Reconstruction Accuracy */}
              <div className="space-y-2">
                <span className="font-semibold text-sm text-slate-200">3. Reconstruction Accuracy & Error Reduction</span>
                <p className="text-slate-400 leading-relaxed">
                  Reconstruction MAE and RMSE are computed exclusively against verified original physical observations. Untouched nominal observations are strictly excluded from repair error calculations.
                </p>
                <div className="p-3 rounded-lg bg-slate-950 font-mono text-[11px] border border-slate-800 space-y-1">
                  <div>• MAE = (1/n) Σ |reconstructed_val - ground_truth|</div>
                  <div>• RMSE = √[(1/n) Σ (reconstructed_val - ground_truth)²]</div>
                  <div>• MAPE = (1/m) Σ (|error| / |ground_truth|) × 100% (Strictly excludes reference values == 0)</div>
                </div>
              </div>

              {/* Card 4: Confidence Score Calibration */}
              <div className="space-y-2">
                <span className="font-semibold text-sm text-slate-200">4. Evidence Confidence Scores (0 to 100)</span>
                <p className="text-slate-400 leading-relaxed">
                  KINTSUGI confidence scores represent multi-factor heuristic evidence concordance (temporal proximity, neighbor quorum, method concordance, cross-sensor regression).
                  They are <strong>NOT calibrated Bayesian probabilities</strong>. Presenting Brier scores or ECE without a calibrated probability mapping is deceptive and explicitly avoided.
                </p>
              </div>

              {/* Card 5: Safe Abstention */}
              <div className="space-y-2">
                <span className="font-semibold text-sm text-slate-200">5. Safety Invariants & Legitimate Abstention</span>
                <p className="text-slate-400 leading-relaxed">
                  When evidence is degraded, the engine must abstain as <code className="text-amber-300 font-mono">UNRESOLVED</code>.
                  Abstention is considered &quot;correct&quot; when true context was unrecoverable or candidate repair error would exceed error tolerance.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* =========================================================================
          MODAL 1: INTEGRITY VALIDATION MODAL
         ========================================================================= */}
      {validationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <span className="font-semibold text-slate-200 text-sm">Non-Destructive Integrity Validation</span>
              </div>
              <button
                onClick={() => setValidationModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isValidating ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                <span className="text-xs text-slate-400 font-mono">Verifying SHA-256 and mathematical identities...</span>
              </div>
            ) : validationResult ? (
              <div className="space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <span className="font-semibold text-emerald-300">All Consistency Checks Passed</span>
                    <p className="text-[11px] text-slate-400">Source dataset remains immutable and mathematically consistent.</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="font-semibold text-slate-300">Detailed Check Results:</span>
                  <div className="space-y-1.5 font-mono text-[11px]">
                    {validationResult.checks.map((chk, i) => (
                      <div key={i} className="p-2.5 rounded bg-slate-950 border border-slate-800 flex items-start gap-2">
                        {chk.passed ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                        )}
                        <span className="text-slate-300 leading-relaxed">{chk.details}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800">
              <Button variant="secondary" size="sm" onClick={() => setValidationModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: MANIFEST VIEWER MODAL
         ========================================================================= */}
      {manifestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-amber-400" />
                <span className="font-semibold text-slate-200 text-sm">Ground-Truth Fault Injection Manifest</span>
              </div>
              <button
                onClick={() => setManifestModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {isLoadingManifest ? (
              <div className="py-8 text-center space-y-3">
                <RefreshCw className="w-6 h-6 text-amber-400 animate-spin mx-auto" />
                <span className="text-xs text-slate-400 font-mono">Loading manifest records...</span>
              </div>
            ) : manifestData ? (
              <div className="space-y-4 text-xs overflow-y-auto pr-1">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Total Applied:</span>
                    <span className="text-amber-400 font-bold">{manifestData.total_injected_points}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Seed:</span>
                    <span className="text-slate-200">{manifestData.seed}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Overlaps Skipped:</span>
                    <span className="text-slate-400">{manifestData.overlapping_skipped_count}</span>
                  </div>
                  <div className="p-2 rounded bg-slate-950 border border-slate-800">
                    <span className="text-slate-500 block">Benchmark Copy:</span>
                    <span className="text-cyan-400 truncate block">{manifestData.benchmark_dataset_id}</span>
                  </div>
                </div>

                <div className="space-y-1.5 font-mono text-[11px]">
                  <span className="font-semibold text-slate-300 font-sans">Injected Points (Sample):</span>
                  <div className="max-h-64 overflow-y-auto space-y-1 border border-slate-800 rounded-lg p-2 bg-slate-950">
                    {manifestData.injected_faults.slice(0, 50).map((r, i) => (
                      <div key={i} className="flex justify-between items-center text-[10px] text-slate-300 py-1 border-b border-slate-900 last:border-0">
                        <span className="text-amber-400 font-bold">[{r.fault_type}]</span>
                        <span>Row {r.source_row_index} ({r.sensor_column})</span>
                        <span className="text-slate-400">
                          {r.original_value != null ? r.original_value.toFixed(2) : 'null'} → {r.corrupted_value != null ? r.corrupted_value.toFixed(2) : 'NaN'}
                        </span>
                        <span className={r.applied ? 'text-emerald-400' : 'text-slate-500'}>
                          {r.applied ? 'APPLIED' : 'SKIPPED'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-3 border-t border-slate-800 shrink-0">
              <Button variant="secondary" size="sm" onClick={() => setManifestModalOpen(false)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
