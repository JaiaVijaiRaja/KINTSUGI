import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Sliders,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  Play,
  RotateCcw,
  Sparkles,
  Info,
  Clock,
  ShieldAlert,
  Activity,
  UploadCloud,
  Layers,
  FileText,
} from 'lucide-react';
import { useRouter } from '../router';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { apiService } from '../services/api';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import { anomalyService } from '../services/anomalyService';
import { reconstructionService } from '../services/reconstructionService';
import { auditService } from '../services/auditService';
import { thresholdService } from '../services/thresholdService';
import type { HealthResponse } from '../types/api';
import type { DatasetMetadata, DataQualitySummary, DatasetPreviewResponse } from '../types/dataset';
import type { AnomalyRecord } from '../types/anomaly';
import type {
  ReconstructionRun,
  ReconstructionRecord,
  ReviewDecision,
  ProcessingStatus,
} from '../types/reconstruction';
import type { HashChainVerificationResponse } from '../types/audit';

interface SystemDiagnosticsSummary {
  health: HealthResponse | null;
  latencyMs: number | null;
  totalDatasets: number;
  totalPipelines: number;
  totalReconstructions: number;
  auditVerification: HashChainVerificationResponse | null;
  auditEventCount: number;
  timestamp: string;
}

interface DetectedProblem {
  id: string;
  sensor: string;
  rowIndex: number;
  timestamp: string | null;
  category: 'MISSING_DATA' | 'STATISTICAL_SPIKE' | 'ISOLATION_ANOMALY' | 'SENSOR_FREEZE' | 'SENSOR_DRIFT';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  originalValue: number | null | undefined;
  evidence: string;
  recommendedAction: string;
  eligibility: 'ELIGIBLE' | 'REQUIRES_REVIEW' | 'ABSTENTION_REQUIRED';
  confidence: number | null;
  rationale: string;
  status: ProcessingStatus | 'PENDING';
  reconstructionRecord?: ReconstructionRecord;
}

export const DiagnosticsPage: React.FC = () => {
  const { navigate } = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Core Data States
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<DatasetMetadata | null>(null);
  const [datasetQuality, setDatasetQuality] = useState<DataQualitySummary | null>(null);
  const [datasetPreview, setDatasetPreview] = useState<DatasetPreviewResponse | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);

  // Recovery & Reconstruction Run States
  const [activeRun, setActiveRun] = useState<ReconstructionRun | null>(null);
  const [recoveryRecords, setRecoveryRecords] = useState<ReconstructionRecord[]>([]);
  const [isExecutingRecovery, setIsExecutingRecovery] = useState<boolean>(false);
  const [recoveryStepIndex, setRecoveryStepIndex] = useState<number>(0);

  // System Diagnostics Secondary States
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState<boolean>(false);
  const [systemDiagnostics, setSystemDiagnostics] = useState<SystemDiagnosticsSummary>({
    health: null,
    latencyMs: null,
    totalDatasets: 0,
    totalPipelines: 0,
    totalReconstructions: 0,
    auditVerification: null,
    auditEventCount: 0,
    timestamp: new Date().toISOString(),
  });
  const [thresholdPolicy] = useState(() => thresholdService.getStoredPolicy());

  // UI Filtering & Interactive States
  const [evidenceFilter, setEvidenceFilter] = useState<'ALL' | 'CORRECTED' | 'ESTIMATED' | 'UNRESOLVED' | 'REVIEWED'>('ALL');
  const [selectedSensorChannel, setSelectedSensorChannel] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  // Operator Review Modal State
  const [reviewModalTarget, setReviewModalTarget] = useState<ReconstructionRecord | null>(null);
  const [operatorDecision, setOperatorDecision] = useState<ReviewDecision>('ACCEPT');
  const [operatorComment, setOperatorComment] = useState<string>('');
  const [operatorCustomVal, setOperatorCustomVal] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  const recoveryProgressSteps = [
    'Validating dataset schema & physical boundary invariants...',
    'Running multi-detector consensus (Rolling MAD & Isolation Forest)...',
    'Applying evidence-based linear interpolation & local median healing...',
    'Computing multi-factor confidence scores & safety verification...',
    'Committing repaired stream & appending cryptographically to SHA-256 ledger...',
  ];

  // 1. Fetch System Diagnostics (Technical health, audit chain)
  const fetchSystemDiagnostics = useCallback(async () => {
    try {
      const [healthRes, datasetsRes, pipelinesRes, recRes, auditVerifyRes, auditEventsRes] =
        await Promise.allSettled([
          apiService.checkHealth(5000),
          datasetService.listDatasets(),
          pipelineService.listConfigs(),
          reconstructionService.listRuns(undefined, undefined, undefined, 10, 0),
          auditService.verifyHashChain(),
          auditService.listEvents({ limit: 1 }),
        ]);

      setSystemDiagnostics({
        health: healthRes.status === 'fulfilled' ? healthRes.value.data : null,
        latencyMs: healthRes.status === 'fulfilled' ? healthRes.value.latencyMs : null,
        totalDatasets: datasetsRes.status === 'fulfilled' ? datasetsRes.value.datasets.length : 0,
        totalPipelines: pipelinesRes.status === 'fulfilled' ? pipelinesRes.value.pipelines.length : 0,
        totalReconstructions: recRes.status === 'fulfilled' ? recRes.value.total : 0,
        auditVerification: auditVerifyRes.status === 'fulfilled' ? auditVerifyRes.value : null,
        auditEventCount: auditEventsRes.status === 'fulfilled' ? auditEventsRes.value.total : 0,
        timestamp: new Date().toISOString(),
      });
    } catch {
      // Diagnostics secondary error
    }
  }, []);

  // 2. Fetch Datasets Catalog
  const loadDatasets = useCallback(async () => {
    setIsLoading(true);
    setGlobalError(null);
    try {
      const res = await datasetService.listDatasets();
      setDatasets(res.datasets);
      if (res.datasets.length > 0) {
        setSelectedDatasetId((prev) => (prev ? prev : res.datasets[0].dataset_id));
      }
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
    fetchSystemDiagnostics();
  }, [loadDatasets, fetchSystemDiagnostics]);

  // 3. Load Details when selectedDatasetId changes
  const loadDatasetDetails = useCallback(async (datasetId: string) => {
    if (!datasetId) return;
    setIsLoading(true);
    setGlobalError(null);
    try {
      const [metaRes, qualityRes, previewRes, anomalyRes, runsRes] = await Promise.allSettled([
        datasetService.getDatasetById(datasetId),
        datasetService.getDatasetQuality(datasetId),
        datasetService.getDatasetPreview(datasetId, 80, 0),
        anomalyService.getAnomalies({ dataset_id: datasetId, limit: 100 }),
        reconstructionService.listRuns(undefined, undefined, datasetId, 10, 0),
      ]);

      const meta = metaRes.status === 'fulfilled' ? metaRes.value : null;
      const quality = qualityRes.status === 'fulfilled' ? qualityRes.value : null;
      const preview = previewRes.status === 'fulfilled' ? previewRes.value : null;
      const anomList = anomalyRes.status === 'fulfilled' ? anomalyRes.value.anomalies : [];
      const recRuns = runsRes.status === 'fulfilled' ? runsRes.value.runs : [];

      setSelectedDataset(meta);
      setDatasetQuality(quality);
      setDatasetPreview(preview);
      setAnomalies(anomList);

      // Auto-pick first numeric sensor for charts
      if (quality) {
        const numericCols = quality.columns.filter(
          (c) => c.is_numeric && c.name.toLowerCase() !== 'timestamp'
        );
        if (numericCols.length > 0) {
          setSelectedSensorChannel(numericCols[0].name);
        }
      }

      // Check for latest historical reconstruction run
      if (recRuns.length > 0) {
        const latestRun = recRuns[0];
        setActiveRun(latestRun);
        const resultsRes = await reconstructionService.getResults(
          latestRun.reconstruction_run_id,
          undefined,
          undefined,
          200,
          0
        );
        setRecoveryRecords(resultsRes.results);
      } else {
        setActiveRun(null);
        setRecoveryRecords([]);
      }
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      loadDatasetDetails(selectedDatasetId);
    }
  }, [selectedDatasetId, loadDatasetDetails]);

  // Handle CSV file upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    setGlobalError(null);
    try {
      const uploaded = await datasetService.uploadDataset(file);
      await loadDatasets();
      setSelectedDatasetId(uploaded.metadata.dataset_id);
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Synthesize Detected Problems & Proposed Solutions from Real Backend Data
  const detectedProblems: DetectedProblem[] = useMemo(() => {
    if (!selectedDataset) return [];

    // If we already have reconstruction records for this dataset run, use them directly
    if (recoveryRecords.length > 0) {
      return recoveryRecords.map((r) => {
        const isMissing = r.original_value === null || r.original_value === undefined;
        let category: DetectedProblem['category'] = isMissing ? 'MISSING_DATA' : 'STATISTICAL_SPIKE';
        if (!isMissing && r.evidence_summary?.toLowerCase().includes('freeze')) {
          category = 'SENSOR_FREEZE';
        } else if (!isMissing && r.evidence_summary?.toLowerCase().includes('drift')) {
          category = 'SENSOR_DRIFT';
        }

        let eligibility: DetectedProblem['eligibility'] = 'ELIGIBLE';
        if (r.status === 'UNRESOLVED') {
          eligibility = 'ABSTENTION_REQUIRED';
        } else if (r.status === 'ESTIMATED') {
          eligibility = 'REQUIRES_REVIEW';
        }

        return {
          id: r.result_id,
          sensor: r.sensor_column,
          rowIndex: r.source_row_index,
          timestamp: r.timestamp || `Row ${r.source_row_index}`,
          category,
          severity: r.status === 'UNRESOLVED' ? 'HIGH' : isMissing ? 'MEDIUM' : 'MEDIUM',
          originalValue: r.original_value,
          evidence: r.evidence_summary || `Evaluated by ${r.method}`,
          recommendedAction:
            r.status === 'CORRECTED'
              ? `Reconstructed via ${r.method.replace('_', ' ')} with validated confidence.`
              : r.status === 'ESTIMATED'
              ? `Estimated via ${r.method.replace('_', ' ')}. Operator review advised.`
              : `Safe abstention enforced: ${r.abstention_reason || 'insufficient evidence'}.`,
          eligibility,
          confidence: r.confidence_score,
          rationale: r.abstention_reason || `Evidence confidence: ${r.confidence_score.toFixed(1)}%`,
          status: r.status,
          reconstructionRecord: r,
        };
      });
    }

    // Otherwise, generate pre-recovery detected problems from quality audit & anomalies
    const problems: DetectedProblem[] = [];

    // 1. Missing value dropout problems from quality report
    if (datasetQuality) {
      datasetQuality.columns.forEach((col) => {
        if (col.missing_count > 0 && col.is_numeric) {
          const eligibleForInterp = col.missing_count <= 5;
          problems.push({
            id: `prob_missing_${col.name}`,
            sensor: col.name,
            rowIndex: 0,
            timestamp: `Across dataset (${col.missing_count} rows)`,
            category: 'MISSING_DATA',
            severity: col.missing_count > 10 ? 'HIGH' : 'MEDIUM',
            originalValue: null,
            evidence: `${col.missing_count} null/NaN readings (${col.missing_percentage.toFixed(1)}% dropouts)`,
            recommendedAction: eligibleForInterp
              ? 'Interpolate eligible missing readings using linear interpolation within 5-tick span.'
              : 'Abstain as UNRESOLVED on intervals > 5 rows to adhere to zero-hallucination policy.',
            eligibility: eligibleForInterp ? 'ELIGIBLE' : 'ABSTENTION_REQUIRED',
            confidence: eligibleForInterp ? 88.0 : 0.0,
            rationale: eligibleForInterp
              ? 'Internal temporal gap <= 5 samples bounded by measured observations.'
              : 'Contiguous packet loss exceeds safety limit of 5 samples.',
            status: 'PENDING',
          });
        }
      });
    }

    // 2. Anomaly records detected
    anomalies.forEach((a) => {
      const isMulti = a.consensus === 'MULTI_DETECTOR';
      problems.push({
        id: a.anomaly_id,
        sensor: a.sensor_column,
        rowIndex: a.source_row_index,
        timestamp: a.timestamp || `Row ${a.source_row_index}`,
        category: 'STATISTICAL_SPIKE',
        severity: a.severity,
        originalValue: a.original_value,
        evidence: `${a.detectors_flagged.join(', ')}: ${a.detection_reason}`,
        recommendedAction: isMulti
          ? 'Apply cross-sensor corroborated local median reconstruction to replace anomalous spike.'
          : 'Evaluate local median imputation with single-sensor confidence cap (75%).',
        eligibility: isMulti ? 'ELIGIBLE' : 'REQUIRES_REVIEW',
        confidence: a.detector_score !== null && a.detector_score !== undefined ? a.detector_score * 10 : 70.0,
        rationale: isMulti
          ? 'Corroborated by independent statistical and isolation forest detectors.'
          : 'Single-channel observation requires review without cross-channel quorum.',
        status: 'PENDING',
      });
    });

    return problems;
  }, [selectedDataset, recoveryRecords, datasetQuality, anomalies]);

  // Categorized Recovery Plan
  const recoveryPlan = useMemo(() => {
    const ready: DetectedProblem[] = [];
    const requiresReview: DetectedProblem[] = [];
    const cannotSafelyRecover: DetectedProblem[] = [];

    detectedProblems.forEach((p) => {
      if (p.eligibility === 'ELIGIBLE' || p.status === 'CORRECTED') {
        ready.push(p);
      } else if (p.eligibility === 'REQUIRES_REVIEW' || p.status === 'ESTIMATED') {
        requiresReview.push(p);
      } else {
        cannotSafelyRecover.push(p);
      }
    });

    return { ready, requiresReview, cannotSafelyRecover };
  }, [detectedProblems]);

  // Execute End-to-End Recovery
  const handleExecuteRecovery = async () => {
    if (!selectedDatasetId || isExecutingRecovery) return;
    setIsExecutingRecovery(true);
    setGlobalError(null);
    setRecoveryStepIndex(0);

    const stepInterval = setInterval(() => {
      setRecoveryStepIndex((prev) => (prev < recoveryProgressSteps.length - 1 ? prev + 1 : prev));
    }, 600);

    try {
      const res = await reconstructionService.executeRecoveryForDataset(selectedDatasetId, true);
      clearInterval(stepInterval);
      setActiveRun(res.run);

      // Load newly produced results
      const resultsRes = await reconstructionService.getResults(
        res.run.reconstruction_run_id,
        undefined,
        undefined,
        200,
        0
      );
      setRecoveryRecords(resultsRes.results);
      await fetchSystemDiagnostics();
    } catch (err: unknown) {
      clearInterval(stepInterval);
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsExecutingRecovery(false);
    }
  };

  // Submit Operator Review Decision
  const handleCommitReview = async () => {
    if (!reviewModalTarget || isSubmittingReview) return;
    setIsSubmittingReview(true);
    try {
      const customNum =
        operatorDecision === 'MODIFY' && operatorCustomVal.trim() !== ''
          ? parseFloat(operatorCustomVal)
          : undefined;

      const updated = await reconstructionService.reviewResult(reviewModalTarget.result_id, {
        decision: operatorDecision,
        reviewer_name: 'operator_local',
        review_comment: operatorComment.trim() || undefined,
        modified_value: customNum,
      });

      // Update in local records list
      setRecoveryRecords((prev) =>
        prev.map((r) => (r.result_id === updated.result_id ? updated : r))
      );
      setReviewModalTarget(null);
      setOperatorComment('');
      setOperatorCustomVal('');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Download Recovered CSV
  const handleDownloadRecoveredCSV = async () => {
    if (!activeRun) return;
    try {
      await reconstructionService.downloadExport(activeRun.reconstruction_run_id, 'csv');
    } catch (err: unknown) {
      setGlobalError(err instanceof Error ? err.message : String(err));
    }
  };

  // Download Full Recovery Report JSON
  const handleDownloadRecoveryReport = () => {
    if (!selectedDataset) return;
    const report = {
      report_title: 'KINTSUGI — Industrial Recovery & Solution Report',
      dataset_metadata: {
        dataset_id: selectedDataset.dataset_id,
        filename: selectedDataset.filename,
        total_rows: selectedDataset.row_count,
        total_columns: selectedDataset.column_count,
        uploaded_at: selectedDataset.uploaded_at,
      },
      recovery_run: activeRun
        ? {
            run_id: activeRun.reconstruction_run_id,
            pipeline_id: activeRun.pipeline_id,
            executed_at: activeRun.start_time,
            completion_time: activeRun.completion_time,
            status: activeRun.status,
            summary_metrics: activeRun.summary,
          }
        : null,
      before_after_quality_comparison: {
        missing_cells_before: datasetQuality?.total_missing_cells ?? 0,
        missing_cells_after:
          (datasetQuality?.total_missing_cells ?? 0) -
          (activeRun?.summary.estimated_count ?? 0),
        anomalies_detected_before: anomalies.length,
        anomalies_unresolved_after: activeRun?.summary.unresolved_count ?? anomalies.length,
        total_operations_performed: activeRun?.summary.total_evaluated ?? 0,
        successful_repairs:
          (activeRun?.summary.corrected_count ?? 0) + (activeRun?.summary.estimated_count ?? 0),
        abstained_operations: activeRun?.summary.unresolved_count ?? 0,
      },
      recovery_evidence_records: recoveryRecords.map((r) => ({
        result_id: r.result_id,
        sensor: r.sensor_column,
        row_index: r.source_row_index,
        original_measurement: r.original_value,
        final_value: r.final_value,
        status: r.status,
        method: r.method,
        confidence_score: r.confidence_score,
        evidence_summary: r.evidence_summary,
        abstention_reason: r.abstention_reason,
        is_reviewed: r.is_reviewed,
        operator_decision: r.review_decision,
      })),
      non_negotiable_safety_invariants: [
        'Original raw telemetry readings are strictly immutable and retained.',
        'Zero hallucination: sustained communication gaps > 5 rows abstain as UNRESOLVED.',
        'Sequence boundary (row 0) anomalies abstain rather than extrapolate without baseline.',
        'Confidence scores are deterministic mathematical evidence metrics, not simulated probabilities.',
      ],
      generated_at: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kintsugi_recovery_report_${selectedDataset.dataset_id}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filtered Evidence Log Records
  const filteredEvidenceRecords = useMemo(() => {
    return recoveryRecords.filter((r) => {
      if (evidenceFilter === 'ALL') return true;
      if (evidenceFilter === 'CORRECTED') return r.status === 'CORRECTED';
      if (evidenceFilter === 'ESTIMATED') return r.status === 'ESTIMATED';
      if (evidenceFilter === 'UNRESOLVED') return r.status === 'UNRESOLVED';
      if (evidenceFilter === 'REVIEWED') return r.is_reviewed;
      return true;
    });
  }, [recoveryRecords, evidenceFilter]);

  // Unresolved items requiring attention
  const unresolvedItems = useMemo(() => {
    return recoveryRecords.filter((r) => r.status === 'UNRESOLVED');
  }, [recoveryRecords]);

  // Sensor columns for waveform visualization
  const sensorColumns = useMemo(() => {
    if (!datasetQuality) return [];
    return datasetQuality.columns
      .filter((c) => c.is_numeric && c.name.toLowerCase() !== 'timestamp')
      .map((c) => c.name);
  }, [datasetQuality]);

  // Prepare chart series from preview data and recovery records
  const chartData = useMemo(() => {
    if (!datasetPreview || !selectedSensorChannel) return [];
    const rows = datasetPreview.rows;
    const repairsMap = new Map<number, ReconstructionRecord>();
    recoveryRecords
      .filter((r) => r.sensor_column === selectedSensorChannel)
      .forEach((r) => repairsMap.set(r.source_row_index, r));

    return rows.map((row, idx) => {
      const rawVal = row[selectedSensorChannel];
      const parsedRaw = rawVal !== null && rawVal !== undefined && rawVal !== '' ? Number(rawVal) : null;
      const repair = repairsMap.get(idx);

      let finalVal = parsedRaw;
      let pointStatus: ProcessingStatus = parsedRaw !== null ? 'MEASURED' : 'UNRESOLVED';

      if (repair) {
        finalVal = repair.final_value ?? parsedRaw;
        pointStatus = repair.status;
      }

      return {
        index: idx,
        timestamp: row['timestamp'] ? String(row['timestamp']) : `t=${idx}`,
        original: parsedRaw,
        recovered: finalVal,
        status: pointStatus,
        repairRecord: repair,
      };
    });
  }, [datasetPreview, selectedSensorChannel, recoveryRecords]);

  return (
    <div className="space-y-6">
      {/* Hidden file input for CSV upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* PAGE HEADER */}
      <PageHeader
        title="Recovery & Solution Center"
        description="Detect, repair, validate, and recover industrial sensor data with evidence-backed decisions."
        badge={
          systemDiagnostics.health
            ? `Backend Live (${systemDiagnostics.latencyMs ?? 0}ms)`
            : 'Backend Connecting'
        }
        badgeVariant={systemDiagnostics.health ? 'emerald' : 'amber'}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={isLoading}
              onClick={() => {
                if (selectedDatasetId) loadDatasetDetails(selectedDatasetId);
                fetchSystemDiagnostics();
              }}
            >
              Refresh
            </Button>
            {activeRun && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Download}
                  onClick={handleDownloadRecoveredCSV}
                >
                  Download Recovered CSV
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  icon={FileSpreadsheet}
                  onClick={handleDownloadRecoveryReport}
                >
                  Download Recovery Report
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Global Error Banner */}
      {globalError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span className="font-medium">{globalError}</span>
          </div>
          <button
            type="button"
            onClick={() => setGlobalError(null)}
            className="text-rose-500 hover:text-rose-800 text-xs font-semibold cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SECTION A — DATASET SELECTION & CONTEXT BAR */}
      {/* ========================================================================= */}
      <Card>
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
            {/* Left: Dataset Selector Dropdown & Info */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
              <div className="space-y-1 w-full sm:w-auto">
                <span className="text-[11px] font-semibold text-stone-500 uppercase tracking-wider block font-mono">
                  Active Industrial Telemetry Dataset
                </span>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedDatasetId}
                    onChange={(e) => setSelectedDatasetId(e.target.value)}
                    disabled={datasets.length === 0 || isExecutingRecovery}
                    className="w-full sm:w-72 bg-[#F6F5F2] border border-[#E0DCD3] rounded-xl px-3 py-1.5 text-xs font-semibold text-stone-900 focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/30 shadow-2xs transition-all cursor-pointer"
                  >
                    {datasets.map((d) => (
                      <option key={d.dataset_id} value={d.dataset_id}>
                        {d.filename} ({d.row_count} rows)
                      </option>
                    ))}
                    {datasets.length === 0 && <option value="">No datasets available</option>}
                  </select>

                  <Button
                    variant="outline"
                    size="sm"
                    icon={UploadCloud}
                    loading={isUploading}
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload new CSV dataset"
                  >
                    Upload CSV
                  </Button>
                </div>
              </div>
            </div>

            {/* Middle & Right: Metadata Pills */}
            {selectedDataset ? (
              <div className="flex items-center gap-2.5 sm:gap-4 flex-wrap text-xs">
                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 text-[10px] uppercase font-mono block">Dataset ID</span>
                  <span className="font-mono font-semibold text-stone-800 text-[11px]">
                    {selectedDataset.dataset_id}
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 text-[10px] uppercase font-mono block">Rows</span>
                  <span className="font-mono font-semibold text-stone-800 text-[11px]">
                    {selectedDataset.row_count.toLocaleString()}
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 text-[10px] uppercase font-mono block">Sensor Channels</span>
                  <span className="font-mono font-semibold text-stone-800 text-[11px]">
                    {sensorColumns.length > 0 ? sensorColumns.length : selectedDataset.column_count}
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 text-[10px] uppercase font-mono block">Ingestion State</span>
                  <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 text-[11px]">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                    Verified CSV
                  </span>
                </div>

                <div className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-200">
                  <span className="text-stone-400 text-[10px] uppercase font-mono block">Recovery Status</span>
                  <span
                    className={`inline-flex items-center gap-1 font-semibold text-[11px] ${
                      activeRun ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {activeRun ? (
                      <>
                        <ShieldCheck className="w-3 h-3 text-emerald-600" />
                        Recovered
                      </>
                    ) : (
                      <>
                        <Clock className="w-3 h-3 text-amber-600" />
                        Ready to Recover
                      </>
                    )}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-stone-500 italic">No dataset selected</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SECTION D — PRIMARY ACTION: EXECUTE RECOVERY */}
      {/* ========================================================================= */}
      <Card className="border-[#EE602C]/30 bg-gradient-to-r from-stone-900 via-stone-950 to-stone-900 text-white shadow-md">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
            <div className="space-y-1.5 max-w-2xl">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-[#EE602C] text-white text-[10px] font-bold uppercase tracking-wider">
                  Automated Self-Healing Pipeline
                </span>
                <span className="text-stone-400 text-xs">
                  {selectedDataset ? `Target: ${selectedDataset.filename}` : 'Select a dataset'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Confidence-Aware Sensor Telemetry Recovery
              </h2>
              <p className="text-stone-300 text-xs leading-relaxed">
                Applies bounded linear interpolation to small packet gaps (≤ 5 rows) and local median
                filtering with cross-sensor agreement. Preserves original raw readings untouched in
                storage while computing multi-factor confidence evidence.
              </p>
            </div>

            <div className="shrink-0 w-full md:w-auto">
              <Button
                variant="primary"
                size="lg"
                icon={Play}
                loading={isExecutingRecovery}
                disabled={!selectedDatasetId || isExecutingRecovery}
                onClick={handleExecuteRecovery}
                className="w-full md:w-auto bg-[#EE602C] hover:bg-[#D95322] text-white font-bold shadow-md shadow-[#EE602C]/30 cursor-pointer text-sm px-6 py-3"
              >
                {isExecutingRecovery ? 'Executing Recovery...' : 'Execute Recovery'}
              </Button>
            </div>
          </div>

          {/* Progress / Step indicator while running */}
          {isExecutingRecovery && (
            <div className="mt-5 pt-4 border-t border-stone-800 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono text-stone-300">
                <span className="flex items-center gap-2 text-amber-400 font-semibold animate-pulse">
                  <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                  {recoveryProgressSteps[recoveryStepIndex]}
                </span>
                <span>
                  Step {recoveryStepIndex + 1} of {recoveryProgressSteps.length}
                </span>
              </div>
              <div className="w-full h-1.5 rounded-full bg-stone-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-[#EE602C] transition-all duration-300"
                  style={{
                    width: `${((recoveryStepIndex + 1) / recoveryProgressSteps.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SECTION B — DETECTED PROBLEMS & RECOMMENDED SOLUTIONS */}
      {/* ========================================================================= */}
      <Card>
        <CardHeader
          title="Detected Problems & Recommended Solutions"
          subtitle="Genuine anomalies and packet dropouts identified by backend detectors with algorithmically eligible actions"
          icon={AlertTriangle}
          badge={
            <span className="text-xs font-mono font-semibold text-stone-600 bg-stone-100 px-2.5 py-1 rounded-full border border-stone-200">
              {detectedProblems.length} Detected Issue{detectedProblems.length === 1 ? '' : 's'}
            </span>
          }
        />
        <CardContent>
          {detectedProblems.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
              <h3 className="font-bold text-stone-800 text-sm">Clean Dataset — No Defects Detected</h3>
              <p className="text-xs text-stone-500 max-w-md mx-auto">
                No missing cells or anomalous spikes were flagged for this dataset. Signal values adhere
                to standard operating bounds.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {detectedProblems.slice(0, 9).map((prob) => (
                  <div
                    key={prob.id}
                    className="p-4 rounded-xl bg-stone-50 border border-stone-200 hover:border-stone-300 transition-all space-y-2.5 flex flex-col justify-between"
                  >
                    <div className="space-y-1.5">
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-white text-stone-700 border border-stone-200 truncate max-w-[140px]">
                          {prob.sensor}
                        </span>
                        <span
                          className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            prob.category === 'MISSING_DATA'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {prob.category.replace('_', ' ')}
                        </span>
                      </div>

                      {/* Heading */}
                      <div className="text-xs font-bold text-stone-900 leading-snug">
                        {prob.timestamp}
                      </div>

                      {/* Evidence */}
                      <p className="text-[11px] text-stone-600 leading-relaxed font-mono">
                        {prob.evidence}
                      </p>
                    </div>

                    {/* Action & Eligibility */}
                    <div className="pt-2 border-t border-stone-200/80 space-y-2">
                      <div className="text-[11px] text-stone-800 font-medium leading-snug">
                        <span className="text-stone-500 font-semibold text-[10px] block uppercase font-mono">
                          Recommended Action:
                        </span>
                        {prob.recommendedAction}
                      </div>

                      <div className="flex items-center justify-between text-[10px] pt-1">
                        <span
                          className={`font-semibold px-2 py-0.5 rounded-full ${
                            prob.eligibility === 'ELIGIBLE'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : prob.eligibility === 'REQUIRES_REVIEW'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-stone-200 text-stone-700'
                          }`}
                        >
                          {prob.eligibility === 'ELIGIBLE'
                            ? 'Eligible'
                            : prob.eligibility === 'REQUIRES_REVIEW'
                            ? 'Review Advised'
                            : 'Abstain Required'}
                        </span>

                        <span className="font-mono text-stone-500">
                          {prob.confidence !== null ? `Conf: ${prob.confidence.toFixed(1)}%` : 'Pending'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {detectedProblems.length > 9 && (
                <div className="text-center pt-2">
                  <span className="text-xs text-stone-500">
                    Showing top 9 issues of {detectedProblems.length} total detected. See Full Evidence Log below for complete itemized audit.
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SECTION C — RECOVERY PLAN */}
      {/* ========================================================================= */}
      <Card>
        <CardHeader
          title="Recovery Plan"
          subtitle="Triage matrix classifying issues into safe automated repairs, items requiring review, and boundary abstentions"
          icon={Layers}
        />
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Category 1: Ready for Recovery */}
            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Ready for Recovery
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-200/80 text-emerald-900 font-mono">
                  {recoveryPlan.ready.length}
                </span>
              </div>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Eligible for deterministic linear interpolation or local median estimation with valid
                temporal neighbors and cross-sensor corroboration.
              </p>
              <div className="space-y-1.5 text-xs text-stone-700 font-mono pt-1 border-t border-emerald-200">
                <div className="text-[10px] text-stone-500 font-semibold uppercase">Proposed Methods:</div>
                <div className="text-[11px] text-stone-800">• Linear Interpolation (gap ≤ 5)</div>
                <div className="text-[11px] text-stone-800">• Local Median (window r=2, min=3)</div>
                <div className="text-[10px] text-emerald-700 font-sans font-medium mt-1">
                  Automatic execution permitted when confidence &gt; 80%.
                </div>
              </div>
            </div>

            {/* Category 2: Requires Review */}
            <div className="p-4 rounded-xl bg-amber-50/60 border border-amber-200/90 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-950 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  Requires Review
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900 font-mono">
                  {recoveryPlan.requiresReview.length}
                </span>
              </div>
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Single-sensor fallback with confidence capped at 75%, or observations lacking neighboring
                cross-channel correlation. Operator confirmation required.
              </p>
              <div className="space-y-1.5 text-xs text-stone-700 font-mono pt-1 border-t border-amber-200">
                <div className="text-[10px] text-stone-500 font-semibold uppercase">Known Limitations:</div>
                <div className="text-[11px] text-stone-800">• Single-channel MAD reliance</div>
                <div className="text-[11px] text-stone-800">• Candidate flagged as ESTIMATED</div>
                <div className="text-[10px] text-amber-800 font-sans font-medium mt-1">
                  Requires manual ACCEPT / REJECT review action.
                </div>
              </div>
            </div>

            {/* Category 3: Cannot Safely Recover */}
            <div className="p-4 rounded-xl bg-stone-100 border border-stone-200 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-800 uppercase tracking-wider font-mono flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-stone-600" />
                  Cannot Safely Recover
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-stone-200 text-stone-800 font-mono">
                  {recoveryPlan.cannotSafelyRecover.length}
                </span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Sequence boundaries (Row 0), sustained communication loss (&gt; 5 rows), or zero-hallucination
                invariant protections where mathematical evidence is absent.
              </p>
              <div className="space-y-1.5 text-xs text-stone-700 font-mono pt-1 border-t border-stone-200">
                <div className="text-[10px] text-stone-500 font-semibold uppercase">Invariants Enforced:</div>
                <div className="text-[11px] text-stone-800">• Abstain as UNRESOLVED</div>
                <div className="text-[11px] text-stone-800">• Zero fabricated sensor values</div>
                <div className="text-[10px] text-stone-700 font-sans font-medium mt-1">
                  Safe abstention is a valid industrial outcome.
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ========================================================================= */}
      {/* SECTION E — BEFORE-AND-AFTER RESULTS & WAVEFORM VISUALIZER */}
      {/* ========================================================================= */}
      {activeRun && (
        <Card className="border-[#EE602C]/20">
          <CardHeader
            title="Recovery Results & Before-and-After Verification"
            subtitle={`Run ID: ${activeRun.reconstruction_run_id} • Executed at ${new Date(
              activeRun.start_time
            ).toLocaleTimeString()}`}
            icon={Sparkles}
            badge={
              <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-300 font-mono">
                {activeRun.summary.corrected_count + activeRun.summary.estimated_count} Fixed •{' '}
                {activeRun.summary.unresolved_count} Abstained
              </span>
            }
          />
          <CardContent className="space-y-6">
            {/* 6 Key Comparison Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-stone-500 uppercase font-mono block">
                  Missing Cells Before
                </span>
                <span className="text-xl font-bold font-mono text-stone-900">
                  {datasetQuality?.total_missing_cells ?? 0}
                </span>
                <span className="text-[10px] text-stone-400 block font-mono">Raw dropouts</span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-emerald-800 uppercase font-mono block">
                  Missing Cells After
                </span>
                <span className="text-xl font-bold font-mono text-emerald-700">
                  {Math.max(
                    0,
                    (datasetQuality?.total_missing_cells ?? 0) - activeRun.summary.estimated_count
                  )}
                </span>
                <span className="text-[10px] text-emerald-600 block font-mono">
                  -{activeRun.summary.estimated_count} repaired
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-stone-500 uppercase font-mono block">
                  Flagged Anomalies
                </span>
                <span className="text-xl font-bold font-mono text-stone-900">
                  {activeRun.summary.total_evaluated}
                </span>
                <span className="text-[10px] text-stone-400 block font-mono">Total evaluated</span>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-emerald-800 uppercase font-mono block">
                  Successfully Healed
                </span>
                <span className="text-xl font-bold font-mono text-emerald-700">
                  {activeRun.summary.corrected_count + activeRun.summary.estimated_count}
                </span>
                <span className="text-[10px] text-emerald-600 block font-mono">Transformed</span>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-amber-800 uppercase font-mono block">
                  Safe Abstentions
                </span>
                <span className="text-xl font-bold font-mono text-amber-700">
                  {activeRun.summary.unresolved_count}
                </span>
                <span className="text-[10px] text-amber-600 block font-mono">UNRESOLVED</span>
              </div>

              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 text-center space-y-1">
                <span className="text-[10px] font-semibold text-stone-500 uppercase font-mono block">
                  Mean Confidence
                </span>
                <span className="text-xl font-bold font-mono text-[#EE602C]">
                  {activeRun.summary.average_confidence.toFixed(1)}%
                </span>
                <span className="text-[10px] text-stone-400 block font-mono">Evidence score</span>
              </div>
            </div>

            {/* Time Series Dual Waveform Visualizer */}
            <div className="p-4 rounded-2xl bg-white border border-[#EBE7E1] space-y-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[#EE602C]" />
                    Dual-Series Sensor Waveform Inspection
                  </h3>
                  <p className="text-xs text-stone-500">
                    Comparing unaltered original raw telemetry vs recovered signals across sample sequence
                  </p>
                </div>

                {/* Sensor Channel Selector */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-mono text-stone-500 font-semibold">Sensor:</span>
                  <div className="flex items-center gap-1 flex-wrap">
                    {sensorColumns.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => setSelectedSensorChannel(col)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer ${
                          selectedSensorChannel === col
                            ? 'bg-[#EE602C] text-white shadow-2xs'
                            : 'bg-stone-100 hover:bg-stone-200 text-stone-700'
                        }`}
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Legend */}
              <div className="flex items-center gap-4 text-xs font-mono flex-wrap pt-1 border-t border-stone-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-stone-400 rounded-full" />
                  <span className="text-stone-600">Original Telemetry</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-1 bg-[#EE602C] rounded-full" />
                  <span className="text-stone-900 font-semibold">Recovered Signal</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white" />
                  <span className="text-emerald-700">CORRECTED (Outlier)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 border border-white" />
                  <span className="text-amber-800">ESTIMATED (Interpolated)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-rose-500 border border-white" />
                  <span className="text-rose-700">UNRESOLVED (Abstained)</span>
                </div>
              </div>

              {/* SVG Visualization */}
              <div className="w-full h-56 bg-stone-50/80 rounded-xl border border-stone-200 relative overflow-hidden flex items-center justify-center p-2">
                {chartData.length === 0 ? (
                  <span className="text-xs text-stone-400 font-mono">No data points available for channel</span>
                ) : (
                  <svg className="w-full h-full" viewBox="0 0 800 200" preserveAspectRatio="none">
                    {(() => {
                      const validVals = chartData
                        .flatMap((d) => [d.original, d.recovered])
                        .filter((v): v is number => v !== null && !isNaN(v));

                      const min = validVals.length > 0 ? Math.min(...validVals) : 0;
                      const max = validVals.length > 0 ? Math.max(...validVals) : 100;
                      const range = max - min || 1;
                      const padding = 15;
                      const width = 800;
                      const height = 200;

                      const getX = (idx: number) =>
                        padding + (idx / Math.max(1, chartData.length - 1)) * (width - 2 * padding);
                      const getY = (val: number | null) => {
                        if (val === null || isNaN(val)) return height / 2;
                        return height - padding - ((val - min) / range) * (height - 2 * padding);
                      };

                      // Generate polyline for original
                      const origPoints = chartData
                        .filter((d) => d.original !== null)
                        .map((d) => `${getX(d.index)},${getY(d.original)}`)
                        .join(' ');

                      // Generate polyline for recovered
                      const recPoints = chartData
                        .filter((d) => d.recovered !== null)
                        .map((d) => `${getX(d.index)},${getY(d.recovered)}`)
                        .join(' ');

                      return (
                        <>
                          {/* Grid Lines */}
                          <line x1={0} y1={50} x2={800} y2={50} stroke="#E7E5E4" strokeDasharray="3 3" />
                          <line x1={0} y1={100} x2={800} y2={100} stroke="#E7E5E4" strokeDasharray="3 3" />
                          <line x1={0} y1={150} x2={800} y2={150} stroke="#E7E5E4" strokeDasharray="3 3" />

                          {/* Original line (gray dashed) */}
                          {origPoints && (
                            <polyline
                              fill="none"
                              stroke="#A8A29E"
                              strokeWidth="1.5"
                              strokeDasharray="4 2"
                              points={origPoints}
                            />
                          )}

                          {/* Recovered line (solid orange) */}
                          {recPoints && (
                            <polyline
                              fill="none"
                              stroke="#EE602C"
                              strokeWidth="2.5"
                              points={recPoints}
                            />
                          )}

                          {/* Special markers */}
                          {chartData.map((d) => {
                            if (d.status === 'CORRECTED') {
                              return (
                                <circle
                                  key={`c-${d.index}`}
                                  cx={getX(d.index)}
                                  cy={getY(d.recovered)}
                                  r="4.5"
                                  fill="#10B981"
                                  stroke="#FFFFFF"
                                  strokeWidth="1.5"
                                />
                              );
                            }
                            if (d.status === 'ESTIMATED') {
                              return (
                                <rect
                                  key={`e-${d.index}`}
                                  x={getX(d.index) - 3.5}
                                  y={getY(d.recovered) - 3.5}
                                  width="7"
                                  height="7"
                                  fill="#F59E0B"
                                  stroke="#FFFFFF"
                                  strokeWidth="1.5"
                                />
                              );
                            }
                            if (d.status === 'UNRESOLVED' && d.original === null) {
                              return (
                                <circle
                                  key={`u-${d.index}`}
                                  cx={getX(d.index)}
                                  cy={getY(min)}
                                  r="4"
                                  fill="#F43F5E"
                                  stroke="#FFFFFF"
                                  strokeWidth="1.5"
                                />
                              );
                            }
                            return null;
                          })}
                        </>
                      );
                    })()}
                  </svg>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* SECTION F — RECOVERY EVIDENCE & CHANGE LOG */}
      {/* ========================================================================= */}
      {activeRun && (
        <Card>
          <CardHeader
            title="Recovery Evidence & Change Log"
            subtitle="Itemized audit trail of every candidate evaluation, evidence scores, and committed transformations"
            icon={FileText}
            badge={
              <div className="flex items-center gap-1 bg-stone-100 p-0.5 rounded-lg border border-stone-200">
                {(['ALL', 'CORRECTED', 'ESTIMATED', 'UNRESOLVED', 'REVIEWED'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setEvidenceFilter(tab)}
                    className={`px-2.5 py-1 text-[11px] font-mono font-semibold rounded-md transition-all cursor-pointer ${
                      evidenceFilter === tab
                        ? 'bg-white text-stone-900 shadow-2xs'
                        : 'text-stone-500 hover:text-stone-900'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            }
          />
          <CardContent>
            {filteredEvidenceRecords.length === 0 ? (
              <div className="py-8 text-center text-xs text-stone-500 font-mono">
                No recovery evidence records matching filter '{evidenceFilter}'.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500 font-mono text-[10px] uppercase">
                      <th className="py-2.5 px-3">Row / Time</th>
                      <th className="py-2.5 px-3">Sensor</th>
                      <th className="py-2.5 px-3">Original Raw</th>
                      <th className="py-2.5 px-3">Recovered Final</th>
                      <th className="py-2.5 px-3">Method</th>
                      <th className="py-2.5 px-3">Confidence</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Evidence Rationale</th>
                      <th className="py-2.5 px-3 text-right">Review Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 font-mono">
                    {filteredEvidenceRecords.slice(0, 50).map((r) => (
                      <tr key={r.result_id} className="hover:bg-stone-50/80 transition-colors">
                        <td className="py-2 px-3 font-semibold text-stone-900">
                          {r.timestamp ? r.timestamp : `Row ${r.source_row_index}`}
                        </td>
                        <td className="py-2 px-3">
                          <span className="px-2 py-0.5 rounded bg-stone-100 text-stone-700 font-medium">
                            {r.sensor_column}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-stone-600">
                          {r.original_value !== null && r.original_value !== undefined ? (
                            <span>{r.original_value.toFixed(2)}</span>
                          ) : (
                            <span className="text-amber-700 italic">null (NaN)</span>
                          )}
                        </td>
                        <td className="py-2 px-3 font-bold text-stone-900">
                          {r.final_value !== null && r.final_value !== undefined ? (
                            r.final_value.toFixed(2)
                          ) : (
                            <span className="text-stone-400">—</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-stone-700 text-[11px]">
                          {r.method.replace('_', ' ')}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`font-bold ${
                                r.confidence_score >= 80
                                  ? 'text-emerald-700'
                                  : r.confidence_score >= 60
                                  ? 'text-amber-700'
                                  : 'text-rose-700'
                              }`}
                            >
                              {r.confidence_score.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              r.status === 'CORRECTED'
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : r.status === 'ESTIMATED'
                                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-[11px] text-stone-600 max-w-xs truncate" title={r.abstention_reason || r.evidence_summary}>
                          {r.abstention_reason || r.evidence_summary || 'Evidence verified'}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-[10px] py-0.5 px-2 font-sans"
                            onClick={() => {
                              setReviewModalTarget(r);
                              setOperatorDecision('ACCEPT');
                              setOperatorComment(r.review_comment || '');
                              setOperatorCustomVal(
                                r.final_value !== null && r.final_value !== undefined
                                  ? String(r.final_value)
                                  : ''
                              );
                            }}
                          >
                            {r.is_reviewed ? 'Reviewed' : 'Review'}
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
      )}

      {/* ========================================================================= */}
      {/* SECTION G — UNRESOLVED ISSUES AND HUMAN REVIEW */}
      {/* ========================================================================= */}
      {unresolvedItems.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/20">
          <CardHeader
            title="Issues Requiring Attention — Safe Abstentions"
            subtitle="Readings where available mathematical evidence was insufficient to guarantee zero hallucination"
            icon={ShieldAlert}
            badge={
              <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono text-xs font-bold border border-amber-300">
                {unresolvedItems.length} Abstained
              </span>
            }
          />
          <CardContent className="space-y-3">
            <div className="p-3.5 rounded-xl bg-amber-100/60 border border-amber-200 text-amber-950 text-xs flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-bold">Safe abstention is a valid industrial outcome, not a system failure.</span>
                <p className="text-amber-900 leading-relaxed text-[11px]">
                  When telemetry dropouts exceed maximum supported spans or occur at sequence boundaries (Row 0),
                  KINTSUGI strictly refuses to hallucinate synthetic values. You can inspect or explicitly override
                  these readings below.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {unresolvedItems.slice(0, 6).map((unres) => (
                <div
                  key={unres.result_id}
                  className="p-3.5 rounded-xl bg-white border border-stone-200 space-y-2 text-xs flex flex-col justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between font-mono">
                      <span className="font-bold text-stone-900">{unres.sensor_column}</span>
                      <span className="text-stone-500">{unres.timestamp || `Row ${unres.source_row_index}`}</span>
                    </div>
                    <p className="text-[11px] text-stone-600 font-mono">
                      {unres.abstention_reason || 'Abstained due to boundary condition or wide gap.'}
                    </p>
                  </div>

                  <div className="pt-2 border-t border-stone-100 flex items-center justify-between">
                    <span className="text-[10px] text-stone-400 font-mono">Status: UNRESOLVED</span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] py-0.5 px-2"
                      onClick={() => {
                        setReviewModalTarget(unres);
                        setOperatorDecision('ACCEPT');
                        setOperatorComment('');
                        setOperatorCustomVal('');
                      }}
                    >
                      Operator Decision
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* SECTION I — RETAIN SYSTEM DIAGNOSTICS (COLLAPSIBLE ACCORDION) */}
      {/* ========================================================================= */}
      <Card>
        <div
          role="button"
          tabIndex={0}
          onClick={() => setDiagnosticsExpanded(!diagnosticsExpanded)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDiagnosticsExpanded(!diagnosticsExpanded);
            }
          }}
          className="p-5 flex items-center justify-between cursor-pointer hover:bg-stone-50/70 transition-colors select-none"
        >
          <div className="flex items-center gap-3">
            <Server className="w-5 h-5 text-[#EE602C]" />
            <div>
              <h3 className="text-sm font-bold text-stone-900">
                System Diagnostics & Operational Limitations
              </h3>
              <p className="text-xs text-stone-500">
                Backend runtime health, local cryptographic hash chain, and safety standards
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-stone-500 bg-stone-100 px-2 py-0.5 rounded">
              {diagnosticsExpanded ? 'Hide Diagnostics' : 'Show Diagnostics'}
            </span>
            {diagnosticsExpanded ? (
              <ChevronUp className="w-4 h-4 text-stone-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-stone-500" />
            )}
          </div>
        </div>

        {diagnosticsExpanded && (
          <CardContent className="pt-0 border-t border-stone-200/80 space-y-6">
            {/* Top 4 Real Operational Diagnostic Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
              {/* Card 1: Backend Runtime */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-[#EE602C]" />
                    FastAPI Runtime
                  </span>
                  <span className="text-[10px] uppercase font-bold text-emerald-700">
                    {systemDiagnostics.health ? 'Operational' : 'Unavailable'}
                  </span>
                </div>
                <div className="text-xl font-bold text-stone-900 font-mono">
                  {systemDiagnostics.latencyMs !== null ? `${systemDiagnostics.latencyMs} ms` : 'Not available'}
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Average round-trip health ping latency to Python core.
                </p>
              </div>

              {/* Card 2: Datasets & Schema */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#EE602C]" />
                    Dataset Storage
                  </span>
                  <span className="text-[10px] uppercase font-bold text-stone-700">Active Catalog</span>
                </div>
                <div className="text-xl font-bold text-stone-900 font-mono">
                  {systemDiagnostics.totalDatasets} Datasets
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Ingested industrial CSV files with verified schema.
                </p>
              </div>

              {/* Card 3: Reconstruction Engine */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-[#EE602C]" />
                    Self-Healing Engine
                  </span>
                  <span className="text-[10px] uppercase font-bold text-stone-700">Executed Runs</span>
                </div>
                <div className="text-xl font-bold text-stone-900 font-mono">
                  {systemDiagnostics.totalReconstructions} Runs
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Confidence-weighted repair runs with recorded decisions.
                </p>
              </div>

              {/* Card 4: SHA-256 Hash Chain */}
              <div className="p-4 rounded-xl bg-stone-50 border border-stone-200 space-y-2">
                <div className="flex items-center justify-between text-xs text-stone-500 font-mono">
                  <span className="flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5 text-[#EE602C]" />
                    Audit Chain Integrity
                  </span>
                  <span
                    className={`text-[10px] uppercase font-bold ${
                      systemDiagnostics.auditVerification?.is_valid ? 'text-emerald-700' : 'text-amber-700'
                    }`}
                  >
                    {systemDiagnostics.auditVerification?.is_valid ? 'Verified' : 'Pending Check'}
                  </span>
                </div>
                <div className="text-xl font-bold text-stone-900 font-mono">
                  {systemDiagnostics.auditEventCount} Events
                </div>
                <p className="text-[11px] text-stone-500 leading-tight">
                  Immutable local SHA-256 append-only ledger entries verified.
                </p>
              </div>
            </div>

            {/* Standards & Limitations Panels */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Panel 1: Integrity Guarantees */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-900 uppercase font-mono tracking-wider">
                  System Integrity & Safety Standards
                </h4>
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                    <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Raw Telemetry Immutability
                    </span>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Raw sensor telemetry is never altered in place. Repaired datasets exist as separate downstream streams with complete provenance.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs space-y-1">
                    <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                      Zero Hallucination / Boundary Abstention
                    </span>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      When anomalies occur at sequence boundaries (Row 0) or span communication gaps &gt; 5 rows, algorithms strictly abstain as UNRESOLVED.
                    </p>
                  </div>
                </div>
              </div>

              {/* Panel 2: Operational Bounds & Limitations */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-stone-900 uppercase font-mono tracking-wider">
                  Operational Bounds & Engineering Constraints
                </h4>
                <div className="space-y-2.5">
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-1">
                    <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      Local Cryptographic Ledger Scope
                    </span>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      The SHA-256 audit chain provides tamper-evident local hash sequencing. It proves internal integrity across runs but is not a globally distributed blockchain.
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200 text-xs space-y-1">
                    <span className="font-semibold text-stone-800 flex items-center gap-1.5">
                      <HelpCircle className="w-3.5 h-3.5 text-amber-700" />
                      Single-Sensor Fallback Limits
                    </span>
                    <p className="text-stone-600 text-[11px] leading-relaxed">
                      Single-channel anomalies rely on rolling MAD and local median imputation. Without cross-correlated channels, confidence evidence is capped at 75%.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Panel 3: Human-Configured Operational Thresholds */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-stone-900 uppercase font-mono tracking-wider">
                  Human-Configured Operational Thresholds & Safety Limits
                </h4>
                <Button
                  variant="outline"
                  size="sm"
                  icon={Sliders}
                  onClick={() => navigate('/settings')}
                  className="text-[11px] py-1"
                >
                  Configure in Settings
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {thresholdPolicy.thresholds
                  .filter((t) => t.includeInReports)
                  .map((unit) => (
                    <div
                      key={unit.id}
                      className="p-3 rounded-xl bg-stone-50 border border-stone-200 space-y-1.5 text-xs font-mono"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-stone-900">{unit.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-white text-stone-700 border border-stone-200">
                          {unit.unit}
                        </span>
                      </div>
                      <div className="text-[11px] space-y-0.5">
                        <div className="text-emerald-700">Nominal: {unit.nominalValue} {unit.unit}</div>
                        <div className="text-amber-800">Warning: {unit.warningLow} – {unit.warningHigh} {unit.unit}</div>
                        <div className="text-rose-800">Critical: &lt; {unit.criticalLow} | &gt; {unit.criticalHigh} {unit.unit}</div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* OPERATOR REVIEW MODAL */}
      {/* ========================================================================= */}
      {reviewModalTarget && (
        <div className="fixed inset-0 z-50 bg-stone-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-stone-200 shadow-2xl max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-[#EE602C]" />
                <h3 className="font-bold text-stone-900 text-sm">
                  Record Operator Review Decision
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalTarget(null)}
                className="text-stone-400 hover:text-stone-700 cursor-pointer text-lg leading-none"
              >
                ×
              </button>
            </div>

            {/* Context Info */}
            <div className="p-3 rounded-xl bg-stone-50 border border-stone-200 text-xs font-mono space-y-1.5">
              <div className="flex justify-between text-stone-600">
                <span>Result ID:</span>
                <span className="font-bold text-stone-900">{reviewModalTarget.result_id}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Sensor Channel:</span>
                <span className="font-bold text-stone-900">{reviewModalTarget.sensor_column}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Original Value:</span>
                <span>{reviewModalTarget.original_value !== null ? reviewModalTarget.original_value : 'null (NaN)'}</span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Proposed Value:</span>
                <span className="text-emerald-700 font-bold">
                  {reviewModalTarget.proposed_value !== null ? reviewModalTarget.proposed_value : 'None (Abstained)'}
                </span>
              </div>
              <div className="flex justify-between text-stone-600">
                <span>Confidence Score:</span>
                <span>{reviewModalTarget.confidence_score.toFixed(1)}%</span>
              </div>
            </div>

            {/* Decision Radio Group */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-stone-700 block uppercase font-mono">
                Operator Decision:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['ACCEPT', 'REJECT', 'MODIFY'] as const).map((dec) => (
                  <button
                    key={dec}
                    type="button"
                    onClick={() => setOperatorDecision(dec)}
                    className={`py-2 px-3 rounded-xl text-xs font-mono font-bold transition-all border cursor-pointer ${
                      operatorDecision === dec
                        ? 'bg-[#EE602C] text-white border-[#EE602C] shadow-2xs'
                        : 'bg-stone-50 hover:bg-stone-100 text-stone-700 border-stone-200'
                    }`}
                  >
                    {dec}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Value if MODIFY */}
            {operatorDecision === 'MODIFY' && (
              <div className="space-y-1 font-mono text-xs">
                <label className="text-stone-700 font-semibold block">
                  Custom Modified Value (Float):
                </label>
                <input
                  type="number"
                  step="any"
                  value={operatorCustomVal}
                  onChange={(e) => setOperatorCustomVal(e.target.value)}
                  placeholder="Enter custom corrected numeric value"
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-3 py-1.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
                />
              </div>
            )}

            {/* Comment */}
            <div className="space-y-1 font-mono text-xs">
              <label className="text-stone-700 font-semibold block">
                Operator Rationale / Notes:
              </label>
              <textarea
                rows={2}
                value={operatorComment}
                onChange={(e) => setOperatorComment(e.target.value)}
                placeholder="Optional engineering rationale for SHA-256 audit log..."
                className="w-full bg-stone-50 border border-stone-200 rounded-xl p-2.5 text-xs text-stone-900 focus:outline-hidden focus:border-[#EE602C]"
              />
            </div>

            {/* Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-stone-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReviewModalTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                loading={isSubmittingReview}
                onClick={handleCommitReview}
              >
                Commit Decision
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
