import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sliders,
  Play,
  Layers,
  Activity,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Save,
  RefreshCw,
  FolderOpen,
  Plus,
  ArrowRight,
  Lock,
  Database,
  Sparkles,
  X,
  FileSpreadsheet,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import { useRouter } from '../router';
import type { DatasetMetadata, DataQualitySummary } from '../types/dataset';
import type {
  PipelineConfig,
  PipelineConfigCreate,
  PipelineConfigUpdate,
  PipelineValidationResponse,
} from '../types/pipeline';

export const PipelinePage: React.FC = () => {
  const { navigate } = useRouter();

  // Datasets state
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState<boolean>(true);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  // Selected dataset state
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedQuality, setSelectedQuality] = useState<DataQualitySummary | null>(null);
  const [isLoadingQuality, setIsLoadingQuality] = useState<boolean>(false);

  // Saved configurations state
  const [savedConfigs, setSavedConfigs] = useState<PipelineConfig[]>([]);
  const [isLoadingConfigs, setIsLoadingConfigs] = useState<boolean>(false);
  const [isSavedDrawerOpen, setIsSavedDrawerOpen] = useState<boolean>(false);

  // Active editing configuration state
  const [activeConfigId, setActiveConfigId] = useState<string | null>(null);
  const [activeConfigVersion, setActiveConfigVersion] = useState<number>(1);

  // Configuration Form State
  const [configName, setConfigName] = useState<string>('Primary Telemetry Pipeline');
  const [description, setDescription] = useState<string>('Standard anomaly detection and signal reconstruction configuration');
  const [timestampColumn, setTimestampColumn] = useState<string | null>(null);
  const [sensorColumns, setSensorColumns] = useState<string[]>([]);
  const [ignoredColumns, setIgnoredColumns] = useState<string[]>([]);

  // Detection Settings
  const [statEnabled, setStatEnabled] = useState<boolean>(true);
  const [statWindowSize, setStatWindowSize] = useState<number>(30);
  const [statMadThreshold, setStatMadThreshold] = useState<number>(3.5);
  const [statMinObservations, setStatMinObservations] = useState<number>(10);

  const [isoEnabled, setIsoEnabled] = useState<boolean>(true);
  const [isoContamination, setIsoContamination] = useState<number>(0.05);
  const [isoRandomSeed, setIsoRandomSeed] = useState<number>(42);
  const [isoMinObservations, setIsoMinObservations] = useState<number>(50);

  // Reconstruction Settings
  const [allowLinearInterp, setAllowLinearInterp] = useState<boolean>(true);
  const [maxGapSize, setMaxGapSize] = useState<number>(5);
  const [requireCrossSensor, setRequireCrossSensor] = useState<boolean>(true);
  const [preserveOriginalReadings] = useState<boolean>(true); // Enforced immutable invariant
  const [allowAutoCorrection, setAllowAutoCorrection] = useState<boolean>(false);
  const [fallbackBehavior, setFallbackBehavior] = useState<'abstain_unresolved' | 'flag_only'>('abstain_unresolved');

  // Confidence & Review Policy
  const [reviewThreshold, setReviewThreshold] = useState<number>(0.80);
  const [humanReviewRequired, setHumanReviewRequired] = useState<boolean>(true);
  const [minEvidenceSensors, setMinEvidenceSensors] = useState<number>(1);
  const [unjustifiedBehavior, setUnjustifiedBehavior] = useState<'abstain_unresolved' | 'retain_raw'>('abstain_unresolved');

  // Validation & Save feedback
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationResult, setValidationResult] = useState<PipelineValidationResponse | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);

  // Dirty tracking & confirmation modal
  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [showDiscardModal, setShowDiscardModal] = useState<boolean>(false);

  // Load datasets and saved configurations on mount
  const loadDatasets = useCallback(async () => {
    setIsLoadingDatasets(true);
    setDatasetError(null);
    try {
      const res = await datasetService.listDatasets();
      setDatasets(res.datasets);
      if (res.datasets.length > 0 && !selectedDatasetId) {
        setSelectedDatasetId(res.datasets[0].dataset_id);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDatasetError(msg);
    } finally {
      setIsLoadingDatasets(false);
    }
  }, [selectedDatasetId]);

  const loadSavedConfigs = useCallback(async () => {
    setIsLoadingConfigs(true);
    try {
      const res = await pipelineService.listConfigs();
      setSavedConfigs(res.pipelines);
    } catch {
      // Non-blocking error for saved configurations
    } finally {
      setIsLoadingConfigs(false);
    }
  }, []);

  useEffect(() => {
    loadDatasets();
    loadSavedConfigs();
  }, [loadDatasets, loadSavedConfigs]);

  // Load quality audit when selected dataset changes
  useEffect(() => {
    if (!selectedDatasetId) {
      setSelectedQuality(null);
      return;
    }
    let ignore = false;
    setIsLoadingQuality(true);
    datasetService
      .getDatasetQuality(selectedDatasetId)
      .then((q) => {
        if (!ignore) {
          setSelectedQuality(q);
          // If configuring for the first time without active config, auto-map columns
          if (!activeConfigId) {
            // Pick candidate timestamp if available
            const cand = q.timestamp_candidates.length > 0 ? q.timestamp_candidates[0].column_name : null;
            setTimestampColumn(cand);

            // Numeric columns as sensors
            const numCols = q.columns.filter((c) => c.is_numeric && c.name !== cand).map((c) => c.name);
            setSensorColumns(numCols);

            // Non-numeric columns other than timestamp as ignored
            const otherCols = q.columns.filter((c) => !c.is_numeric && c.name !== cand).map((c) => c.name);
            setIgnoredColumns(otherCols);
          }
        }
      })
      .catch(() => {
        if (!ignore) setSelectedQuality(null);
      })
      .finally(() => {
        if (!ignore) setIsLoadingQuality(false);
      });

    return () => {
      ignore = true;
    };
  }, [selectedDatasetId, activeConfigId]);

  // Selected dataset metadata helper
  const selectedMeta = useMemo(() => {
    return datasets.find((d) => d.dataset_id === selectedDatasetId) || null;
  }, [datasets, selectedDatasetId]);

  // Build payload helper
  const currentPayload: PipelineConfigCreate = useMemo(() => {
    return {
      configuration_name: configName.trim() || 'Untitled Pipeline Configuration',
      description: description.trim() || undefined,
      dataset_id: selectedDatasetId,
      timestamp_column: timestampColumn || undefined,
      sensor_columns: sensorColumns,
      ignored_columns: ignoredColumns,
      detection_settings: {
        statistical: {
          enabled: statEnabled,
          window_size: statWindowSize,
          mad_threshold: statMadThreshold,
          min_observations: statMinObservations,
        },
        isolation_forest: {
          enabled: isoEnabled,
          contamination: isoContamination,
          random_seed: isoRandomSeed,
          min_observations: isoMinObservations,
        },
      },
      reconstruction_settings: {
        allow_linear_interpolation: allowLinearInterp,
        max_gap_size: maxGapSize,
        require_cross_sensor_validation: requireCrossSensor,
        preserve_original_readings: preserveOriginalReadings,
        allow_automatic_correction: allowAutoCorrection,
        fallback_behavior: fallbackBehavior,
      },
      confidence_policy: {
        review_threshold: reviewThreshold,
        human_review_required: humanReviewRequired,
        min_evidence_sensors: minEvidenceSensors,
        unjustified_behavior: unjustifiedBehavior,
      },
    };
  }, [
    configName,
    description,
    selectedDatasetId,
    timestampColumn,
    sensorColumns,
    ignoredColumns,
    statEnabled,
    statWindowSize,
    statMadThreshold,
    statMinObservations,
    isoEnabled,
    isoContamination,
    isoRandomSeed,
    isoMinObservations,
    allowLinearInterp,
    maxGapSize,
    requireCrossSensor,
    preserveOriginalReadings,
    allowAutoCorrection,
    fallbackBehavior,
    reviewThreshold,
    humanReviewRequired,
    minEvidenceSensors,
    unjustifiedBehavior,
  ]);

  // Handle Unsaved Changes Guard
  const guardDirtyAction = (action: () => void) => {
    if (isDirty) {
      setPendingAction(() => action);
      setShowDiscardModal(true);
    } else {
      action();
    }
  };

  const confirmDiscard = () => {
    setShowDiscardModal(false);
    setIsDirty(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  // Perform backend validation
  const handleValidate = async () => {
    if (!selectedDatasetId) {
      setSaveErrorMessage('Please select a dataset to validate against.');
      return;
    }
    setIsValidating(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);
    try {
      const res = await pipelineService.validateConfig(currentPayload);
      setValidationResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveErrorMessage(`Validation request failed: ${msg}`);
      setValidationResult(null);
    } finally {
      setIsValidating(false);
    }
  };

  // Perform backend save
  const handleSave = async (saveAsNew: boolean = false) => {
    if (!selectedDatasetId) {
      setSaveErrorMessage('Please select a dataset first.');
      return;
    }
    setIsSaving(true);
    setSaveSuccessMessage(null);
    setSaveErrorMessage(null);

    try {
      if (activeConfigId && !saveAsNew) {
        // Update existing configuration
        const updatePayload: PipelineConfigUpdate = currentPayload;
        const updated = await pipelineService.updateConfig(activeConfigId, updatePayload);
        setActiveConfigVersion(updated.configuration_version);
        setSaveSuccessMessage(`Successfully updated configuration "${updated.configuration_name}" to version ${updated.configuration_version}.`);
        setIsDirty(false);
        // Refresh validation state
        const valRes = await pipelineService.validateConfig(currentPayload);
        setValidationResult(valRes);
      } else {
        // Create new configuration
        const created = await pipelineService.createConfig(currentPayload);
        setActiveConfigId(created.configuration_id);
        setActiveConfigVersion(created.configuration_version);
        setSaveSuccessMessage(`Successfully created and persisted configuration "${created.configuration_name}" (ID: ${created.configuration_id}).`);
        setIsDirty(false);
        // Refresh validation state
        const valRes = await pipelineService.validateConfig(currentPayload);
        setValidationResult(valRes);
      }
      loadSavedConfigs();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSaveErrorMessage(msg);
      // Run validation to display exact issues
      try {
        const valRes = await pipelineService.validateConfig(currentPayload);
        setValidationResult(valRes);
      } catch {
        // Ignore fallback validation failure
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to new clean configuration
  const handleResetToNew = () => {
    guardDirtyAction(() => {
      setActiveConfigId(null);
      setActiveConfigVersion(1);
      setConfigName('Primary Telemetry Pipeline');
      setDescription('Standard anomaly detection and signal reconstruction configuration');
      setValidationResult(null);
      setSaveSuccessMessage(null);
      setSaveErrorMessage(null);

      if (selectedQuality) {
        const cand = selectedQuality.timestamp_candidates.length > 0 ? selectedQuality.timestamp_candidates[0].column_name : null;
        setTimestampColumn(cand);
        setSensorColumns(selectedQuality.columns.filter((c) => c.is_numeric && c.name !== cand).map((c) => c.name));
        setIgnoredColumns(selectedQuality.columns.filter((c) => !c.is_numeric && c.name !== cand).map((c) => c.name));
      }
      setIsDirty(false);
    });
  };

  // Load an existing configuration for editing
  const handleLoadConfig = (config: PipelineConfig) => {
    guardDirtyAction(() => {
      setActiveConfigId(config.configuration_id);
      setActiveConfigVersion(config.configuration_version);
      setConfigName(config.configuration_name);
      setDescription(config.description || '');
      setSelectedDatasetId(config.dataset_id);
      setTimestampColumn(config.timestamp_column || null);
      setSensorColumns(config.sensor_columns || []);
      setIgnoredColumns(config.ignored_columns || []);

      // Detection
      setStatEnabled(config.detection_settings.statistical.enabled);
      setStatWindowSize(config.detection_settings.statistical.window_size);
      setStatMadThreshold(config.detection_settings.statistical.mad_threshold);
      setStatMinObservations(config.detection_settings.statistical.min_observations);

      setIsoEnabled(config.detection_settings.isolation_forest.enabled);
      setIsoContamination(config.detection_settings.isolation_forest.contamination);
      setIsoRandomSeed(config.detection_settings.isolation_forest.random_seed);
      setIsoMinObservations(config.detection_settings.isolation_forest.min_observations);

      // Reconstruction
      setAllowLinearInterp(config.reconstruction_settings.allow_linear_interpolation);
      setMaxGapSize(config.reconstruction_settings.max_gap_size);
      setRequireCrossSensor(config.reconstruction_settings.require_cross_sensor_validation);
      setAllowAutoCorrection(config.reconstruction_settings.allow_automatic_correction);
      setFallbackBehavior(config.reconstruction_settings.fallback_behavior);

      // Confidence
      setReviewThreshold(config.confidence_policy.review_threshold);
      setHumanReviewRequired(config.confidence_policy.human_review_required);
      setMinEvidenceSensors(config.confidence_policy.min_evidence_sensors);
      setUnjustifiedBehavior(config.confidence_policy.unjustified_behavior);

      setValidationResult(null);
      setSaveSuccessMessage(null);
      setSaveErrorMessage(null);
      setIsDirty(false);
      setIsSavedDrawerOpen(false);
    });
  };

  // Column role helpers
  const getColumnRole = (colName: string): 'timestamp' | 'sensor' | 'ignored' | 'unassigned' => {
    if (timestampColumn === colName) return 'timestamp';
    if (sensorColumns.includes(colName)) return 'sensor';
    if (ignoredColumns.includes(colName)) return 'ignored';
    return 'unassigned';
  };

  const setColumnRole = (colName: string, role: 'timestamp' | 'sensor' | 'ignored' | 'unassigned') => {
    setIsDirty(true);
    // Remove from everywhere first
    if (timestampColumn === colName) setTimestampColumn(null);
    setSensorColumns((prev) => prev.filter((c) => c !== colName));
    setIgnoredColumns((prev) => prev.filter((c) => c !== colName));

    if (role === 'timestamp') {
      setTimestampColumn(colName);
    } else if (role === 'sensor') {
      setSensorColumns((prev) => [...prev, colName]);
    } else if (role === 'ignored') {
      setIgnoredColumns((prev) => [...prev, colName]);
    }
  };

  const handleAutoMap = () => {
    if (!selectedQuality) return;
    setIsDirty(true);
    const cand = selectedQuality.timestamp_candidates.length > 0 ? selectedQuality.timestamp_candidates[0].column_name : null;
    setTimestampColumn(cand);
    setSensorColumns(selectedQuality.columns.filter((c) => c.is_numeric && c.name !== cand).map((c) => c.name));
    setIgnoredColumns(selectedQuality.columns.filter((c) => !c.is_numeric && c.name !== cand).map((c) => c.name));
  };

  const handleClearAllRoles = () => {
    setIsDirty(true);
    setTimestampColumn(null);
    setSensorColumns([]);
    setIgnoredColumns([]);
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Pipeline Configuration"
        description="Map dataset channels, configure anomaly-detection parameters, define signal reconstruction policies, and validate settings against actual data."
        badge="Phase 4 Active"
        badgeVariant="emerald"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              icon={FolderOpen}
              onClick={() => setIsSavedDrawerOpen(true)}
            >
              Saved Configs ({savedConfigs.length})
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon={Plus}
              onClick={handleResetToNew}
            >
              New Config
            </Button>
            <Button
              variant="outline"
              size="sm"
              icon={RefreshCw}
              loading={isValidating}
              onClick={handleValidate}
            >
              Validate
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={Save}
              loading={isSaving}
              onClick={() => handleSave(false)}
            >
              {activeConfigId ? `Update (Save v${activeConfigVersion + 1})` : 'Save Configuration'}
            </Button>
          </div>
        }
      />

      {/* Discard Changes Warning Modal */}
      {showDiscardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-semibold text-slate-100">Discard Unsaved Changes?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              You have modified pipeline settings or column assignments that have not been saved. Discarding will revert to the saved state or selected configuration.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <Button variant="outline" size="sm" onClick={() => setShowDiscardModal(false)}>
                Keep Editing
              </Button>
              <Button variant="danger" size="sm" onClick={confirmDiscard}>
                Discard & Continue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Active Editing Banner */}
      {activeConfigId && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-slate-100">{configName}</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold">
                  v{activeConfigVersion}
                </span>
                <span className="text-[11px] font-mono text-slate-400">
                  ID: {activeConfigId}
                </span>
              </div>
              <p className="text-xs text-amber-300/80 mt-0.5">
                Currently reviewing and modifying saved configuration. Saving will increment version to v{activeConfigVersion + 1}.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              icon={Plus}
              onClick={() => handleSave(true)}
              loading={isSaving}
            >
              Save As New Copy
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetToNew}
            >
              Exit Edit
            </Button>
          </div>
        </div>
      )}

      {/* Save Success & Error Feedback Banners */}
      {saveSuccessMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-emerald-200">Configuration Saved</span>
            <p className="mt-0.5 text-emerald-300/90 leading-relaxed">{saveSuccessMessage}</p>
            <div className="mt-2.5 flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={Play}
                onClick={() => navigate('/anomalies')}
              >
                Proceed to Anomaly Detection &rarr;
              </Button>
            </div>
          </div>
          <button
            onClick={() => setSaveSuccessMessage(null)}
            className="text-emerald-400 hover:text-emerald-200 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {saveErrorMessage && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300">
          <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold text-rose-200">Save Error</span>
            <p className="mt-0.5 text-rose-300/90 leading-relaxed">{saveErrorMessage}</p>
          </div>
          <button
            onClick={() => setSaveErrorMessage(null)}
            className="text-rose-400 hover:text-rose-200 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 1: Dataset Selector & Metadata */}
      <Card>
        <CardHeader
          title="1. Target Dataset Selection"
          subtitle="Choose an ingested dataset to configure channel mappings and validate settings"
          icon={Database}
          badge={
            selectedMeta ? (
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {selectedMeta.row_count.toLocaleString()} rows • {selectedMeta.column_count} cols
              </span>
            ) : null
          }
        />
        <CardContent className="space-y-4">
          {isLoadingDatasets ? (
            <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
              <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
              <span>Loading registered datasets...</span>
            </div>
          ) : datasetError ? (
            <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs text-rose-300 flex items-center justify-between">
              <span>{datasetError}</span>
              <Button variant="outline" size="sm" onClick={loadDatasets}>Retry</Button>
            </div>
          ) : datasets.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-200">No Datasets Uploaded</p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  A dataset must be ingested before you can configure a pipeline. Upload industrial CSV telemetry on the Datasets page.
                </p>
              </div>
              <a
                href="/datasets"
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold"
              >
                Go to Datasets Page <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2 space-y-3">
                <label className="block text-xs font-medium text-slate-300">
                  Select Dataset
                </label>
                <select
                  value={selectedDatasetId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    guardDirtyAction(() => {
                      setSelectedDatasetId(newId);
                      setActiveConfigId(null);
                      setValidationResult(null);
                    });
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-amber-500"
                >
                  {datasets.map((d) => (
                    <option key={d.dataset_id} value={d.dataset_id}>
                      {d.filename} ({d.row_count.toLocaleString()} rows, {d.column_count} cols) — {d.dataset_id}
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Configuration Name
                    </label>
                    <input
                      type="text"
                      value={configName}
                      onChange={(e) => {
                        setConfigName(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Turbine Bearing Monitoring Net"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-400 mb-1">
                      Description / Notes
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => {
                        setDescription(e.target.value);
                        setIsDirty(true);
                      }}
                      placeholder="e.g. Dual-axis vibration with outer race temperature"
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Dataset Inspection Summary */}
              {selectedMeta && (
                <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                  <div className="flex items-center justify-between text-slate-400 border-b border-slate-800/80 pb-2">
                    <span className="font-semibold text-slate-200">Dataset Metadata</span>
                    <span className="font-mono text-[10px] text-amber-400">{selectedMeta.dataset_id}</span>
                  </div>
                  <div className="space-y-1.5 text-[11px] text-slate-300">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Filename:</span>
                      <span className="font-mono truncate max-w-[150px]">{selectedMeta.filename}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Rows:</span>
                      <span className="font-mono text-slate-200">{selectedMeta.row_count.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Total Columns:</span>
                      <span className="font-mono text-slate-200">{selectedMeta.column_count}</span>
                    </div>
                    {selectedQuality && (
                      <div className="flex justify-between">
                        <span className="text-slate-400">Missing Cells:</span>
                        <span className="font-mono text-amber-400">
                          {selectedQuality.total_missing_cells} ({selectedQuality.missing_cells_percentage.toFixed(1)}%)
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION 2: Column Role Mapping */}
      {isLoadingQuality ? (
        <Card>
          <CardContent className="py-8 text-center text-xs text-slate-400">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400 mx-auto mb-2" />
            <span>Analyzing dataset column schema and data quality...</span>
          </CardContent>
        </Card>
      ) : selectedQuality && (
        <Card>
          <CardHeader
            title="2. Telemetry Channel Mapping"
            subtitle="Map timestamp, numeric physical sensors, and ignored channels. Sensor channels must contain numeric data."
            icon={Layers}
            badge={
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                  {sensorColumns.length} Sensors Mapped
                </span>
                {timestampColumn ? (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    Timestamp: {timestampColumn}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                    No Timestamp
                  </span>
                )}
              </div>
            }
            action={
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" icon={Sparkles} onClick={handleAutoMap}>
                  Auto-Map Suggested
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearAllRoles}>
                  Clear All
                </Button>
              </div>
            }
          />
          <CardContent className="space-y-4">
            {/* Timestamp status notice */}
            {!timestampColumn && (
              <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-xs text-amber-300">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                <span>
                  No timestamp column is currently mapped. The dataset will be processed as static unordered observations. Time-based rolling window detection will be unavailable.
                </span>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Column Name</th>
                    <th className="py-2.5 px-3">Detected Type</th>
                    <th className="py-2.5 px-3">Quality & Missing</th>
                    <th className="py-2.5 px-3">Assigned Role</th>
                    <th className="py-2.5 px-3">Quick Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300">
                  {selectedQuality.columns.map((col) => {
                    const role = getColumnRole(col.name);
                    const isCandidateTimestamp = selectedQuality.timestamp_candidates.some(
                      (c) => c.column_name === col.name
                    );

                    return (
                      <tr
                        key={col.name}
                        className={
                          role === 'sensor'
                            ? 'bg-amber-500/5'
                            : role === 'timestamp'
                            ? 'bg-emerald-500/5'
                            : role === 'ignored'
                            ? 'bg-slate-950/40 opacity-70'
                            : 'bg-slate-900/40'
                        }
                      >
                        <td className="py-2.5 px-3 font-semibold text-slate-200">
                          <div className="flex items-center gap-1.5">
                            <span>{col.name}</span>
                            {isCandidateTimestamp && (
                              <span
                                title="Candidate Timestamp Detected"
                                className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                              >
                                Datetime Candidate
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border ${
                              col.is_numeric
                                ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                                : col.detected_type === 'datetime'
                                ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {col.detected_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-[11px]">
                          {col.missing_count > 0 ? (
                            <span className="text-amber-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              {col.missing_count} missing ({col.missing_percentage.toFixed(1)}%)
                            </span>
                          ) : (
                            <span className="text-slate-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Complete (0 missing)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`inline-block text-[10px] uppercase font-bold px-2 py-0.5 rounded border ${
                              role === 'sensor'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : role === 'timestamp'
                                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                : role === 'ignored'
                                ? 'bg-slate-800 text-slate-400 border-slate-700'
                                : 'bg-slate-900 text-slate-500 border-slate-800'
                            }`}
                          >
                            {role}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setColumnRole(col.name, role === 'timestamp' ? 'unassigned' : 'timestamp')}
                              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                role === 'timestamp'
                                  ? 'bg-emerald-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              }`}
                            >
                              Timestamp
                            </button>
                            <button
                              type="button"
                              disabled={!col.is_numeric}
                              title={!col.is_numeric ? 'Only numeric columns can be mapped as sensors' : undefined}
                              onClick={() => setColumnRole(col.name, role === 'sensor' ? 'unassigned' : 'sensor')}
                              className={`px-2 py-1 text-[10px] rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                                role === 'sensor'
                                  ? 'bg-amber-500 text-slate-950 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                              }`}
                            >
                              Sensor
                            </button>
                            <button
                              type="button"
                              onClick={() => setColumnRole(col.name, role === 'ignored' ? 'unassigned' : 'ignored')}
                              className={`px-2 py-1 text-[10px] rounded transition-colors ${
                                role === 'ignored'
                                  ? 'bg-slate-600 text-slate-100 font-bold'
                                  : 'bg-slate-800 hover:bg-slate-700 text-slate-400 border border-slate-700'
                              }`}
                            >
                              Exclude
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SECTION 3: Anomaly Detection Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="3A. Statistical Detector Settings"
            subtitle="Rolling Median Absolute Deviation (MAD) outlier detection"
            icon={ShieldAlert}
            badge={
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={statEnabled}
                  onChange={(e) => {
                    setStatEnabled(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <span className={statEnabled ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                  {statEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            }
          />
          <CardContent className="space-y-4">
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Rolling Window Size (samples)</span>
                  <span className="font-mono text-amber-400 font-semibold">{statWindowSize} samples</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="500"
                  step="5"
                  value={statWindowSize}
                  disabled={!statEnabled}
                  onChange={(e) => {
                    setStatWindowSize(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full accent-amber-500 disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Consecutive observations used to evaluate local median and dispersion.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>MAD Sensitivity Threshold (multiples of MAD)</span>
                  <span className="font-mono text-amber-400 font-semibold">{statMadThreshold.toFixed(1)} σ_mad</span>
                </div>
                <input
                  type="range"
                  min="1.0"
                  max="10.0"
                  step="0.1"
                  value={statMadThreshold}
                  disabled={!statEnabled}
                  onChange={(e) => {
                    setStatMadThreshold(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full accent-amber-500 disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cutoff threshold: deviations beyond this multiple of MAD from rolling median are tagged as outlier spikes.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Minimum Observations</span>
                  <span className="font-mono text-amber-400 font-semibold">{statMinObservations} samples</span>
                </div>
                <input
                  type="number"
                  min="5"
                  max="100"
                  value={statMinObservations}
                  disabled={!statEnabled}
                  onChange={(e) => {
                    setStatMinObservations(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Minimum valid samples required before statistical boundaries are calculated.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="3B. Isolation Forest Settings"
            subtitle="Multivariate tree ensemble anomaly detection across sensor dimensions"
            icon={ShieldAlert}
            badge={
              <label className="flex items-center gap-2 cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={isoEnabled}
                  onChange={(e) => {
                    setIsoEnabled(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <span className={isoEnabled ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                  {isoEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </label>
            }
          />
          <CardContent className="space-y-4">
            <div className="space-y-3 text-xs">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Contamination / Expected Anomaly Fraction</span>
                  <span className="font-mono text-amber-400 font-semibold">{(isoContamination * 100).toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0.001"
                  max="0.5"
                  step="0.005"
                  value={isoContamination}
                  disabled={!isoEnabled}
                  onChange={(e) => {
                    setIsoContamination(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full accent-amber-500 disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Expected proportion of anomalies across all sensor channels (0.1% to 50.0%).
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Deterministic Random Seed</span>
                  <span className="font-mono text-amber-400 font-semibold">{isoRandomSeed}</span>
                </div>
                <input
                  type="number"
                  min="0"
                  value={isoRandomSeed}
                  disabled={!isoEnabled}
                  onChange={(e) => {
                    setIsoRandomSeed(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ensures deterministic tree generation and reproducible anomaly flags.
                </p>
              </div>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Minimum Observations</span>
                  <span className="font-mono text-amber-400 font-semibold">{isoMinObservations} samples</span>
                </div>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  value={isoMinObservations}
                  disabled={!isoEnabled}
                  onChange={(e) => {
                    setIsoMinObservations(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono disabled:opacity-40"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Minimum training observations required for fitting isolation trees.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 4: Reconstruction & Confidence Policies */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader
            title="4. Reconstruction Policies"
            subtitle="Permitted signal healing rules and strict abstention requirements"
            icon={Sliders}
          />
          <CardContent className="space-y-4 text-xs">
            {/* Architectural Invariant Box */}
            <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-800/50 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="font-semibold text-emerald-300">Raw Measurement Preservation Enforced</span>
                <p className="text-[11px] text-emerald-400/80 leading-relaxed">
                  Architectural invariant: raw measured sensor readings are permanently retained and never overwritten by candidate reconstructions.
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowLinearInterp}
                  onChange={(e) => {
                    setAllowLinearInterp(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <span className="font-semibold text-slate-200">Allow Linear Interpolation</span>
                  <p className="text-[11px] text-slate-400">
                    Permits linear interpolation for small internal missing gaps within permitted limits.
                  </p>
                </div>
              </label>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Maximum Interpolation Gap Size</span>
                  <span className="font-mono text-amber-400 font-semibold">{maxGapSize} samples</span>
                </div>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={maxGapSize}
                  onChange={(e) => {
                    setMaxGapSize(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Missing gaps wider than this number will abstain and trigger fallback handling.
                </p>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={requireCrossSensor}
                  onChange={(e) => {
                    setRequireCrossSensor(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <span className="font-semibold text-slate-200">Require Cross-Sensor Validation</span>
                  <p className="text-[11px] text-slate-400">
                    Candidate repairs must be validated against correlated neighboring sensors when available.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowAutoCorrection}
                  onChange={(e) => {
                    setAllowAutoCorrection(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <span className="font-semibold text-slate-200">Permit Automatic Correction</span>
                  <p className="text-[11px] text-slate-400">
                    Repairs exceeding the decision threshold can be promoted without manual operator sign-off.
                  </p>
                </div>
              </label>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Fallback Behavior on Insufficient Evidence
                </label>
                <select
                  value={fallbackBehavior}
                  onChange={(e) => {
                    setFallbackBehavior(e.target.value as 'abstain_unresolved' | 'flag_only');
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-amber-500"
                >
                  <option value="abstain_unresolved">Strict Abstention (Return UNRESOLVED)</option>
                  <option value="flag_only">Flag Only (Retain Raw Reading)</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="5. Confidence & Review Policy"
            subtitle="Threshold decision rubric and minimum evidence consensus"
            icon={Sliders}
          />
          <CardContent className="space-y-4 text-xs">
            {/* Decision Threshold Callout */}
            <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-300 text-[11px] leading-relaxed">
              <strong className="text-amber-200 font-semibold block mb-0.5">Policy Notice</strong>
              The confidence threshold is a decision policy cutoff, not a calibrated probability. Proposed repairs scoring below this cutoff are strictly rejected or routed to human review.
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Review Decision Threshold</span>
                  <span className="font-mono text-amber-400 font-semibold">{(reviewThreshold * 100).toFixed(0)}% ({reviewThreshold.toFixed(2)})</span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.0"
                  step="0.01"
                  value={reviewThreshold}
                  onChange={(e) => {
                    setReviewThreshold(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full accent-amber-500"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Candidate repairs with confidence below this threshold abstain as UNRESOLVED.
                </p>
              </div>

              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={humanReviewRequired}
                  onChange={(e) => {
                    setHumanReviewRequired(e.target.checked);
                    setIsDirty(true);
                  }}
                  className="mt-0.5 rounded border-slate-700 text-amber-500 focus:ring-amber-500/30"
                />
                <div>
                  <span className="font-semibold text-slate-200">Mandate Human Operator Review</span>
                  <p className="text-[11px] text-slate-400">
                    Flag candidate corrections for manual confirmation before committing to downstream control loop.
                  </p>
                </div>
              </label>

              <div>
                <div className="flex justify-between text-slate-300 mb-1">
                  <span>Minimum Evidence Sensors (Corroborating channels)</span>
                  <span className="font-mono text-amber-400 font-semibold">{minEvidenceSensors} sensor(s)</span>
                </div>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={minEvidenceSensors}
                  onChange={(e) => {
                    setMinEvidenceSensors(Number(e.target.value));
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-hidden focus:border-amber-500 font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Minimum number of agreeing sensor channels required to substantiate a repair.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Behavior When Correction Cannot Be Justified
                </label>
                <select
                  value={unjustifiedBehavior}
                  onChange={(e) => {
                    setUnjustifiedBehavior(e.target.value as 'abstain_unresolved' | 'retain_raw');
                    setIsDirty(true);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-hidden focus:border-amber-500"
                >
                  <option value="abstain_unresolved">Strict Abstention (UNRESOLVED)</option>
                  <option value="retain_raw">Retain Raw Unaltered Value</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* SECTION 5: Backend Validation Summary */}
      {validationResult && (
        <Card variant={validationResult.is_valid ? 'accent' : 'danger'}>
          <CardHeader
            title="Backend Configuration Validation Summary"
            subtitle="Real-time verification against target dataset schema and data quality"
            icon={validationResult.is_valid ? CheckCircle2 : XCircle}
            badge={
              <span
                className={`text-[10px] font-mono font-bold px-2.5 py-1 rounded border ${
                  validationResult.is_valid
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                }`}
              >
                {validationResult.is_valid ? 'VALID CONFIGURATION' : 'VALIDATION BLOCKED'}
              </span>
            }
          />
          <CardContent className="space-y-4 text-xs">
            {validationResult.errors.length > 0 && (
              <div className="space-y-2">
                <span className="font-semibold text-rose-300 flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 text-rose-400" /> Blocking Errors ({validationResult.errors.length})
                </span>
                <ul className="space-y-1 pl-6 list-disc text-rose-200">
                  {validationResult.errors.map((err, i) => (
                    <li key={i}>
                      <strong className="font-mono text-rose-300">{err.field}:</strong> {err.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult.warnings.length > 0 && (
              <div className="space-y-2">
                <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" /> Advisory Warnings ({validationResult.warnings.length})
                </span>
                <ul className="space-y-1 pl-6 list-disc text-amber-200/90">
                  {validationResult.warnings.map((warn, i) => (
                    <li key={i}>
                      <strong className="font-mono text-amber-300">{warn.field}:</strong> {warn.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {validationResult.is_valid && validationResult.warnings.length === 0 && (
              <p className="text-emerald-300 font-medium">
                All column assignments, detection thresholds, and reconstruction policies are validated and ready for persistent storage.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* SECTION 6: Saved Configurations Drawer */}
      {isSavedDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/70 backdrop-blur-xs">
          <div className="bg-slate-900 border-l border-slate-800 w-full max-w-xl h-full flex flex-col p-6 shadow-2xl space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-semibold text-slate-100">Saved Pipeline Configurations</h3>
              </div>
              <button
                onClick={() => setIsSavedDrawerOpen(false)}
                className="text-slate-400 hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingConfigs ? (
              <div className="flex items-center justify-center py-12 text-xs text-slate-400">
                <RefreshCw className="w-4 h-4 animate-spin text-amber-400 mr-2" />
                Loading saved configurations...
              </div>
            ) : savedConfigs.length === 0 ? (
              <div className="text-center py-12 space-y-2 text-slate-400 text-xs">
                <FolderOpen className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-slate-300 font-semibold">No Saved Configurations</p>
                <p>Save a validated configuration to access it here for subsequent pipeline processing.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {savedConfigs.map((cfg) => (
                  <div
                    key={cfg.configuration_id}
                    className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-slate-100">{cfg.configuration_name}</span>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
                            v{cfg.configuration_version}
                          </span>
                        </div>
                        {cfg.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{cfg.description}</p>
                        )}
                      </div>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleLoadConfig(cfg)}
                      >
                        Load & Edit
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-400 bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                      <div>Dataset: <span className="text-slate-200">{cfg.dataset_id}</span></div>
                      <div>Timestamp: <span className="text-slate-200">{cfg.timestamp_column || 'None'}</span></div>
                      <div>Sensors: <span className="text-amber-400">{cfg.sensor_columns.length}</span></div>
                      <div>Updated: <span className="text-slate-300">{new Date(cfg.updated_at).toLocaleDateString()}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 7: Pipeline Execution Status Box (Honest Empty State) */}
      <Card>
        <CardHeader
          title="Pipeline Execution Status"
          subtitle="Monitor active and queued data processing jobs"
          icon={Play}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              0 Active Runs
            </span>
          }
          action={
            <Button
              variant="outline"
              size="sm"
              icon={Play}
              disabled
              title="Pipeline execution will be enabled in a subsequent phase."
            >
              Execute Pipeline (Phase 5 Target)
            </Button>
          }
        />
        <CardContent>
          <EmptyState
            icon={Activity}
            title="No Active Pipeline Runs"
            description="Pipeline execution will be enabled in a subsequent phase. Saved configurations are preserved and ready for future processing."
            plannedPhase="Phase 5"
            plannedEndpoints={[
              'POST /api/pipelines/{id}/execute',
              'GET /api/pipelines/runs/{id}/status',
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
};
