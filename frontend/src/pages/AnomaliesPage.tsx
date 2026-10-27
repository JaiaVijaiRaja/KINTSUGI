import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ShieldAlert,
  LineChart,
  Info,
  Play,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  Sliders,
  Activity,
  Database,
  X,
  HelpCircle,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { pipelineService } from '../services/pipelineService';
import { datasetService } from '../services/datasetService';
import { anomalyService } from '../services/anomalyService';
import type { PipelineConfig } from '../types/pipeline';
import type { DatasetMetadata } from '../types/dataset';
import type {
  AnomalyRecord,
  DetectionRun,
} from '../types/anomaly';

export const AnomaliesPage: React.FC = () => {
  // Pipelines and datasets state
  const [pipelines, setPipelines] = useState<PipelineConfig[]>([]);
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState<string>('');
  const [isLoadingCatalogs, setIsLoadingCatalogs] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  // Execution state
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<DetectionRun | null>(null);
  const [anomalies, setAnomalies] = useState<AnomalyRecord[]>([]);
  const [totalAnomalies, setTotalAnomalies] = useState<number>(0);

  // Raw telemetry points for visualization canvas
  const [previewRows, setPreviewRows] = useState<Record<string, unknown>[]>([]);
  const [activeSensorView, setActiveSensorView] = useState<string>('');

  // Filtering state
  const [sensorFilter, setSensorFilter] = useState<string>('ALL');
  const [detectorFilter, setDetectorFilter] = useState<string>('ALL');
  const [severityFilter, setSeverityFilter] = useState<string>('ALL');

  // Inspection modal state
  const [inspectedAnomaly, setInspectedAnomaly] = useState<AnomalyRecord | null>(null);

  // Hover state for SVG time-series points
  const [hoveredPoint, setHoveredPoint] = useState<{
    x: number;
    y: number;
    index: number;
    value: number;
    timestamp?: string;
    anomaly?: AnomalyRecord;
  } | null>(null);

  // 1. Load pipelines and datasets on mount
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

  // Dataset lookup map for quick metadata access
  const datasetMap = useMemo(() => {
    const map = new Map<string, DatasetMetadata>();
    datasets.forEach((ds) => map.set(ds.dataset_id, ds));
    return map;
  }, [datasets]);

  // Unconfigured datasets that can be auto-provisioned
  const unconfiguredDatasets = useMemo(() => {
    const configuredIds = new Set(pipelines.map((p) => p.dataset_id));
    return datasets.filter((ds) => !configuredIds.has(ds.dataset_id));
  }, [datasets, pipelines]);

  // Sorted pipelines showing recent/active datasets first
  const sortedPipelines = useMemo(() => {
    const activeDsId = localStorage.getItem('kintsugi_active_dataset_id');
    return [...pipelines].sort((a, b) => {
      if (a.dataset_id === activeDsId) return -1;
      if (b.dataset_id === activeDsId) return 1;
      const nameA = datasetMap.get(a.dataset_id)?.filename || a.configuration_name;
      const nameB = datasetMap.get(b.dataset_id)?.filename || b.configuration_name;
      return nameA.localeCompare(nameB);
    });
  }, [pipelines, datasetMap]);

  // Handle pipeline selection including on-the-fly auto-configuration
  const handleSelectPipelineOrDataset = async (value: string) => {
    if (value.startsWith('auto_create:')) {
      const dsId = value.replace('auto_create:', '');
      setIsExecuting(true);
      try {
        const dsMeta = datasetMap.get(dsId);
        const q = await datasetService.getDatasetQuality(dsId);
        const tsCol = q.timestamp_candidates.length > 0 ? q.timestamp_candidates[0].column_name : 'timestamp';
        const sensorCols = q.columns.filter((c) => c.is_numeric && c.name !== tsCol).map((c) => c.name);
        const ignoredCols = q.columns.filter((c) => !c.is_numeric && c.name !== tsCol).map((c) => c.name);

        const newConfig = await pipelineService.createConfig({
          configuration_name: `Pipeline — ${dsMeta?.filename || dsId}`,
          description: `Auto-configured telemetry anomaly detection pipeline for ${dsMeta?.filename || dsId}`,
          dataset_id: dsId,
          timestamp_column: tsCol,
          sensor_columns: sensorCols,
          ignored_columns: ignoredCols,
          detection_settings: {
            statistical: { enabled: true, window_size: 15, mad_threshold: 3.0, min_observations: 10 },
            isolation_forest: { enabled: true, contamination: 0.05, min_observations: 10, random_seed: 42 },
          },
          reconstruction_settings: {
            allow_linear_interpolation: true,
            max_gap_size: 5,
            require_cross_sensor_validation: true,
            preserve_original_readings: true,
            allow_automatic_correction: true,
            fallback_behavior: 'abstain_unresolved',
          },
          confidence_policy: {
            review_threshold: 0.70,
            human_review_required: false,
            min_evidence_sensors: 1,
            unjustified_behavior: 'abstain_unresolved',
          },
        });

        setPipelines((prev) => [newConfig, ...prev]);
        setSelectedPipelineId(newConfig.configuration_id);
        localStorage.setItem('kintsugi_active_dataset_id', dsId);
      } catch (err) {
        console.error('Failed to auto-create pipeline:', err);
      } finally {
        setIsExecuting(false);
      }
    } else {
      setSelectedPipelineId(value);
      const pipe = pipelines.find((p) => p.configuration_id === value);
      if (pipe) {
        localStorage.setItem('kintsugi_active_dataset_id', pipe.dataset_id);
      }
    }
  };

  // Current selected pipeline object
  const selectedPipeline = useMemo(() => {
    return pipelines.find((p) => p.configuration_id === selectedPipelineId) || null;
  }, [pipelines, selectedPipelineId]);

  // Target dataset metadata
  const targetDataset = useMemo(() => {
    if (!selectedPipeline) return null;
    return datasets.find((d) => d.dataset_id === selectedPipeline.dataset_id) || null;
  }, [selectedPipeline, datasets]);

  // Update active sensor view when selected pipeline changes
  useEffect(() => {
    if (selectedPipeline && selectedPipeline.sensor_columns.length > 0) {
      if (!selectedPipeline.sensor_columns.includes(activeSensorView)) {
        setActiveSensorView(selectedPipeline.sensor_columns[0]);
      }
    } else {
      setActiveSensorView('');
    }
  }, [selectedPipeline, activeSensorView]);

  // 2. Load dataset raw preview points for time-series visualization
  const loadDatasetPreview = useCallback(async (datasetId: string) => {
    try {
      const preview = await datasetService.getDatasetPreview(datasetId, 500);
      setPreviewRows(preview.rows);
    } catch (err) {
      console.warn('Failed to load dataset preview for chart canvas:', err);
      setPreviewRows([]);
    }
  }, []);

  useEffect(() => {
    if (selectedPipeline?.dataset_id) {
      loadDatasetPreview(selectedPipeline.dataset_id);
    } else {
      setPreviewRows([]);
    }
  }, [selectedPipeline?.dataset_id, loadDatasetPreview]);

  // 3. Trigger Real Anomaly Detection Run
  const handleRunDetection = async () => {
    if (!selectedPipelineId) return;
    setIsExecuting(true);
    setExecutionError(null);
    try {
      const runRes = await anomalyService.runDetection(selectedPipelineId);
      setActiveRun(runRes.run);

      // Fetch all persisted anomaly records for this run
      const resultsRes = await anomalyService.getRunResults(
        selectedPipelineId,
        runRes.run.run_id,
        500,
        0
      );
      setAnomalies(resultsRes.anomalies);
      setTotalAnomalies(resultsRes.total_anomalies);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setExecutionError(`Detection execution failed: ${msg}`);
    } finally {
      setIsExecuting(false);
    }
  };

  // 4. Apply client-side filters on detected anomaly records
  const filteredAnomalies = useMemo(() => {
    return anomalies.filter((a) => {
      if (sensorFilter !== 'ALL' && a.sensor_column !== sensorFilter) {
        return false;
      }
      if (detectorFilter !== 'ALL') {
        if (detectorFilter === 'multi_detector' && a.consensus !== 'MULTI_DETECTOR') {
          return false;
        }
        if (
          detectorFilter !== 'multi_detector' &&
          !a.detectors_flagged.includes(detectorFilter) &&
          a.detector_name !== detectorFilter
        ) {
          return false;
        }
      }
      if (severityFilter !== 'ALL' && a.severity !== severityFilter) {
        return false;
      }
      return true;
    });
  }, [anomalies, sensorFilter, detectorFilter, severityFilter]);

  // 5. Build SVG Time-Series Chart Data for activeSensorView
  const chartPoints = useMemo(() => {
    if (!activeSensorView || previewRows.length === 0) return [];

    const pts: { index: number; value: number; timestamp?: string }[] = [];
    previewRows.forEach((row, idx) => {
      const raw = row[activeSensorView];
      const val = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!isNaN(val)) {
        const tsVal = selectedPipeline?.timestamp_column
          ? String(row[selectedPipeline.timestamp_column] || '')
          : undefined;
        pts.push({ index: idx, value: val, timestamp: tsVal });
      }
    });
    return pts;
  }, [activeSensorView, previewRows, selectedPipeline?.timestamp_column]);

  // Map anomalies for the active sensor by source_row_index
  const anomaliesByRow = useMemo(() => {
    const map = new Map<number, AnomalyRecord>();
    anomalies.forEach((a) => {
      if (a.sensor_column === activeSensorView) {
        map.set(a.source_row_index, a);
      }
    });
    return map;
  }, [anomalies, activeSensorView]);

  // SVG Scalers
  const { minVal, maxVal, svgPath, renderedPoints } = useMemo(() => {
    if (chartPoints.length === 0) {
      return { minVal: 0, maxVal: 100, svgPath: '', renderedPoints: [] };
    }

    const values = chartPoints.map((p) => p.value);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const pad = (max - min) * 0.1;
    min -= pad;
    max += pad;

    const width = 1000;
    const height = 240;
    const margin = { top: 20, right: 30, bottom: 30, left: 60 };
    const innerW = width - margin.left - margin.right;
    const innerH = height - margin.top - margin.bottom;

    const n = chartPoints.length;
    const stepX = n > 1 ? innerW / (n - 1) : innerW;

    const points = chartPoints.map((pt, i) => {
      const x = margin.left + i * stepX;
      const normalizedY = (pt.value - min) / (max - min);
      const y = margin.top + innerH * (1 - normalizedY);
      const anomaly = anomaliesByRow.get(pt.index);
      return {
        ...pt,
        x,
        y,
        anomaly,
      };
    });

    const path = points.reduce((acc, pt, idx) => {
      return idx === 0 ? `M ${pt.x} ${pt.y}` : `${acc} L ${pt.x} ${pt.y}`;
    }, '');

    return { minVal: min, maxVal: max, svgPath: path, renderedPoints: points };
  }, [chartPoints, anomaliesByRow]);

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Anomaly Explorer"
        description="Inspect quality anomalies, localized MAD deviations, and multidimensional tree splits across validated industrial sensor streams."
        badge="Phase 5 Production"
        badgeVariant="emerald"
      />

      {/* Real Execution Boundary Banner */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 shadow-sm">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Real Telemetry Detection Engine Active
          </span>
          <p className="text-slate-400 leading-relaxed">
            All algorithms operate directly on actual uploaded datasets and validated pipeline configurations.
            Suspicious observations are detected and recorded with algorithm-specific dispersion scores.
            Raw sensor readings remain strictly immutable and are never overwritten or altered.
          </p>
        </div>
      </div>

      {/* Pipeline Selection & Execution Control Bar */}
      <Card>
        <CardHeader
          title="Pipeline Configuration & Execution Control"
          subtitle="Select a saved pipeline configuration to run statistical and Isolation Forest detectors"
          icon={Sliders}
          badge={
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              Live Engine
            </span>
          }
        />
        <CardContent>
          <div className="space-y-6">
            {catalogError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{catalogError}</span>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              {/* Pipeline Selector */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="text-[11px] font-mono uppercase text-stone-500 font-semibold block">
                  Select Pipeline Configuration
                </label>
                {isLoadingCatalogs ? (
                  <div className="h-10 bg-stone-100 border border-stone-200 rounded-xl animate-pulse" />
                ) : pipelines.length === 0 && unconfiguredDatasets.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 font-medium">
                    No pipeline configurations found. Create and save a pipeline in the Pipeline Configuration page first.
                  </div>
                ) : (
                  <select
                    value={selectedPipelineId}
                    onChange={(e) => handleSelectPipelineOrDataset(e.target.value)}
                    className="w-full bg-white border border-stone-300 rounded-xl px-3.5 py-2.5 text-xs text-stone-900 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-2 focus:ring-[#EE602C]/20 transition-all cursor-pointer"
                  >
                    <optgroup label="Ready for Anomaly Detection (Datasets & Pipelines)">
                      {sortedPipelines.map((p) => {
                        const ds = datasetMap.get(p.dataset_id);
                        return (
                          <option key={p.configuration_id} value={p.configuration_id} className="bg-white text-stone-900 font-medium">
                            {ds ? `📁 ${ds.filename} — ${p.configuration_name}` : `${p.configuration_name} (${p.dataset_id})`}
                          </option>
                        );
                      })}
                    </optgroup>
                    {unconfiguredDatasets.length > 0 && (
                      <optgroup label="Custom Uploaded Datasets (Auto-Configure on Select)">
                        {unconfiguredDatasets.map((ds) => (
                          <option
                            key={`auto_create:${ds.dataset_id}`}
                            value={`auto_create:${ds.dataset_id}`}
                            className="bg-amber-50 text-amber-900 font-medium"
                          >
                            ⚡ {ds.filename} ({ds.dataset_id}) — Auto-Setup Pipeline
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                )}
              </div>

              {/* Run Button */}
              <div>
                <Button
                  variant="primary"
                  onClick={handleRunDetection}
                  disabled={!selectedPipelineId || isExecuting || pipelines.length === 0}
                  loading={isExecuting}
                  icon={Play}
                  className="w-full justify-center py-2.5"
                >
                  {isExecuting ? 'Executing Detectors...' : 'Run Real Detection'}
                </Button>
              </div>
            </div>

            {/* Selected Pipeline Details Badges */}
            {selectedPipeline && (
              <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200/80 flex flex-wrap items-center gap-3 text-xs">
                <div className="flex items-center gap-1.5 text-stone-600">
                  <Database className="w-3.5 h-3.5 text-[#EE602C]" />
                  <span className="font-mono text-stone-800 font-medium">
                    {targetDataset ? targetDataset.filename : selectedPipeline.dataset_id}
                  </span>
                </div>
                <div className="h-4 w-px bg-stone-300" />
                <div className="flex items-center gap-1.5 text-stone-600">
                  <Activity className="w-3.5 h-3.5 text-[#EE602C]" />
                  <span className="font-medium text-stone-700">Sensors ({selectedPipeline.sensor_columns.length}):</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {selectedPipeline.sensor_columns.map((s) => (
                      <span
                        key={s}
                        className="px-2 py-0.5 rounded-md bg-white border border-stone-200 font-mono text-[10px] text-stone-800 font-semibold shadow-2xs"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="h-4 w-px bg-stone-300" />
                <div className="flex items-center gap-1.5 text-stone-600">
                  <Sliders className="w-3.5 h-3.5 text-[#EE602C]" />
                  <span className="font-medium text-stone-700">Detectors:</span>
                  {selectedPipeline.detection_settings.statistical.enabled && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-mono font-medium">
                      Rolling MAD (w={selectedPipeline.detection_settings.statistical.window_size})
                    </span>
                  )}
                  {selectedPipeline.detection_settings.isolation_forest.enabled && (
                    <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200 text-[10px] font-mono font-medium">
                      Isolation Forest (c={selectedPipeline.detection_settings.isolation_forest.contamination})
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Execution Error Banner */}
            {executionError && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
                <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span>{executionError}</span>
              </div>
            )}

            {/* Execution Warning Banner */}
            {activeRun && activeRun.warnings.length > 0 && (
              <div className="p-3.5 rounded-lg bg-amber-950/30 border border-amber-800/60 text-xs text-amber-200 space-y-1">
                <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Detector Advisory Warnings ({activeRun.warnings.length}):</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-slate-300 font-mono text-[11px]">
                  {activeRun.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Detection Run KPI Summary Cards */}
      {activeRun && activeRun.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Rows Analyzed</span>
            <div className="text-xl font-bold font-mono text-slate-100">
              {activeRun.summary.total_rows_analyzed.toLocaleString()}
            </div>
            <span className="text-[10px] text-slate-500">Source telemetry</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Total Anomalies</span>
            <div className="text-xl font-bold font-mono text-amber-400">
              {activeRun.summary.total_anomalies_detected}
            </div>
            <span className="text-[10px] text-slate-500">Flagged points</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Statistical MAD</span>
            <div className="text-xl font-bold font-mono text-emerald-400">
              {activeRun.summary.anomalies_by_detector['statistical_mad'] || 0}
            </div>
            <span className="text-[10px] text-slate-500">Dispersion outliers</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Isolation Forest</span>
            <div className="text-xl font-bold font-mono text-cyan-400">
              {activeRun.summary.anomalies_by_detector['isolation_forest'] || 0}
            </div>
            <span className="text-[10px] text-slate-500">Tree partitions</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Consensus Flags</span>
            <div className="text-xl font-bold font-mono text-red-400">
              {activeRun.summary.multi_detector_consensus_count}
            </div>
            <span className="text-[10px] text-slate-500">Dual agreement</span>
          </div>

          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Unusable / NaN</span>
            <div className="text-xl font-bold font-mono text-slate-300">
              {activeRun.summary.unusable_rows_count}
            </div>
            <span className="text-[10px] text-slate-500">Excluded by policy</span>
          </div>
        </div>
      )}

      {/* Time-Series Visualization Canvas */}
      <Card>
        <CardHeader
          title="Multi-Channel Time-Series Visualization Canvas"
          subtitle="Continuous raw sensor telemetry overlaid with exact algorithmic anomaly locations"
          icon={LineChart}
          badge={
            activeRun ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                Run: {activeRun.run_id.slice(0, 12)}
              </span>
            ) : (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Standby
              </span>
            )
          }
        />
        <CardContent>
          <div className="space-y-4">
            {/* Sensor Channel Switcher Tabs */}
            {selectedPipeline && selectedPipeline.sensor_columns.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-slate-800/80">
                <span className="text-[11px] font-mono text-slate-400 uppercase mr-1">Display Channel:</span>
                {selectedPipeline.sensor_columns.map((col) => {
                  const channelAnomalyCount = anomalies.filter((a) => a.sensor_column === col).length;
                  const isActive = activeSensorView === col;
                  return (
                    <button
                      key={col}
                      onClick={() => setActiveSensorView(col)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center gap-2 cursor-pointer ${
                        isActive
                          ? 'bg-[#EE602C] text-white shadow-xs font-semibold'
                          : 'bg-white text-stone-800 hover:text-stone-950 hover:bg-stone-50 border border-stone-300 shadow-2xs'
                      }`}
                    >
                      <span>{col}</span>
                      {channelAnomalyCount > 0 && (
                        <span
                          className={`px-1.5 py-0.2 rounded-full text-[10px] font-semibold ${
                            isActive
                              ? 'bg-white/25 text-white'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {channelAnomalyCount}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* SVG Visualizer or Empty State */}
            {!activeRun ? (
              <div className="min-h-[260px] flex items-center justify-center p-2">
                <EmptyState
                  icon={LineChart}
                  title="Detection Engine Standby"
                  description="Select a validated pipeline configuration above and click 'Run Real Detection' to execute statistical MAD and Isolation Forest algorithms on raw ingested sensor data."
                />
              </div>
            ) : chartPoints.length === 0 ? (
              <div className="min-h-[260px] flex items-center justify-center border border-dashed border-stone-300 rounded-2xl bg-stone-50/50 p-6 text-stone-500 text-xs font-mono">
                No numeric data points available for sensor channel '{activeSensorView}'.
              </div>
            ) : (
              <div className="relative border border-stone-200 rounded-2xl bg-white p-4 overflow-hidden">
                {/* SVG Time Series Rendering */}
                <div className="w-full overflow-x-auto">
                  <svg
                    viewBox="0 0 1000 240"
                    className="w-full h-[260px] min-w-[700px] overflow-visible select-none"
                  >
                    {/* Background Grid Lines */}
                    <line x1="60" y1="20" x2="970" y2="20" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="60" y1="75" x2="970" y2="75" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="60" y1="130" x2="970" y2="130" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="60" y1="185" x2="970" y2="185" stroke="#1e293b" strokeDasharray="4 4" />
                    <line x1="60" y1="210" x2="970" y2="210" stroke="#334155" />

                    {/* Y-Axis Value Labels */}
                    <text x="50" y="25" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">
                      {maxVal.toFixed(1)}
                    </text>
                    <text x="50" y="117" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">
                      {((maxVal + minVal) / 2).toFixed(1)}
                    </text>
                    <text x="50" y="210" textAnchor="end" fill="#64748b" fontSize="10" fontFamily="monospace">
                      {minVal.toFixed(1)}
                    </text>

                    {/* Sensor Channel Telemetry Line */}
                    <path
                      d={svgPath}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="opacity-80"
                    />

                    {/* Telemetry Points and Anomaly Markers */}
                    {renderedPoints.map((pt, i) => {
                      const isAnomaly = !!pt.anomaly;
                      const isConsensus = pt.anomaly?.consensus === 'MULTI_DETECTOR';
                      const isHovered = hoveredPoint?.index === pt.index;

                      if (isAnomaly) {
                        return (
                          <g
                            key={i}
                            className="cursor-pointer transition-transform hover:scale-125"
                            onClick={() => pt.anomaly && setInspectedAnomaly(pt.anomaly)}
                            onMouseEnter={() =>
                              setHoveredPoint({
                                x: pt.x,
                                y: pt.y,
                                index: pt.index,
                                value: pt.value,
                                timestamp: pt.timestamp,
                                anomaly: pt.anomaly,
                              })
                            }
                            onMouseLeave={() => setHoveredPoint(null)}
                          >
                            {/* Outer Pulsing Aura */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isConsensus ? '9' : '7'}
                              fill={isConsensus ? '#ef4444' : '#f59e0b'}
                              opacity={isHovered ? '0.4' : '0.2'}
                              className={isConsensus ? 'animate-pulse' : ''}
                            />
                            {/* Core Anomaly Dot */}
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isConsensus ? '5' : '4'}
                              fill={isConsensus ? '#ef4444' : '#f59e0b'}
                              stroke="#0f172a"
                              strokeWidth="1.5"
                            />
                          </g>
                        );
                      }

                      // Render subtle nominal hover target for sparse points
                      return (
                        <circle
                          key={i}
                          cx={pt.x}
                          cy={pt.y}
                          r="3"
                          fill="#06b6d4"
                          opacity={isHovered ? '1' : '0'}
                          className="cursor-pointer hover:opacity-100 transition-opacity"
                          onMouseEnter={() =>
                            setHoveredPoint({
                              x: pt.x,
                              y: pt.y,
                              index: pt.index,
                              value: pt.value,
                              timestamp: pt.timestamp,
                              anomaly: undefined,
                            })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      );
                    })}
                  </svg>
                </div>

                {/* Interactive Tooltip Overlay */}
                {hoveredPoint && (
                  <div
                    className="absolute z-20 pointer-events-none bg-slate-900 border border-slate-700 rounded-lg p-2.5 shadow-xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3"
                    style={{
                      left: `${Math.min(Math.max(hoveredPoint.x, 80), 920)}px`,
                      top: `${Math.max(hoveredPoint.y, 40)}px`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-4 font-mono text-[11px] text-slate-400">
                      <span>Row #{hoveredPoint.index}</span>
                      {hoveredPoint.timestamp && <span>{hoveredPoint.timestamp}</span>}
                    </div>
                    <div className="font-mono text-sm font-bold text-slate-100">
                      {activeSensorView}: {hoveredPoint.value.toFixed(4)}
                    </div>
                    {hoveredPoint.anomaly ? (
                      <div className="pt-1 border-t border-slate-800 space-y-0.5">
                        <div className="flex items-center gap-1.5 font-semibold text-amber-400">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Flagged Anomaly ({hoveredPoint.anomaly.severity})</span>
                        </div>
                        <div className="text-[10px] text-slate-300 font-mono">
                          Detector: {hoveredPoint.anomaly.detector_name}
                        </div>
                        {hoveredPoint.anomaly.detector_score !== null && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            Score: {hoveredPoint.anomaly.detector_score.toFixed(2)} (Distance Metric)
                          </div>
                        )}
                        <p className="text-[10px] text-slate-300 italic max-w-xs line-clamp-2">
                          {hoveredPoint.anomaly.detection_reason}
                        </p>
                      </div>
                    ) : (
                      <div className="text-[10px] text-emerald-400 font-mono">Nominal Observation</div>
                    )}
                  </div>
                )}

                {/* Legend Bar */}
                <div className="mt-3 pt-3 border-t border-slate-900 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="w-3 h-0.5 bg-cyan-400 inline-block" />
                      <span>Raw Sensor Signal</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />
                      <span>Single Detector Flag</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
                      <span>Multi-Detector Consensus</span>
                    </div>
                  </div>
                  <div className="text-[11px] font-mono text-slate-500">
                    Click any anomaly marker to inspect detailed algorithmic metrics.
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Filter and Anomaly Records Table */}
      <Card>
        <CardHeader
          title="Detected Anomaly Records"
          subtitle="Audited observations flagged by statistical MAD or Isolation Forest algorithms"
          icon={ShieldAlert}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {filteredAnomalies.length} / {totalAnomalies} Records
            </span>
          }
        />
        <CardContent>
          <div className="space-y-4">
            {/* Filter Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-xl bg-stone-50 border border-stone-200">
              {/* Sensor Channel Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">Sensor Channel</label>
                <select
                  value={sensorFilter}
                  onChange={(e) => setSensorFilter(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20"
                >
                  <option value="ALL">All Sensors</option>
                  {selectedPipeline?.sensor_columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>

              {/* Detector Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">Detector Algorithm</label>
                <select
                  value={detectorFilter}
                  onChange={(e) => setDetectorFilter(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20"
                >
                  <option value="ALL">All Detectors</option>
                  <option value="statistical_mad">Statistical MAD Only</option>
                  <option value="isolation_forest">Isolation Forest Only</option>
                  <option value="multi_detector">Multi-Detector Consensus Only</option>
                </select>
              </div>

              {/* Severity Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-stone-500 font-semibold block">Severity Level</label>
                <select
                  value={severityFilter}
                  onChange={(e) => setSeverityFilter(e.target.value)}
                  className="w-full bg-white border border-stone-300 rounded-lg px-2.5 py-1.5 text-xs text-stone-800 font-medium shadow-2xs focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/20"
                >
                  <option value="ALL">All Severities</option>
                  <option value="CRITICAL">Critical</option>
                  <option value="HIGH">High</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="LOW">Low</option>
                </select>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-3">Row #</th>
                    <th className="py-3 px-3">Timestamp (UTC)</th>
                    <th className="py-3 px-3">Sensor Channel</th>
                    <th className="py-3 px-3">Original Value</th>
                    <th className="py-3 px-3">Detector(s) Flagged</th>
                    <th className="py-3 px-3">Score</th>
                    <th className="py-3 px-3">Severity</th>
                    <th className="py-3 px-3">Reason Summary</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                  {!activeRun ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-500 font-mono text-xs">
                        No detection run active. Run detection above to inspect suspicious telemetry points.
                      </td>
                    </tr>
                  ) : filteredAnomalies.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400 font-mono text-xs">
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 mx-auto mb-1.5" />
                        Run completed successfully — No anomalies detected under current filter thresholds.
                      </td>
                    </tr>
                  ) : (
                    filteredAnomalies.map((anom) => {
                      const isMulti = anom.consensus === 'MULTI_DETECTOR';
                      const sevBadgeClass =
                        anom.severity === 'CRITICAL'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : anom.severity === 'HIGH'
                          ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                          : anom.severity === 'MEDIUM'
                          ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                          : 'bg-slate-800 text-slate-400 border-slate-700';

                      return (
                        <tr
                          key={anom.anomaly_id}
                          className="hover:bg-slate-800/40 transition-colors cursor-pointer"
                          onClick={() => setInspectedAnomaly(anom)}
                        >
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-300">
                            #{anom.source_row_index}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400">
                            {anom.timestamp || '—'}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-cyan-400">
                            {anom.sensor_column}
                          </td>
                          <td className="py-2.5 px-3 font-mono font-bold text-slate-100">
                            {anom.original_value !== null ? anom.original_value.toFixed(4) : 'NaN'}
                          </td>
                          <td className="py-2.5 px-3">
                            {isMulti ? (
                              <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30 font-mono text-[10px] font-semibold">
                                Consensus (Both)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 font-mono text-[10px]">
                                {anom.detector_name}
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300" title="Algorithm-specific dispersion score; not a probability">
                            {anom.detector_score !== null ? anom.detector_score.toFixed(2) : '—'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-mono font-semibold ${sevBadgeClass}`}
                            >
                              {anom.severity}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-400 max-w-xs truncate" title={anom.detection_reason}>
                            {anom.detection_reason}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setInspectedAnomaly(anom);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-stone-100 text-stone-900 text-[11px] font-mono font-medium transition-colors inline-flex items-center gap-1 border border-stone-300 shadow-2xs cursor-pointer"
                            >
                              <Eye className="w-3 h-3 text-[#EE602C]" />
                              Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Observation Details Modal */}
      {inspectedAnomaly && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                  <h3 className="text-base font-bold text-slate-100 font-mono">
                    Anomaly Observation Details
                  </h3>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[10px]">
                    {inspectedAnomaly.anomaly_id}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Full algorithmic breakdown for sensor channel '{inspectedAnomaly.sensor_column}' at row #{inspectedAnomaly.source_row_index}
                </p>
              </div>
              <button
                onClick={() => setInspectedAnomaly(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Core Observation Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Sensor Channel</span>
                <span className="font-mono text-sm font-semibold text-cyan-400">{inspectedAnomaly.sensor_column}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Source Row Index</span>
                <span className="font-mono text-sm font-semibold text-slate-200">#{inspectedAnomaly.source_row_index}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Original Value</span>
                <span className="font-mono text-sm font-bold text-slate-100">
                  {inspectedAnomaly.original_value !== null ? inspectedAnomaly.original_value.toFixed(4) : 'NaN'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-slate-800/80">
                <span className="text-[10px] font-mono uppercase text-slate-500 block">Severity & Consensus</span>
                <span className="font-mono text-xs font-bold text-amber-400">
                  {inspectedAnomaly.severity} ({inspectedAnomaly.consensus})
                </span>
              </div>
            </div>

            {/* Detector Explanations Breakdown */}
            <div className="space-y-3">
              <span className="text-xs font-mono font-semibold uppercase text-slate-400 block">
                Detector Algorithmic Diagnostics
              </span>

              {Object.entries(inspectedAnomaly.detector_details).map(([detectorKey, detail]) => (
                <div
                  key={detectorKey}
                  className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-200 capitalize">
                      {detail.detector_name.replace('_', ' ')}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold ${
                        detail.flagged
                          ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {detail.flagged ? 'FLAGGED ANOMALY' : 'NOMINAL'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-xs font-mono text-slate-400">
                    <div>
                      Score: <span className="text-slate-200">{detail.score !== null ? detail.score.toFixed(3) : '—'}</span>
                    </div>
                    {detail.baseline !== null && detail.baseline !== undefined && (
                      <div>
                        Median Baseline: <span className="text-slate-200">{detail.baseline.toFixed(3)}</span>
                      </div>
                    )}
                    {detail.dispersion !== null && detail.dispersion !== undefined && (
                      <div>
                        MAD Dispersion: <span className="text-slate-200">{detail.dispersion.toFixed(3)}</span>
                      </div>
                    )}
                  </div>

                  <p className="text-xs text-slate-300 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/60 font-mono text-[11px] leading-relaxed">
                    {detail.reason}
                  </p>
                </div>
              ))}
            </div>

            {/* Explicit Score Interpretation Disclaimer */}
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-400">
              <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-300">Score Interpretation Notice:</span>
                <p className="mt-0.5">
                  Detector scores denote mathematical dispersion distance or recursive tree partition depths.
                  They are uncalibrated algorithmic metrics and do NOT represent physical fault probabilities or confirmed hardware degradation.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                onClick={() => setInspectedAnomaly(null)}
                className="text-xs font-mono"
              >
                Close Inspector
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
