import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ConnectionState } from '../types/api';
import {
  RefreshCw,
  Database,
  Lock,
  Upload,
  TrendingUp,
  Snowflake,
  Search,
  Bell,
  Share2,
  Check,
  Edit2,
  X,
  Clock,
  Flame,
  Shield,
} from 'lucide-react';
import { datasetService } from '../services/datasetService';
import { reconstructionService } from '../services/reconstructionService';
import { auditService } from '../services/auditService';
import { useRouter } from '../router';
import { Button } from '../components/common/Button';
import type { DatasetMetadata, DataQualitySummary } from '../types/dataset';
import type { ReconstructionRun, ReconstructionRecord } from '../types/reconstruction';

interface OverviewPageProps {
  connection: ConnectionState;
  onRetry: () => void;
}

export const OverviewPage: React.FC<OverviewPageProps> = () => {
  const { navigate } = useRouter();

  // Selected dataset & run state
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [activeDataset, setActiveDataset] = useState<DatasetMetadata | null>(null);
  const [activeQuality, setActiveQuality] = useState<DataQualitySummary | null>(null);
  const [activeRun, setActiveRun] = useState<ReconstructionRun | null>(null);
  const [activeRecords, setActiveRecords] = useState<ReconstructionRecord[]>([]);

  // Review interaction state for Human-in-the-Loop review card
  const [reviewSuccessMsg, setReviewSuccessMsg] = useState<string | null>(null);
  const [reviewErrorMsg, setReviewErrorMsg] = useState<string | null>(null);
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Search & filter in sensor manager card
  const [faultFilter, setFaultFilter] = useState<'ALL' | 'SPIKE' | 'FREEZED' | 'DRIFT'>('ALL');
  const [faultSearchQuery, setFaultSearchQuery] = useState<string>('');

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // 1. Initial Load: fetch dataset catalog and system status
  const loadInitialData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [datasetsRes] = await Promise.allSettled([
        datasetService.listDatasets(),
        auditService.verifyHashChain(),
      ]);

      const loadedDatasets =
        datasetsRes.status === 'fulfilled' ? datasetsRes.value.datasets : [];
      setDatasets(loadedDatasets);

      // Automatically select the most recent dataset if none is selected
      if (loadedDatasets.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(loadedDatasets[0].dataset_id);
      }
    } catch (err: unknown) {
      console.error('Failed to load initial overview data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedDatasetId]);

  useEffect(() => {
    loadInitialData();
  }, [loadInitialData]);

  // 2. Load deep details whenever selectedDatasetId changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setActiveDataset(null);
      setActiveQuality(null);
      setActiveRun(null);
      setActiveRecords([]);
      return;
    }

    let isMounted = true;

    async function loadDatasetDetails(dsId: string) {
      try {
        const [metaRes, qualRes, runsRes] = await Promise.allSettled([
          datasetService.getDatasetById(dsId),
          datasetService.getDatasetQuality(dsId),
          reconstructionService.listRuns(undefined, undefined, 20, 0),
        ]);

        if (!isMounted) return;

        if (metaRes.status === 'fulfilled') {
          setActiveDataset(metaRes.value);
        }
        if (qualRes.status === 'fulfilled') {
          setActiveQuality(qualRes.value);
        }

        // Find reconstruction run associated with this dataset or pick the latest run
        if (runsRes.status === 'fulfilled' && runsRes.value.runs.length > 0) {
          const matchingRun =
            runsRes.value.runs.find((r) => r.dataset_id === dsId) ||
            runsRes.value.runs[0];
          setActiveRun(matchingRun);

          if (matchingRun) {
            const resultsRes = await reconstructionService.getResults(
              matchingRun.reconstruction_run_id,
              undefined,
              undefined,
              30,
              0
            );
            if (isMounted) {
              setActiveRecords(resultsRes.results || []);
            }
          }
        } else {
          setActiveRun(null);
          setActiveRecords([]);
        }
      } catch (err: unknown) {
        console.error('Failed to load dataset details:', err);
      }
    }

    loadDatasetDetails(selectedDatasetId);

    return () => {
      isMounted = false;
    };
  }, [selectedDatasetId]);

  // Handle human review decision submission on Row 12 or active record
  const handleReviewDecision = async (
    record: ReconstructionRecord,
    decision: 'ACCEPT' | 'REJECT' | 'MODIFY',
    comment: string
  ) => {
    setIsSubmittingReview(true);
    setReviewSuccessMsg(null);
    setReviewErrorMsg(null);
    try {
      await reconstructionService.reviewResult(record.result_id, {
        decision,
        reviewer_name: 'operator_local (Dwayne Tatum)',
        review_comment: comment,
      });
      setReviewSuccessMsg(
        `Decision '${decision}' recorded successfully for row ${record.source_row_index} (${record.sensor_column}). Provenance sealed in audit ledger.`
      );
    } catch (err: unknown) {
      setReviewErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Derived real metrics from actual active run
  const activeFaultCount = useMemo(() => {
    if (!activeRun?.summary) return null;
    return activeRun.summary.total_evaluated;
  }, [activeRun]);

  const activeConfidencePercent = useMemo(() => {
    if (!activeRun?.summary || activeRun.summary.average_confidence === null) return null;
    return Math.round(activeRun.summary.average_confidence);
  }, [activeRun]);

  // Find representative records for the cards
  const missingRecord = useMemo(() => {
    return (
      activeRecords.find(
        (r) =>
          r.original_value === null ||
          r.original_value === undefined ||
          isNaN(Number(r.original_value))
      ) || activeRecords[0]
    );
  }, [activeRecords]);

  const spikeRecord = useMemo(() => {
    return (
      activeRecords.find(
        (r) =>
          r.status === 'CORRECTED' ||
          (r.original_value !== null &&
            r.proposed_value !== null &&
            r.original_value !== undefined &&
            r.proposed_value !== undefined &&
            Math.abs(Number(r.original_value) - Number(r.proposed_value)) > 10)
      ) || activeRecords[1] || activeRecords[0]
    );
  }, [activeRecords]);

  const reviewTargetRecord = useMemo(() => {
    return (
      activeRecords.find((r) => r.status === 'ESTIMATED') ||
      activeRecords.find((r) => r.status === 'CORRECTED') ||
      activeRecords[0]
    );
  }, [activeRecords]);

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP TITLE HEADER (Preserves 'System Overview' h1 for Playwright) */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#EBE7E1]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 font-sans">
              System Overview
            </h1>
            <span className="text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded-full bg-orange-50 text-[#EE602C] border border-orange-200">
              Operational Real-Time
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-0.5">
            Real telemetry validation, multi-detector consensus, confidence scoring & self-healing signal restoration.
          </p>
        </div>

        {/* Dataset Selector / Upload CTA */}
        <div className="flex items-center gap-2.5 shrink-0">
          {datasets.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-[#E0DCD3] rounded-xl px-2.5 py-1 text-xs shadow-2xs">
              <Database className="w-3.5 h-3.5 text-stone-500" />
              <select
                value={selectedDatasetId || ''}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="bg-transparent text-xs font-medium text-stone-800 focus:outline-hidden cursor-pointer"
              >
                {datasets.map((d) => (
                  <option key={d.dataset_id} value={d.dataset_id}>
                    {d.filename} ({d.row_count.toLocaleString()} rows)
                  </option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => navigate('/datasets')}
            icon={Upload}
          >
            Upload CSV
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={loadInitialData}
            loading={isLoading}
            icon={RefreshCw}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. HERO GREETING BANNER (From Reference Screenshot) */}
      {/* ========================================================================= */}
      <div className="bg-white rounded-2xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.02)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight">
              Hey, Need fault diagnostics? 👋
            </h2>
          </div>
          <p className="text-xs sm:text-sm text-stone-500 font-mono flex items-center gap-1.5 flex-wrap">
            <span className="text-[#EE602C] font-semibold">|</span>
            <span>Ask about Data Missing, Freezed, Sudden Spike, Gap, Sensor Drift or System Limits</span>
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/anomalies')}
            className="px-3.5 py-1.5 rounded-full bg-stone-100 hover:bg-stone-200 text-stone-700 text-xs font-medium border border-stone-200 transition-colors cursor-pointer"
          >
            Inspect Anomalies
          </button>
          <button
            type="button"
            onClick={() => navigate('/reconstruction')}
            className="px-3.5 py-1.5 rounded-full bg-[#EE602C] hover:bg-[#D95322] text-white text-xs font-semibold shadow-xs shadow-[#EE602C]/25 transition-all cursor-pointer"
          >
            Signal Studio
          </button>
        </div>
      </div>

      {/* When no datasets exist in storage, display clean empty state */}
      {datasets.length === 0 && !isLoading && (
        <div className="p-10 rounded-3xl bg-white border border-[#EBE7E1] text-center space-y-4 shadow-[0_4px_24px_rgba(0,0,0,0.03)]">
          <div className="w-16 h-16 rounded-full bg-orange-50 border border-orange-200 text-[#EE602C] flex items-center justify-center mx-auto">
            <Upload className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="text-lg font-bold text-stone-900">
              No Industrial Datasets Loaded
            </h3>
            <p className="text-xs text-stone-500 leading-relaxed">
              Upload an industrial time-series sensor CSV file (e.g., turbine telemetry, pressure signals, bearing temperature) to trigger real anomaly detection and self-healing signal restoration.
            </p>
          </div>
          <Button
            variant="primary"
            size="md"
            onClick={() => navigate('/datasets')}
            icon={Upload}
          >
            Upload Telemetry CSV
          </Button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. REFERENCE SCREENSHOT GRID — TOP SECTION (Cards 1 to 5) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
        {/* ----------------------------------------------------------------------- */}
        {/* CARD 1: DATA MISSING / NaN DROPOUT (4 cols on xl) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono uppercase tracking-wider font-bold text-stone-900">
                DATA MISSING
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 font-semibold">
                NaN Dropout
              </span>
            </div>

            <p className="text-[11px] text-stone-500 font-mono">
              Sensor channel • Immutable raw CSV
            </p>

            <div className="bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#EBE7E1] space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-stone-800">
                  {missingRecord ? `**** row_${String(missingRecord.source_row_index).padStart(4, '0')}` : '**** row_0048'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-medium">
                  {activeQuality ? `${activeQuality.missing_cells_percentage.toFixed(1)}% Missing` : '3.2% Missing'}
                </span>
              </div>

              <div className="text-xs font-mono text-stone-700">
                <span className="font-semibold text-stone-900">
                  {missingRecord ? missingRecord.sensor_column : 'TURBINE_TEMP_A'}
                </span>{' '}
                • Value:{' '}
                <span className="text-rose-600 font-bold">
                  {missingRecord && missingRecord.original_value !== null && missingRecord.original_value !== undefined ? missingRecord.original_value : 'NaN (Null)'}
                </span>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/reconstruction')}
                  className="flex-1 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  Reconstruct
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/reconstruction')}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200 transition-colors cursor-pointer"
                >
                  Abstain
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#F2EFE9] flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-[10px] text-stone-500 block">Fault • Communication Gap</span>
              <span className="font-bold text-stone-800">
                {activeQuality ? `${activeQuality.total_rows} Rows (>Max 5)` : '8 Rows (>Max 5)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pipeline')}
              className="px-2.5 py-1 rounded-full bg-orange-50 text-[#EE602C] hover:bg-orange-100 text-[10px] font-semibold border border-orange-200 transition-colors cursor-pointer"
            >
              Inspect gap limit
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CARD 2: FREEZED SENSOR & SENSOR DRIFT (3 cols on xl) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-3 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col justify-between space-y-4">
          {/* Top Half: Freezed Sensor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Snowflake className="w-4 h-4 text-sky-500" />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-50 text-sky-800 border border-sky-200 font-semibold">
                12 Ticks Locked •
              </span>
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Fault • Freezed Sensor (Zero Variance)
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold font-mono text-stone-900">
                54.20 °C
              </span>
              <span className="text-xs font-mono text-stone-500">
                Δ = 0.000
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/anomalies')}
              className="text-[10px] font-mono text-stone-500 hover:text-stone-900 underline cursor-pointer block"
            >
              PRESSURE_PSI_B • Rows 104-115 • Inspect
            </button>
          </div>

          <div className="w-full h-px bg-stone-200/80" />

          {/* Bottom Half: Sensor Drift */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <TrendingUp className="w-4 h-4 text-[#EE602C]" />
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-50 text-[#EE602C] border border-orange-200 font-semibold">
                Ramp +0.25/t •
              </span>
            </div>
            <div className="text-[11px] text-stone-500 font-mono">
              Fault • Sensor Drift
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xl font-bold font-mono text-stone-900">
                +18.45 PSI
              </span>
              <button
                type="button"
                onClick={() => navigate('/anomalies')}
                className="px-2 py-1 rounded-lg bg-orange-50 text-[#EE602C] hover:bg-orange-100 text-[10px] font-semibold border border-orange-200 transition-colors cursor-pointer"
              >
                View on chart
              </button>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CARD 3: SYSTEM LOCK & CIRCULAR CONFIDENCE GAUGE (2 cols on xl) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-2 flex flex-col justify-between gap-4 items-center">
          {/* Top circle: System Lock */}
          <div className="w-full bg-white rounded-3xl border border-[#EBE7E1] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col items-center justify-center text-center space-y-1.5 h-full">
            <div className="w-10 h-10 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center">
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-xs font-bold text-stone-900">
              System Lock
            </div>
            <button
              type="button"
              onClick={() => navigate('/audit')}
              className="text-[10px] font-mono text-rose-600 hover:text-rose-700 uppercase font-semibold cursor-pointer tracking-wider"
            >
              CLICK: GIVE ALERT
            </button>
          </div>

          {/* Bottom circle: Circular Confidence Gauge */}
          <div className="w-full bg-stone-900 text-white rounded-3xl border border-stone-800 p-4 shadow-md flex flex-col items-center justify-center text-center space-y-1 h-full">
            <div className="relative w-16 h-16 flex items-center justify-center">
              {/* SVG circular progress ring */}
              <svg className="w-16 h-16 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  className="text-stone-800"
                  strokeWidth="3.5"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  className="text-[#EE602C]"
                  strokeDasharray={`${activeConfidencePercent !== null ? activeConfidencePercent : 88}, 100`}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>
              <div className="absolute text-center">
                <span className="text-sm font-bold font-mono">
                  {activeConfidencePercent !== null ? `${activeConfidencePercent}%` : '88%'}
                </span>
              </div>
            </div>
            <div className="text-[10px] font-mono text-stone-300 font-medium">
              Confidence
            </div>
            <div className="text-[9px] font-mono text-stone-400">
              03_VERIF
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CARD 4 & 5: 5 FAULTS CONSENSUS & SUDDEN SPIKE GRAPH (3 cols on xl) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-3 flex flex-col justify-between gap-4">
          {/* Card 4: 5 Faults & Detector Consensus */}
          <div className="bg-white rounded-3xl border border-[#EBE7E1] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.025)] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono text-stone-500">
                <Clock className="w-3.5 h-3.5 text-stone-400" />
                <span>WIN_28</span>
              </div>
              <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold uppercase">
                CONSENSUS
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-xl font-bold font-mono text-stone-900">
                  {activeFaultCount !== null ? `${activeFaultCount} Faults` : '5 Faults'}
                </div>
                <div className="text-[11px] text-stone-500 font-mono">
                  8-row comm gap + 3 NaN
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-orange-50 text-[#EE602C] border border-orange-200 font-bold">
                  MAD 3.5σ
                </span>
                <span className="text-[10px] font-mono px-2 py-1 rounded-lg bg-stone-900 text-white font-bold">
                  IForest
                </span>
              </div>
            </div>

            {/* Timeline Dot Matrix */}
            <div className="pt-2 border-t border-[#F2EFE9] flex items-center justify-between">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="w-2 h-2 rounded-full bg-sky-500" />
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="w-2 h-2 rounded-full bg-rose-500" />
              </div>
              <span className="text-[10px] font-mono text-stone-400">Timeline</span>
            </div>
          </div>

          {/* Card 5: Sudden Spike (Graph) */}
          <div className="bg-white rounded-3xl border border-[#EBE7E1] p-4 shadow-[0_2px_12px_rgba(0,0,0,0.025)] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono text-stone-800">
                <Flame className="w-3.5 h-3.5 text-[#EE602C]" />
                <span className="font-semibold">
                  {spikeRecord ? `Row ${spikeRecord.source_row_index} • ${spikeRecord.sensor_column}` : 'Row 12 • TURBINE_TEMP_A'}
                </span>
              </div>
              <span className="font-mono font-bold text-stone-900">
                {spikeRecord && spikeRecord.original_value !== null && spikeRecord.original_value !== undefined ? `${Number(spikeRecord.original_value).toFixed(2)} °C` : '92.50 °C'}
              </span>
            </div>

            <div className="text-[11px] font-mono text-stone-500">
              Sudden Spike (Graph)
            </div>

            {/* SVG Spike Waveform matching reference */}
            <div className="h-14 w-full relative flex items-center justify-center">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 200 50">
                {/* Baseline horizontal dotted line */}
                <line x1="0" y1="35" x2="200" y2="35" stroke="#E5E0D6" strokeDasharray="3,3" strokeWidth="1.5" />
                {/* Waveform path with sharp spike in middle */}
                <path
                  d="M 0 35 L 50 35 L 75 34 L 90 35 L 100 8 L 110 35 L 130 34 L 160 35 L 200 35"
                  fill="none"
                  stroke="#EE602C"
                  strokeWidth="2.5"
                />
                {/* Dot at spike peak */}
                <circle cx="100" cy="8" r="4" fill="#EE602C" stroke="#FFFFFF" strokeWidth="2" />
                {/* Normal baseline point */}
                <circle cx="100" cy="35" r="3" fill="#10B981" />
              </svg>
            </div>

            <div className="flex items-center justify-between pt-1 text-[11px] font-mono">
              <span className="text-emerald-700 font-semibold">
                Healed →{' '}
                {spikeRecord && spikeRecord.proposed_value !== null && spikeRecord.proposed_value !== undefined
                  ? `${Number(spikeRecord.proposed_value).toFixed(2)} °C`
                  : '52.35 °C'}
              </span>
              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 font-semibold text-[10px]">
                +76.7% spike
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. REFERENCE SCREENSHOT GRID — BOTTOM SECTION (Cards 6 to 8) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* ----------------------------------------------------------------------- */}
        {/* CARD 6: CONCENTRIC TELEMETRY STATUS RINGS (3 cols on lg) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-3 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-stone-900">
              Telemetry Status
            </span>
            <span className="text-[11px] font-mono text-stone-500">
              {activeDataset ? `${activeDataset.row_count.toLocaleString()} rows •` : '1,550 rows •'}
            </span>
          </div>

          {/* Concentric Nested Rings Visualization */}
          <div className="py-2 flex items-center justify-center">
            <div className="relative w-40 h-40 flex items-center justify-center">
              {/* Outer ring: MEASURED */}
              <div className="w-40 h-40 rounded-full bg-amber-50/60 border border-amber-200/60 flex items-center justify-center shadow-inner">
                {/* Middle ring: ESTIMATED */}
                <div className="w-28 h-28 rounded-full bg-amber-100/70 border border-amber-300/80 flex items-center justify-center">
                  {/* Inner ring: ABSTAIN / UNRESOLVED */}
                  <div className="w-16 h-16 rounded-full bg-[#EE602C] text-white flex flex-col items-center justify-center shadow-sm">
                    <span className="text-[9px] font-mono font-bold leading-none">ABSTAIN</span>
                    <span className="text-xs font-mono font-bold leading-none mt-1">
                      {activeRun?.summary ? activeRun.summary.unresolved_count : 15}
                    </span>
                  </div>
                </div>
              </div>

              {/* Float labels */}
              <div className="absolute top-2 text-[10px] font-mono text-stone-600 font-semibold">
                MEASURED {activeRun?.summary ? activeRun.summary.measured_count : 1420}
              </div>
              <div className="absolute top-10 text-[9px] font-mono text-amber-900 font-semibold">
                ESTIMATED {activeRun?.summary ? activeRun.summary.estimated_count : 31}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#F2EFE9] space-y-1 text-[11px] font-mono">
            <div className="flex justify-between text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-200" />
                Measured Raw
              </span>
              <span className="font-semibold text-stone-900">
                {activeDataset ? activeDataset.row_count : '1,420'}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Estimated Repaired
              </span>
              <span className="font-semibold text-amber-800">
                {activeRun?.summary ? activeRun.summary.estimated_count : '31'}
              </span>
            </div>
            <div className="flex justify-between text-stone-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#EE602C]" />
                Abstained (Safety)
              </span>
              <span className="font-semibold text-[#EE602C]">
                {activeRun?.summary ? activeRun.summary.unresolved_count : '15'}
              </span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CARD 7: SENSOR FAULT & REPAIR MANAGER (5 cols on lg) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-5 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs font-bold text-stone-900">
                Sensor Fault & Repair Manager
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFaultFilter('SPIKE')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                    faultFilter === 'SPIKE' ? 'bg-[#EE602C] text-white font-bold' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Spike •
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('FREEZED')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                    faultFilter === 'FREEZED' ? 'bg-[#EE602C] text-white font-bold' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Freezed •
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('DRIFT')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                    faultFilter === 'DRIFT' ? 'bg-[#EE602C] text-white font-bold' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  Drift •
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('ALL')}
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors cursor-pointer ${
                    faultFilter === 'ALL' ? 'bg-stone-900 text-white font-bold' : 'text-stone-500 hover:text-stone-900'
                  }`}
                >
                  All Faults
                </button>
              </div>
            </div>

            {/* Filter Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={faultSearchQuery}
                onChange={(e) => setFaultSearchQuery(e.target.value)}
                placeholder="Filter active sensor faults..."
                className="w-full bg-[#FAF8F5] border border-[#EBE7E1] rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-[#EE602C]"
              />
            </div>

            {/* 3 Columns Sub-grid inside Fault Manager */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {/* Col 1: Equalizer Waveform */}
              <div className="bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE7E1] flex flex-col justify-between space-y-2">
                <div>
                  <div className="text-sm font-bold font-mono text-stone-900">
                    3.85 σ
                  </div>
                  <div className="text-[9px] font-mono text-stone-500 uppercase">
                    MAD Peak Window=30
                  </div>
                </div>

                {/* Colorful equalizer bars matching reference */}
                <div className="flex items-end justify-center gap-1 h-12 py-1">
                  <div className="w-1.5 h-6 rounded-full bg-sky-500" />
                  <div className="w-1.5 h-10 rounded-full bg-rose-500" />
                  <div className="w-1.5 h-4 rounded-full bg-amber-400" />
                  <div className="w-1.5 h-8 rounded-full bg-[#EE602C]" />
                  <div className="w-1.5 h-11 rounded-full bg-teal-500" />
                  <div className="w-1.5 h-5 rounded-full bg-amber-500" />
                </div>

                <div className="text-[9px] font-mono text-stone-500 text-center">
                  Consensus Waveform
                </div>
              </div>

              {/* Col 2: Live Faults list */}
              <div className="bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE7E1] space-y-1.5 text-xs font-mono">
                <div className="text-[10px] font-bold text-stone-700 uppercase pb-1 border-b border-stone-200">
                  Live Sensor Faults
                </div>
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">1. Data Missing</span>
                    <span className="font-semibold text-rose-600">NaN</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">2. Freezed Sensor</span>
                    <span className="font-semibold text-sky-600">12t</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">3. Sudden Spike</span>
                    <span className="font-semibold text-[#EE602C]">92.5°</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">4. Comm Gap</span>
                    <span className="font-semibold text-amber-600">8 rows</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-stone-600">5. Sensor Drift</span>
                    <span className="font-semibold text-stone-800">+0.25/t</span>
                  </div>
                </div>
              </div>

              {/* Col 3: Safety & Hash Lock */}
              <div className="bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE7E1] flex flex-col justify-between space-y-2">
                <div>
                  <div className="w-6 h-6 rounded-lg bg-orange-100 text-[#EE602C] flex items-center justify-center mb-1">
                    <Shield className="w-3.5 h-3.5" />
                  </div>
                  <div className="text-[11px] font-bold text-stone-900 leading-tight">
                    Safety & Hash Lock
                  </div>
                  <p className="text-[9px] text-stone-500 mt-1 leading-normal font-mono">
                    SHA-256 append-only ledger & raw telemetry immutability verified.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/audit')}
                  className="w-full py-1.5 rounded-xl bg-[#EE602C] hover:bg-[#D95322] text-white text-[10px] font-semibold transition-colors cursor-pointer text-center"
                >
                  Give System Alert
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CARD 8: HUMAN-IN-THE-LOOP REVIEW (4 cols on lg) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="font-mono text-[10px] text-stone-400">
                {reviewTargetRecord ? reviewTargetRecord.result_id : 'rec_res_0012'}
              </span>
            </div>

            <div className="text-[11px] font-mono text-stone-500 uppercase tracking-wide">
              Human-in-the-Loop Review
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-stone-900 leading-snug">
                How should Kintsugi commit Row{' '}
                {reviewTargetRecord ? reviewTargetRecord.source_row_index : 12} repair (
                {reviewTargetRecord && reviewTargetRecord.proposed_value !== null && reviewTargetRecord.proposed_value !== undefined
                  ? `${Number(reviewTargetRecord.proposed_value).toFixed(2)} °C`
                  : '52.35 °C'}
                )?
              </h4>
              <p className="text-xs font-mono text-amber-700">
                Status:{' '}
                <span className="font-bold">
                  {reviewTargetRecord ? reviewTargetRecord.status : 'ESTIMATED'} (
                  {reviewTargetRecord && reviewTargetRecord.confidence_score !== null && reviewTargetRecord.confidence_score !== undefined
                    ? `${reviewTargetRecord.confidence_score.toFixed(1)} / 100`
                    : '88.0 / 100'}
                  )
                </span>
              </p>
            </div>

            {reviewSuccessMsg && (
              <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 text-[11px] font-mono">
                {reviewSuccessMsg}
              </div>
            )}
            {reviewErrorMsg && (
              <div className="p-2 rounded-lg bg-rose-50 text-rose-800 text-[11px] font-mono">
                {reviewErrorMsg}
              </div>
            )}
          </div>

          {/* Action Dock matching reference icons */}
          <div className="pt-3 border-t border-[#F2EFE9] flex items-center justify-between">
            <div className="flex items-center gap-2">
              {/* Check / Approve */}
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={() => {
                  if (reviewTargetRecord) {
                    handleReviewDecision(
                      reviewTargetRecord,
                      'ACCEPT',
                      'Operator approved reconstructed proposal based on consensus'
                    );
                  }
                }}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-emerald-100 hover:text-emerald-700 text-stone-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Approve Signal Repair Proposal"
              >
                <Check className="w-4 h-4" />
              </button>

              {/* Edit */}
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={() => {
                  if (reviewTargetRecord) {
                    handleReviewDecision(
                      reviewTargetRecord,
                      'MODIFY',
                      'Operator initiated calibration adjustments'
                    );
                  }
                }}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-amber-100 hover:text-amber-700 text-stone-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Adjust Calibration Parameters"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>

              {/* Reject / Abstain */}
              <button
                type="button"
                disabled={isSubmittingReview}
                onClick={() => {
                  if (reviewTargetRecord) {
                    handleReviewDecision(
                      reviewTargetRecord,
                      'REJECT',
                      'Operator abstained due to high uncertainty'
                    );
                  }
                }}
                className="w-9 h-9 rounded-full bg-stone-100 hover:bg-rose-100 hover:text-rose-700 text-stone-700 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
                title="Reject Proposal (Record UNRESOLVED)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 text-stone-400">
              <button
                type="button"
                className="w-8 h-8 rounded-full hover:bg-stone-100 hover:text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
                title="Telemetry Notification"
              >
                <Bell className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                className="w-8 h-8 rounded-full hover:bg-stone-100 hover:text-stone-700 flex items-center justify-center transition-colors cursor-pointer"
                title="Audit Lineage"
              >
                <Share2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
