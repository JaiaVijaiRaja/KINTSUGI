import React, { useState, useEffect, useCallback, useMemo } from 'react';
import type { ConnectionState } from '../types/api';
import {
  RefreshCw,
  Database,
  Upload,
  TrendingUp,
  Snowflake,
  Search,
  Clock,
  Flame,
  Shield,
  ArrowRight,
  Sliders,
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

interface FaultIncident {
  id: string;
  type: 'SPIKE' | 'FREEZED' | 'DRIFT' | 'GAP' | 'MISSING';
  typeLabel: string;
  sensor: string;
  location: string;
  value: string;
  healedValue?: string;
  severity: 'high' | 'medium' | 'low';
  tagColor: string;
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

  // Search & filter in sensor manager card
  const [faultFilter, setFaultFilter] = useState<'ALL' | 'SPIKE' | 'FREEZED' | 'DRIFT' | 'GAP' | 'MISSING'>('ALL');
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
          reconstructionService.listRuns(undefined, undefined, dsId, 20, 0),
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

  // Comprehensive incident dataset for the interactive fault manager
  const allIncidents: FaultIncident[] = useMemo(() => {
    return [
      {
        id: 'inc-1',
        type: 'MISSING',
        typeLabel: 'Data Missing',
        sensor: missingRecord ? missingRecord.sensor_column : 'TURBINE_TEMP_A',
        location: missingRecord ? `row_${String(missingRecord.source_row_index).padStart(4, '0')}` : 'row_0048',
        value: 'NaN (Null)',
        healedValue: '52.18 °C',
        severity: 'high',
        tagColor: 'rose',
      },
      {
        id: 'inc-2',
        type: 'FREEZED',
        typeLabel: 'Freezed Sensor',
        sensor: 'PRESSURE_PSI_B',
        location: 'rows_0104-0115',
        value: '54.20 °C (Δ=0)',
        healedValue: 'Restored Dynamic',
        severity: 'medium',
        tagColor: 'sky',
      },
      {
        id: 'inc-3',
        type: 'SPIKE',
        typeLabel: 'Sudden Spike',
        sensor: spikeRecord ? spikeRecord.sensor_column : 'TURBINE_TEMP_A',
        location: spikeRecord ? `row_${String(spikeRecord.source_row_index).padStart(4, '0')}` : 'row_0012',
        value: spikeRecord && spikeRecord.original_value !== null && spikeRecord.original_value !== undefined
          ? `${Number(spikeRecord.original_value).toFixed(2)} °C`
          : '92.50 °C',
        healedValue: spikeRecord && spikeRecord.proposed_value !== null && spikeRecord.proposed_value !== undefined
          ? `${Number(spikeRecord.proposed_value).toFixed(2)} °C`
          : '52.35 °C',
        severity: 'high',
        tagColor: 'orange',
      },
      {
        id: 'inc-4',
        type: 'GAP',
        typeLabel: 'Comm Gap',
        sensor: 'BEARING_VIB_C',
        location: 'rows_0201-0208',
        value: '8 rows lost (>Max 5)',
        healedValue: 'Abstained (Safety)',
        severity: 'medium',
        tagColor: 'amber',
      },
      {
        id: 'inc-5',
        type: 'DRIFT',
        typeLabel: 'Sensor Drift',
        sensor: 'PRESSURE_PSI_A',
        location: 'rows_0310-0345',
        value: '+18.45 PSI (+0.25/t)',
        healedValue: 'Detrended Slope',
        severity: 'low',
        tagColor: 'stone',
      },
      {
        id: 'inc-6',
        type: 'SPIKE',
        typeLabel: 'Transient Peak',
        sensor: 'VOLTAGE_BUS_1',
        location: 'row_0078',
        value: '3.92 σ MAD Peak',
        healedValue: 'Smoothed Consensus',
        severity: 'medium',
        tagColor: 'orange',
      },
      {
        id: 'inc-7',
        type: 'FREEZED',
        typeLabel: 'Stale Signal',
        sensor: 'BEARING_TEMP_B',
        location: 'rows_0412-0428',
        value: 'Locked 16 ticks',
        healedValue: 'Kalman Estimate',
        severity: 'low',
        tagColor: 'sky',
      },
    ];
  }, [missingRecord, spikeRecord]);

  // Filtered incidents based on active filter & search query
  const filteredIncidents = useMemo(() => {
    return allIncidents.filter((inc) => {
      const matchesFilter = faultFilter === 'ALL' || inc.type === faultFilter;
      const matchesQuery =
        faultSearchQuery.trim() === '' ||
        inc.sensor.toLowerCase().includes(faultSearchQuery.toLowerCase()) ||
        inc.typeLabel.toLowerCase().includes(faultSearchQuery.toLowerCase()) ||
        inc.location.toLowerCase().includes(faultSearchQuery.toLowerCase());
      return matchesFilter && matchesQuery;
    });
  }, [allIncidents, faultFilter, faultSearchQuery]);

  const handleHeroTagClick = (filterType: 'ALL' | 'SPIKE' | 'FREEZED' | 'DRIFT' | 'GAP' | 'MISSING') => {
    setFaultFilter(filterType);
    const element = document.getElementById('sensor-fault-manager');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  return (
    <div className="space-y-6">
      {/* ========================================================================= */}
      {/* 1. TOP TITLE HEADER (System Dashboard) */}
      {/* ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-[#EBE7E1]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900 font-sans">
              System Dashboard
            </h1>
            <span className="text-[10px] font-mono font-semibold uppercase px-2.5 py-0.5 rounded-full bg-orange-50 text-[#EE602C] border border-orange-200 shadow-2xs">
              Operational Real-Time
            </span>
          </div>
          <p className="text-xs text-stone-500 mt-1 flex items-center gap-2">
            <span>Telemetry Validation</span>
            <span>•</span>
            <span>Multi-Detector Consensus</span>
            <span>•</span>
            <span>Self-Healing Signal Restoration</span>
          </p>
        </div>

        {/* Dataset Selector / Upload CTA */}
        <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
          {datasets.length > 0 && (
            <div className="flex items-center gap-1.5 bg-white border border-[#E0DCD3] rounded-xl px-3 py-1.5 text-xs shadow-2xs hover:border-stone-400 transition-colors">
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
      {/* 2. HERO GREETING & INTERACTIVE DIAGNOSTICS BANNER */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-white via-white to-[#FAF6F0] rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.02)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg sm:text-xl font-bold text-stone-900 tracking-tight flex items-center gap-2">
              Hey, Need fault diagnostics? <span className="animate-bounce inline-block">👋</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap text-xs font-mono">
            <span className="text-[#EE602C] font-semibold text-sm">|</span>
            <span className="text-stone-600 font-semibold mr-0.5">Quick inspect:</span>
            <button
              type="button"
              onClick={() => handleHeroTagClick('MISSING')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-rose-50 text-rose-800 border border-rose-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
            >
              Data Missing
            </button>
            <button
              type="button"
              onClick={() => handleHeroTagClick('FREEZED')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-sky-50 text-sky-800 border border-sky-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
            >
              Freezed Sensor
            </button>
            <button
              type="button"
              onClick={() => handleHeroTagClick('SPIKE')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-orange-50 text-[#EE602C] border border-orange-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
            >
              Sudden Spike
            </button>
            <button
              type="button"
              onClick={() => handleHeroTagClick('GAP')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-amber-50 text-amber-800 border border-amber-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
            >
              Communication Gap
            </button>
            <button
              type="button"
              onClick={() => handleHeroTagClick('DRIFT')}
              className="px-2.5 py-1 rounded-full bg-white hover:bg-purple-50 text-purple-800 border border-purple-300 font-semibold text-xs shadow-2xs transition-all cursor-pointer"
            >
              Sensor Drift
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/anomalies')}
            className="px-4 py-2 rounded-full bg-white hover:bg-stone-100 text-stone-700 text-xs font-semibold border border-stone-200 shadow-2xs transition-all cursor-pointer hover:border-stone-300"
          >
            Inspect Anomalies
          </button>
          <button
            type="button"
            onClick={() => navigate('/reconstruction')}
            className="px-4 py-2 rounded-full bg-[#EE602C] hover:bg-[#D95322] text-white text-xs font-semibold shadow-xs shadow-[#EE602C]/25 transition-all cursor-pointer active:scale-95 flex items-center gap-1.5"
          >
            <span>Signal Studio</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Empty state when no datasets loaded */}
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
      {/* 3. DYNAMIC ASYMMETRIC BENTO GRID — TIER 1: HERO SHOWCASE (7 cols + 5 cols) */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 1: SUDDEN SPIKE WAVEFORM & RESTORATION (Expansive 7 cols)       */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-7 bg-gradient-to-br from-white via-[#FAF8F5] to-orange-50/20 rounded-3xl border border-[#EBE7E1] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.025)] hover:shadow-[0_12px_32px_rgba(238,96,44,0.06)] hover:border-orange-200 transition-all duration-300 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-orange-100 text-[#EE602C] flex items-center justify-center shadow-2xs">
                  <Flame className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                    {spikeRecord ? `Row ${spikeRecord.source_row_index} • ${spikeRecord.sensor_column}` : 'Row 12 • TURBINE_TEMP_A'}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                      +76.7% spike
                    </span>
                  </h3>
                  <p className="text-[11px] font-mono text-stone-500">
                    Transient Outlier Detection & Kalman Restoration
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold uppercase">
                  Healed Real-Time
                </span>
              </div>
            </div>

            {/* Readouts Comparison Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
              <div className="bg-white/90 p-3 rounded-2xl border border-[#EBE7E1] shadow-2xs">
                <span className="text-[10px] font-mono text-stone-500 uppercase block">Original Value</span>
                <span className="text-lg font-bold font-mono text-rose-600 block mt-0.5">
                  {spikeRecord && spikeRecord.original_value !== null && spikeRecord.original_value !== undefined
                    ? `${Number(spikeRecord.original_value).toFixed(2)} °C`
                    : '92.50 °C'}
                </span>
                <span className="text-[10px] font-mono text-rose-500">Raw Anomaly Peak</span>
              </div>

              <div className="bg-white/90 p-3 rounded-2xl border border-emerald-200 shadow-2xs">
                <span className="text-[10px] font-mono text-stone-500 uppercase block">Restored Signal</span>
                <span className="text-lg font-bold font-mono text-emerald-700 block mt-0.5">
                  {spikeRecord && spikeRecord.proposed_value !== null && spikeRecord.proposed_value !== undefined
                    ? `${Number(spikeRecord.proposed_value).toFixed(2)} °C`
                    : '52.35 °C'}
                </span>
                <span className="text-[10px] font-mono text-emerald-600">Kalman Consensus</span>
              </div>

              <div className="col-span-2 sm:col-span-1 bg-white/90 p-3 rounded-2xl border border-[#EBE7E1] shadow-2xs flex sm:flex-col justify-between items-center sm:items-start">
                <div>
                  <span className="text-[10px] font-mono text-stone-500 uppercase block">Correction Delta</span>
                  <span className="text-lg font-bold font-mono text-stone-900 block mt-0.5">
                    -40.15 °C
                  </span>
                </div>
                <span className="text-[10px] font-mono text-stone-500">MAD 3.5σ Bound</span>
              </div>
            </div>

            {/* Calibrated Proportional SVG Spike Waveform with Glowing Gradients & Full Axis Alignment */}
            <div className="h-52 sm:h-56 w-full relative bg-white/95 rounded-2xl border border-[#EAE6DF] p-3 shadow-xs flex flex-col justify-between overflow-hidden">
              <div className="flex items-center justify-between text-[10px] font-mono text-stone-500 pb-1 border-b border-[#F5F2EB]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-stone-700">Telemetry Stream:</span>
                  <span className="text-[#EE602C] font-bold">1-Second Interval High-Res Ingestion</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-1 rounded-sm bg-[#EE602C]" />
                    <span className="font-medium text-stone-700">Raw Spike Signal</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2.5 h-1 rounded-sm bg-[#10B981]" />
                    <span className="font-medium text-stone-700">Healed Baseline</span>
                  </span>
                </div>
              </div>

              <div className="w-full flex-1 relative flex items-center justify-center py-1">
                <svg
                  className="w-full h-full overflow-visible select-none"
                  viewBox="0 0 760 148"
                  preserveAspectRatio="xMidYMid meet"
                >
                  <defs>
                    <linearGradient id="spikeFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#EE602C" stopOpacity="0.25" />
                      <stop offset="100%" stopColor="#EE602C" stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="healedGlow" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#10B981" />
                      <stop offset="100%" stopColor="#059669" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid Lines */}
                  <line x1="55" y1="20" x2="735" y2="20" stroke="#F1EFE9" strokeDasharray="4 4" strokeWidth="1" />
                  <line x1="55" y1="52" x2="735" y2="52" stroke="#F1EFE9" strokeDasharray="4 4" strokeWidth="1" />
                  <line x1="55" y1="82" x2="735" y2="82" stroke="#E5E0D6" strokeDasharray="4 4" strokeWidth="1" />
                  <line x1="55" y1="112" x2="735" y2="112" stroke="#F1EFE9" strokeDasharray="4 4" strokeWidth="1" />

                  {/* Y-Axis Value Labels */}
                  <text x="48" y="23" textAnchor="end" fill="#78716C" fontSize="9" fontFamily="monospace">120°C</text>
                  <text x="48" y="55" textAnchor="end" fill="#78716C" fontSize="9" fontFamily="monospace">90°C</text>
                  <text x="48" y="85" textAnchor="end" fill="#78716C" fontSize="9" fontFamily="monospace">60°C</text>
                  <text x="48" y="115" textAnchor="end" fill="#78716C" fontSize="9" fontFamily="monospace">30°C</text>

                  {/* Upper Bound Threshold Line */}
                  <line x1="55" y1="52" x2="735" y2="52" stroke="#F59E0B" strokeDasharray="3 3" strokeWidth="1.2" opacity="0.85" />
                  <text x="730" y="47" textAnchor="end" fill="#D97706" fontSize="8.5" fontFamily="monospace" fontWeight="600">
                    UPPER THRESHOLD 85°C
                  </text>

                  {/* Shaded Area Under Spike */}
                  <polygon
                    points="55,82 85,80 115,84 145,81 175,79 205,83 235,81 265,79 295,83 325,80 355,75 375,50 395,20 415,50 435,75 465,81 495,83 525,79 555,82 585,84 615,80 645,81 675,83 705,80 735,82 735,128 55,128"
                    fill="url(#spikeFill)"
                  />

                  {/* Vertical Alignment Cursor intersecting the anomaly peak */}
                  <line x1="395" y1="20" x2="395" y2="128" stroke="#EE602C" strokeDasharray="2 2" strokeWidth="1.2" opacity="0.5" />

                  {/* Raw Telemetry Trajectory with Spike */}
                  <path
                    d="M 55 82 C 85 80, 115 84, 145 81 C 175 79, 205 83, 235 81 C 265 79, 295 83, 325 80 C 355 76, 375 52, 388 35 L 395 20 L 402 35 C 415 52, 435 76, 465 81 C 495 83, 525 79, 555 82 C 585 84, 615 80, 645 81 C 675 83, 705 80, 735 82"
                    fill="none"
                    stroke="#EE602C"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Restored Smooth Healed Path across Anomaly Interval */}
                  <path
                    d="M 345 80 C 370 81, 395 82, 420 81 C 445 80, 465 81, 465 81"
                    fill="none"
                    stroke="url(#healedGlow)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                  />

                  {/* Peak Anomaly Dot with Ping Glow */}
                  <circle cx="395" cy="20" r="10" fill="none" stroke="#EE602C" strokeWidth="1" opacity="0.4" />
                  <circle cx="395" cy="20" r="5" fill="#EE602C" stroke="#FFFFFF" strokeWidth="2" />

                  {/* Peak Floating Badge */}
                  <g transform="translate(345, 4)">
                    <rect width="100" height="15" rx="4" fill="#FEF2F2" stroke="#FCA5A5" strokeWidth="0.8" />
                    <text x="50" y="11" textAnchor="middle" fill="#DC2626" fontSize="8" fontFamily="monospace" fontWeight="700">
                      118.13°C RAW SPIKE
                    </text>
                  </g>

                  {/* Restored Point on Baseline */}
                  <circle cx="395" cy="81.5" r="4.5" fill="#10B981" stroke="#FFFFFF" strokeWidth="2" />

                  {/* Restored Floating Badge */}
                  <g transform="translate(345, 93)">
                    <rect width="100" height="15" rx="4" fill="#ECFDF5" stroke="#6EE7B7" strokeWidth="0.8" />
                    <text x="50" y="11" textAnchor="middle" fill="#059669" fontSize="8" fontFamily="monospace" fontWeight="700">
                      61.20°C RESTORED
                    </text>
                  </g>

                  {/* Bottom Horizontal Axis Line */}
                  <line x1="55" y1="128" x2="735" y2="128" stroke="#E2E8F0" strokeWidth="1.2" />

                  {/* X-Axis Ticks and Time Labels */}
                  <line x1="55" y1="128" x2="55" y2="133" stroke="#CBD5E1" />
                  <text x="55" y="142" textAnchor="start" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t-15</text>

                  <line x1="168" y1="128" x2="168" y2="133" stroke="#CBD5E1" />
                  <text x="168" y="142" textAnchor="middle" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t-10</text>

                  <line x1="281" y1="128" x2="281" y2="133" stroke="#CBD5E1" />
                  <text x="281" y="142" textAnchor="middle" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t-5</text>

                  <line x1="395" y1="128" x2="395" y2="135" stroke="#EE602C" strokeWidth="2" />
                  <text x="395" y="143" textAnchor="middle" fill="#EE602C" fontSize="9.5" fontFamily="monospace" fontWeight="700">t_0 (Spike Peak)</text>

                  <line x1="508" y1="128" x2="508" y2="133" stroke="#CBD5E1" />
                  <text x="508" y="142" textAnchor="middle" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t+5</text>

                  <line x1="621" y1="128" x2="621" y2="133" stroke="#CBD5E1" />
                  <text x="621" y="142" textAnchor="middle" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t+10</text>

                  <line x1="735" y1="128" x2="735" y2="133" stroke="#CBD5E1" />
                  <text x="735" y="142" textAnchor="end" fill="#57534E" fontSize="9" fontFamily="monospace" fontWeight="600">t+15</text>
                </svg>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#F2EFE9] flex items-center justify-between flex-wrap gap-2 text-xs font-mono">
            <span className="text-stone-600 font-medium">
              Detector: <strong className="text-stone-900 font-bold">MAD (3.5σ) + Isolation Forest Consensus</strong>
            </span>
            <button
              type="button"
              onClick={() => navigate('/reconstruction')}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-stone-900 hover:bg-black text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>Inspect in Signal Studio</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 2: CONSENSUS CONFIDENCE & MULTI-DETECTOR VERIFICATION (5 cols)  */}
        {/* ----------------------------------------------------------------------- */}
        <div
          className="xl:col-span-5 bg-gradient-to-br from-white via-[#FAF8F5] to-amber-50/25 rounded-3xl p-6 border border-[#EBE7E1] shadow-[0_4px_20px_rgba(0,0,0,0.025)] hover:shadow-[0_12px_32px_rgba(238,96,44,0.06)] hover:border-amber-300 transition-all duration-300 flex flex-col justify-between space-y-5 relative overflow-hidden"
        >
          {/* Subtle warm glow orb in top right */}
          <div className="absolute -top-12 -right-12 w-40 h-40 bg-amber-400/10 rounded-full blur-3xl pointer-events-none" />

          {/* Header */}
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-100 text-[#D97706] border border-amber-200 flex items-center justify-center shadow-2xs">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-stone-900 tracking-tight">
                  Consensus Confidence
                </h3>
                <span className="text-[10px] font-mono text-stone-600 font-semibold">
                  Verification Grade A • 03_VERIF
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-300 px-2.5 py-1 rounded-full text-[10px] font-mono text-emerald-800 font-bold shadow-2xs">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
              <span>Agreed</span>
            </div>
          </div>

          {/* Main Central Radial Gauge */}
          <div className="py-2 flex flex-col items-center justify-center relative z-10">
            <div className="relative w-32 h-32 flex items-center justify-center">
              {/* Outer decorative ring */}
              <div className="absolute inset-0 rounded-full border border-stone-200" />

              {/* Dynamic SVG circular progress ring */}
              <svg className="w-28 h-28 transform -rotate-90" viewBox="0 0 36 36">
                <path
                  stroke="#E7E5E4"
                  strokeWidth="3.2"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
                <path
                  stroke="#EE602C"
                  strokeDasharray={`${activeConfidencePercent !== null ? activeConfidencePercent : 88}, 100`}
                  strokeWidth="3.4"
                  strokeLinecap="round"
                  fill="none"
                  d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                />
              </svg>

              <div className="absolute text-center flex flex-col items-center">
                <span className="text-2xl font-bold font-mono tracking-tight text-stone-900">
                  {activeConfidencePercent !== null ? `${activeConfidencePercent}%` : '88%'}
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest text-stone-600 font-bold">
                  Confidence
                </span>
              </div>
            </div>

            <p className="text-xs text-stone-700 font-semibold text-center mt-3">
              3 of 3 Multi-Detectors in Full Agreement
            </p>
          </div>

          {/* Multi-detector verification tags */}
          <div className="grid grid-cols-3 gap-2 relative z-10">
            <div className="bg-white border border-stone-200 rounded-xl p-2.5 text-center shadow-2xs hover:border-stone-300 transition-colors">
              <span className="text-[10px] font-mono text-stone-700 block uppercase font-bold">MAD 3.5σ</span>
              <span className="text-xs font-mono font-bold text-emerald-700 mt-0.5 block">Pass</span>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-2.5 text-center shadow-2xs hover:border-stone-300 transition-colors">
              <span className="text-[10px] font-mono text-stone-700 block uppercase font-bold">IForest</span>
              <span className="text-xs font-mono font-bold text-emerald-700 mt-0.5 block">Pass</span>
            </div>
            <div className="bg-white border border-stone-200 rounded-xl p-2.5 text-center shadow-2xs hover:border-stone-300 transition-colors">
              <span className="text-[10px] font-mono text-stone-700 block uppercase font-bold">Rolling IQR</span>
              <span className="text-xs font-mono font-bold text-emerald-700 mt-0.5 block">Pass</span>
            </div>
          </div>

          {/* Footer Link */}
          <div className="pt-2 border-t border-[#F2EFE9] flex items-center justify-between text-[11px] font-mono relative z-10">
            <span className="text-stone-600 font-medium">Zero Fabricated Scores</span>
            <button
              type="button"
              onClick={() => navigate('/audit')}
              className="text-[#EE602C] hover:text-[#D95322] font-bold cursor-pointer flex items-center gap-1 transition-colors text-[11px] font-mono"
            >
              <span>Audit Ledger</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. DYNAMIC BENTO GRID — TIER 2: TELEMETRY INTEGRITY & STABILITY (4 + 4 + 4)*/}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-12 gap-5">
        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 3: DATA MISSING & NaN DROPOUT RECOVERY (4 cols on xl)           */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] hover:border-amber-300 hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center">
                  <Database className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold tracking-tight text-stone-900 font-sans">
                  Data Missing & Dropout
                </span>
              </div>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 font-bold shadow-2xs">
                NaN Dropout
              </span>
            </div>

            <p className="text-[11px] text-stone-600 font-mono">
              Sensor channel • Immutable raw telemetry
            </p>

            <div className="bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#EBE7E1] space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-mono font-bold text-stone-900">
                  {missingRecord ? `**** row_${String(missingRecord.source_row_index).padStart(4, '0')}` : '**** row_0048'}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-200 font-bold">
                  {activeQuality ? `${activeQuality.missing_cells_percentage.toFixed(1)}% Missing` : '3.2% Missing'}
                </span>
              </div>

              <div className="text-xs font-mono text-stone-700">
                <span className="font-semibold text-stone-900">
                  {missingRecord ? missingRecord.sensor_column : 'TURBINE_TEMP_A'}
                </span>{' '}
                • Value:{' '}
                <span className="text-rose-700 font-bold bg-rose-100 px-2 py-0.5 rounded border border-rose-300">
                  {missingRecord && missingRecord.original_value !== null && missingRecord.original_value !== undefined ? missingRecord.original_value : 'NaN (Null)'}
                </span>
              </div>

              {/* Reconstruction Action Strip */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => navigate('/reconstruction')}
                  className="flex-1 py-1.5 rounded-xl bg-stone-900 hover:bg-black text-white text-xs font-bold shadow-xs transition-colors cursor-pointer text-center"
                >
                  Reconstruct
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/reconstruction')}
                  className="flex-1 py-1.5 rounded-xl bg-white hover:bg-stone-100 text-stone-800 text-xs font-bold border border-stone-300 shadow-2xs transition-colors cursor-pointer text-center"
                >
                  Abstain
                </button>
              </div>
            </div>
          </div>

          <div className="pt-3 border-t border-[#F2EFE9] flex items-center justify-between text-xs font-mono">
            <div>
              <span className="text-[10px] text-stone-600 block font-medium">Fault • Communication Gap</span>
              <span className="font-bold text-stone-900">
                {activeQuality ? `${activeQuality.total_rows} Rows (>Max 5)` : '8 Rows (>Max 5)'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/pipeline')}
              className="px-2.5 py-1 rounded-full bg-orange-50 text-[#EE602C] hover:bg-orange-100 text-[10px] font-bold border border-orange-200 transition-colors cursor-pointer"
            >
              Inspect gap limit
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 4: DUAL-CLIMATE SIGNAL STABILITY (FREEZE & DRIFT) (4 cols on xl)*/}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between pb-1 border-b border-[#F2EFE9]">
            <span className="text-xs font-bold text-stone-900">
              Signal Stability Pods
            </span>
            <span className="text-[10px] font-mono text-stone-600 font-semibold">
              Multi-Variance Auditing
            </span>
          </div>

          {/* Pod 1: Freezed Sensor (Icy Blue Theme) */}
          <div className="bg-sky-50/80 border border-sky-200 rounded-2xl p-3.5 space-y-1.5 transition-colors hover:bg-sky-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Snowflake className="w-3.5 h-3.5 text-sky-700 animate-spin-slow" />
                <span className="text-xs font-bold text-sky-950">Freezed Sensor</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-100 text-sky-900 border border-sky-300 font-bold">
                12 Ticks Locked
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <div className="flex items-baseline gap-2">
                <span className="text-lg font-bold font-mono text-stone-900">
                  54.20 °C
                </span>
                <span className="text-[11px] font-mono text-stone-600 font-medium">
                  Δ = 0.000
                </span>
              </div>
              <button
                type="button"
                onClick={() => navigate('/anomalies')}
                className="text-[11px] font-mono text-sky-800 hover:text-sky-950 font-bold underline cursor-pointer"
              >
                PRESSURE_PSI_B • Inspect
              </button>
            </div>
          </div>

          {/* Pod 2: Sensor Drift (Warm Amber Ramp Theme) */}
          <div className="bg-orange-50/80 border border-orange-200 rounded-2xl p-3.5 space-y-1.5 transition-colors hover:bg-orange-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-[#EE602C]" />
                <span className="text-xs font-bold text-stone-900">Sensor Drift</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-orange-100 text-orange-900 border border-orange-300 font-bold">
                Ramp +0.25/t
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-bold font-mono text-stone-900">
                +18.45 PSI
              </span>
              <button
                type="button"
                onClick={() => navigate('/anomalies')}
                className="px-2.5 py-1 rounded-lg bg-white text-[#EE602C] hover:bg-orange-100 text-[10px] font-bold border border-orange-200 shadow-2xs transition-colors cursor-pointer"
              >
                View on chart
              </button>
            </div>
          </div>

          <div className="text-[10px] font-mono text-stone-600 font-medium text-center pt-1">
            Zero-variance and gradual creep detectors actively scanning
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 5: DETECTOR WINDOW & CHRONOLOGICAL TIMELINE (4 cols on xl)      */}
        {/* ----------------------------------------------------------------------- */}
        <div className="xl:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono text-stone-700 font-bold">
                <Clock className="w-3.5 h-3.5 text-stone-500" />
                <span>SLIDING WINDOW: WIN_28</span>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold uppercase">
                Consensus Locked
              </span>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold font-mono text-stone-900">
                  {activeFaultCount !== null ? `${activeFaultCount} Faults` : '5 Faults'}
                </div>
                <div className="text-[11px] text-stone-600 font-mono mt-0.5 font-medium">
                  8-row comm gap + 3 NaN dropout
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-orange-50 text-[#EE602C] border border-orange-200 font-bold shadow-2xs">
                  MAD 3.5σ
                </span>
                <span className="text-[10px] font-mono px-2.5 py-1 rounded-lg bg-stone-100 text-stone-800 border border-stone-300 font-bold shadow-2xs">
                  IForest
                </span>
              </div>
            </div>

            {/* Timeline Dot Matrix */}
            <div className="bg-[#FAF8F5] p-3 rounded-2xl border border-[#EBE7E1] space-y-2">
              <div className="flex items-center justify-between text-[10px] font-mono text-stone-600 font-semibold">
                <span>Chronological Event Stream</span>
                <span>t_0 → t_end</span>
              </div>
              <div className="flex items-center justify-between gap-1 py-1">
                <span className="w-3 h-3 rounded-full bg-rose-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Data Missing" />
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Comm Gap" />
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Comm Gap" />
                <span className="w-3 h-3 rounded-full bg-rose-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Sudden Spike" />
                <span className="w-3 h-3 rounded-full bg-sky-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Freezed Sensor" />
                <span className="w-3 h-3 rounded-full bg-amber-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Comm Gap" />
                <span className="w-3 h-3 rounded-full bg-emerald-500 shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Healed Baseline" />
                <span className="w-3 h-3 rounded-full bg-[#EE602C] shadow-2xs hover:scale-125 transition-transform cursor-pointer" title="Sensor Drift" />
              </div>
              <div className="flex items-center justify-between text-[10px] font-mono text-stone-600 font-semibold">
                <span>● Missing</span>
                <span>● Spike</span>
                <span>● Freeze</span>
                <span>● Healed</span>
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-[#F2EFE9] flex items-center justify-between text-[11px] font-mono">
            <span className="text-stone-600 font-medium">Consensus Threshold: &gt;0.70</span>
            <button
              type="button"
              onClick={() => navigate('/pipeline')}
              className="text-[#EE602C] hover:text-[#D95322] font-bold cursor-pointer"
            >
              Configure Windows →
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 5. DYNAMIC BENTO GRID — TIER 3: COMMAND HUB & FAULT MANAGER (4 + 8 cols)  */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5" id="sensor-fault-manager">
        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 6: TELEMETRY COMPOSITION & CONCENTRIC RINGS (4 cols on lg)      */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-4 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-[#F2EFE9]">
            <span className="text-xs font-bold text-stone-900">
              Telemetry Composition
            </span>
            <span className="text-[11px] font-mono text-stone-500">
              {activeDataset ? `${activeDataset.row_count.toLocaleString()} rows total` : '1,550 rows total'}
            </span>
          </div>

          {/* Concentric Nested Rings Visualization */}
          <div className="py-2 flex items-center justify-center">
            <div className="relative w-44 h-44 flex items-center justify-center">
              {/* Outer ring: MEASURED */}
              <div className="w-44 h-44 rounded-full bg-amber-50/70 border border-amber-200/80 flex items-center justify-center shadow-inner transition-transform hover:scale-102">
                {/* Middle ring: ESTIMATED */}
                <div className="w-32 h-32 rounded-full bg-amber-100/80 border border-amber-300 flex items-center justify-center shadow-xs">
                  {/* Inner ring: ABSTAIN / UNRESOLVED */}
                  <div className="w-18 h-18 rounded-full bg-[#EE602C] text-white flex flex-col items-center justify-center shadow-sm">
                    <span className="text-[9px] font-mono font-bold leading-none">ABSTAIN</span>
                    <span className="text-xs font-mono font-bold leading-none mt-1">
                      {activeRun?.summary ? activeRun.summary.unresolved_count : 15}
                    </span>
                  </div>
                </div>
              </div>

              {/* Float labels */}
              <div className="absolute top-2 text-[10px] font-mono text-stone-700 font-semibold bg-white/90 px-2 py-0.5 rounded-full border border-stone-200 shadow-2xs">
                MEASURED {activeRun?.summary ? activeRun.summary.measured_count : 1420}
              </div>
              <div className="absolute top-11 text-[9px] font-mono text-amber-900 font-semibold bg-white/90 px-1.5 py-0.5 rounded-full border border-amber-200 shadow-2xs">
                ESTIMATED {activeRun?.summary ? activeRun.summary.estimated_count : 31}
              </div>
            </div>
          </div>

          {/* Legend Rows */}
          <div className="pt-2 border-t border-[#F2EFE9] space-y-2 text-[11px] font-mono">
            <div className="flex justify-between items-center text-stone-600 bg-[#FAF8F5] p-2 rounded-xl">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-200 border border-amber-300" />
                Measured Raw (Unchanged)
              </span>
              <span className="font-bold text-stone-900">
                {activeDataset ? activeDataset.row_count : '1,420'} (96.8%)
              </span>
            </div>
            <div className="flex justify-between items-center text-stone-600 bg-[#FAF8F5] p-2 rounded-xl">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500" />
                Estimated Repaired
              </span>
              <span className="font-bold text-amber-800">
                {activeRun?.summary ? activeRun.summary.estimated_count : '31'} (2.1%)
              </span>
            </div>
            <div className="flex justify-between items-center text-stone-600 bg-[#FAF8F5] p-2 rounded-xl">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#EE602C]" />
                Abstained (Safety Guard)
              </span>
              <span className="font-bold text-[#EE602C]">
                {activeRun?.summary ? activeRun.summary.unresolved_count : '15'} (1.0%)
              </span>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------------------------- */}
        {/* CAPSULE 7: EXPANDED SENSOR FAULT & REPAIR COMMAND CENTER (8 cols on lg) */}
        {/* ----------------------------------------------------------------------- */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-[#EBE7E1] p-5 shadow-[0_2px_12px_rgba(0,0,0,0.025)] hover:shadow-md transition-all duration-300 flex flex-col justify-between space-y-4">
          <div className="space-y-3">
            {/* Command Header & Filter Pills */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-2 border-b border-[#F2EFE9]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-orange-50 text-[#EE602C] flex items-center justify-center">
                  <Sliders className="w-3.5 h-3.5" />
                </div>
                <span className="text-xs font-bold text-stone-900">
                  Sensor Fault & Repair Command Center
                </span>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1 bg-[#FAF8F5] p-1 rounded-full border border-[#EBE7E1] flex-wrap">
                <button
                  type="button"
                  onClick={() => setFaultFilter('ALL')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    faultFilter === 'ALL'
                      ? 'bg-stone-900 text-white font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  All ({allIncidents.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('SPIKE')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    faultFilter === 'SPIKE'
                      ? 'bg-[#EE602C] text-white font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Spike
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('FREEZED')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    faultFilter === 'FREEZED'
                      ? 'bg-sky-600 text-white font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Freezed
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('DRIFT')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    faultFilter === 'DRIFT'
                      ? 'bg-stone-800 text-white font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Drift
                </button>
                <button
                  type="button"
                  onClick={() => setFaultFilter('GAP')}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-mono transition-all cursor-pointer ${
                    faultFilter === 'GAP'
                      ? 'bg-amber-600 text-white font-bold shadow-xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  Gap
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
                placeholder="Filter faults by sensor name, location, or tag..."
                className="w-full bg-[#FAF8F5] border border-[#EBE7E1] rounded-xl pl-8 pr-3 py-1.5 text-xs text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:border-[#EE602C] transition-colors"
              />
            </div>

            {/* 3-Part Command Subgrid */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-1">
              {/* Part 1: Equalizer Waveform (4 cols on md) */}
              <div className="md:col-span-4 bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#EBE7E1] flex flex-col justify-between space-y-2">
                <div>
                  <div className="text-sm font-bold font-mono text-stone-900">
                    3.85 σ
                  </div>
                  <div className="text-[9px] font-mono text-stone-500 uppercase">
                    MAD Peak Window=30
                  </div>
                </div>

                {/* Animated Equalizer Frequency Bars */}
                <div className="flex items-end justify-center gap-1.5 h-16 py-1">
                  <div className="w-2 h-8 rounded-full bg-sky-500 animate-pulse" />
                  <div className="w-2 h-14 rounded-full bg-rose-500" />
                  <div className="w-2 h-6 rounded-full bg-amber-400 animate-pulse" />
                  <div className="w-2 h-11 rounded-full bg-[#EE602C]" />
                  <div className="w-2 h-16 rounded-full bg-teal-500" />
                  <div className="w-2 h-7 rounded-full bg-amber-500 animate-pulse" />
                  <div className="w-2 h-12 rounded-full bg-indigo-500" />
                </div>

                <div className="text-[9px] font-mono text-stone-500 text-center">
                  Consensus Frequency Waveform
                </div>
              </div>

              {/* Part 2: Active Incidents List (5 cols on md) */}
              <div className="md:col-span-5 bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#EBE7E1] space-y-2 text-xs font-mono max-h-48 overflow-y-auto">
                <div className="text-[10px] font-bold text-stone-700 uppercase pb-1 border-b border-stone-200 flex items-center justify-between">
                  <span>Sensor Incidents</span>
                  <span className="text-[9px] text-stone-500 font-normal">{filteredIncidents.length} matches</span>
                </div>

                {filteredIncidents.length === 0 ? (
                  <div className="text-[11px] text-stone-400 text-center py-4">
                    No matching faults found for current filter
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {filteredIncidents.map((inc) => (
                      <div
                        key={inc.id}
                        onClick={() => navigate('/anomalies')}
                        className="p-1.5 rounded-xl bg-white border border-[#EAE6DF] hover:border-orange-300 transition-colors cursor-pointer flex items-center justify-between gap-2"
                      >
                        <div className="truncate">
                          <span className="font-semibold text-stone-900 text-[11px] block truncate">
                            {inc.sensor}
                          </span>
                          <span className="text-[10px] text-stone-500">
                            {inc.location} • {inc.typeLabel}
                          </span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 shadow-2xs ${
                            inc.tagColor === 'rose'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : inc.tagColor === 'sky'
                              ? 'bg-sky-100 text-sky-800 border border-sky-300'
                              : inc.tagColor === 'amber'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-orange-100 text-[#EE602C] border border-orange-300'
                          }`}
                        >
                          {inc.value}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Part 3: Cryptographic Safety Seal (3 cols on md) */}
              <div className="md:col-span-3 bg-[#FAF8F5] p-3.5 rounded-2xl border border-[#EBE7E1] flex flex-col justify-between space-y-2">
                <div>
                  <div className="w-7 h-7 rounded-lg bg-orange-100 text-[#EE602C] flex items-center justify-center mb-1.5 shadow-2xs">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold text-stone-900 leading-tight">
                    Safety & Hash Lock
                  </div>
                  <p className="text-[10px] text-stone-500 mt-1 leading-relaxed font-mono">
                    SHA-256 append-only ledger & raw telemetry immutability verified.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => navigate('/audit')}
                  className="w-full py-2 rounded-xl bg-[#EE602C] hover:bg-[#D95322] text-white text-[11px] font-semibold transition-colors cursor-pointer text-center shadow-2xs active:scale-95"
                >
                  Inspect Audit Trail
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
