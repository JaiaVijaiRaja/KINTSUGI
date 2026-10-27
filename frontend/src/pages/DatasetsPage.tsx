import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Database,
  Upload,
  FileSpreadsheet,
  FileCheck,
  Table as TableIcon,
  ShieldCheck,
  RefreshCw,
  Clock,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  FileText,
  Sliders,
  Search,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  Activity,
} from 'lucide-react';
import { useRouter } from '../router';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { datasetService } from '../services/datasetService';
import { pipelineService } from '../services/pipelineService';
import type {
  DatasetMetadata,
  DataQualitySummary,
  DatasetPreviewResponse,
} from '../types/dataset';

export const DatasetsPage: React.FC = () => {
  const { navigate } = useRouter();
  // State for dataset catalog
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState<boolean>(true);
  const [datasetListError, setDatasetListError] = useState<string | null>(null);
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const catalogPageSize = 10;

  // State for upload workflow
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadSuccessMsg, setUploadSuccessMsg] = useState<string | null>(null);
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // State for selected dataset inspection
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedMetadata, setSelectedMetadata] = useState<DatasetMetadata | null>(null);
  const [selectedQuality, setSelectedQuality] = useState<DataQualitySummary | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<DatasetPreviewResponse | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState<boolean>(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [previewLimit, setPreviewLimit] = useState<number>(50);
  const [previewOffset, setPreviewOffset] = useState<number>(0);
  const inspectionRef = useRef<HTMLDivElement>(null);

  // Fetch all datasets from backend
  const loadDatasets = useCallback(async (showLoading: boolean = true) => {
    if (showLoading) setIsLoadingDatasets(true);
    setDatasetListError(null);
    try {
      const res = await datasetService.listDatasets();
      setDatasets(res.datasets);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDatasetListError(msg);
    } finally {
      setIsLoadingDatasets(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    datasetService
      .listDatasets()
      .then((res) => {
        if (!ignore) {
          setDatasets(res.datasets);
          setIsLoadingDatasets(false);
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const msg = err instanceof Error ? err.message : String(err);
          setDatasetListError(msg);
          setIsLoadingDatasets(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  // Load details and preview when a dataset is selected
  const selectDataset = useCallback(
    async (datasetId: string, limit: number = 50, offset: number = 0, shouldScroll: boolean = true) => {
      setSelectedDatasetId(datasetId);
      setIsLoadingDetails(true);
      setDetailsError(null);

      if (shouldScroll) {
        setTimeout(() => {
          inspectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 80);
      }

      try {
        const [meta, qual, prev] = await Promise.all([
          datasetService.getDatasetById(datasetId),
          datasetService.getDatasetQuality(datasetId),
          datasetService.getDatasetPreview(datasetId, limit, offset),
        ]);
        setSelectedMetadata(meta);
        setSelectedQuality(qual);
        setSelectedPreview(prev);
        setPreviewLimit(limit);
        setPreviewOffset(offset);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setDetailsError(msg);
      } finally {
        setIsLoadingDetails(false);
      }
    },
    []
  );

  // Filtered & Paginated Datasets
  const filteredDatasets = useMemo(() => {
    if (!catalogSearch.trim()) return datasets;
    const q = catalogSearch.toLowerCase().trim();
    return datasets.filter(
      (ds) =>
        ds.filename.toLowerCase().includes(q) ||
        ds.dataset_id.toLowerCase().includes(q)
    );
  }, [datasets, catalogSearch]);

  const totalCatalogPages = useMemo(() => {
    return Math.max(1, Math.ceil(filteredDatasets.length / catalogPageSize));
  }, [filteredDatasets.length, catalogPageSize]);

  const pagedDatasets = useMemo(() => {
    const start = (catalogPage - 1) * catalogPageSize;
    return filteredDatasets.slice(start, start + catalogPageSize);
  }, [filteredDatasets, catalogPage, catalogPageSize]);

  // File upload handler with frontend pre-validation
  const handleUploadFile = async (file: File) => {
    setUploadSuccessMsg(null);
    setUploadErrorMsg(null);

    // 1. Basic frontend validation
    if (!file.name.toLowerCase().endsWith('.csv')) {
      setUploadErrorMsg(`Invalid file '${file.name}'. Only .csv files are permitted.`);
      return;
    }

    if (file.size === 0) {
      setUploadErrorMsg(`Selected file '${file.name}' is empty (0 bytes).`);
      return;
    }

    const maxSizeBytes = 50 * 1024 * 1024; // 50 MB
    if (file.size > maxSizeBytes) {
      setUploadErrorMsg(
        `File '${file.name}' (${(file.size / (1024 * 1024)).toFixed(1)} MB) exceeds the 50 MB limit.`
      );
      return;
    }

    // 2. Perform multipart upload to Python backend
    setIsUploading(true);
    try {
      const result = await datasetService.uploadDataset(file);
      setUploadSuccessMsg(
        `Successfully ingested '${result.metadata.filename}' (${result.metadata.row_count.toLocaleString()} rows, ${result.metadata.column_count} columns). Quality verification completed.`
      );

      // Store as active dataset for immediate access in Anomaly Explorer
      localStorage.setItem('kintsugi_active_dataset_id', result.metadata.dataset_id);

      // Auto-provision a default pipeline configuration so Anomaly Explorer is ready immediately
      try {
        const tsCol = result.quality?.timestamp_candidates?.length > 0
          ? result.quality.timestamp_candidates[0].column_name
          : 'timestamp';
        const sensorCols = (result.quality?.columns || [])
          .filter((c) => c.is_numeric && c.name !== tsCol)
          .map((c) => c.name);
        const ignoredCols = (result.quality?.columns || [])
          .filter((c) => !c.is_numeric && c.name !== tsCol)
          .map((c) => c.name);

        if (sensorCols.length > 0) {
          await pipelineService.createConfig({
            configuration_name: `Pipeline — ${result.metadata.filename}`,
            description: `Auto-configured telemetry pipeline for ${result.metadata.filename}`,
            dataset_id: result.metadata.dataset_id,
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
        }
      } catch (pipeErr) {
        console.warn('Auto pipeline creation notice:', pipeErr);
      }

      // Reload catalog and auto-inspect newly uploaded dataset
      await loadDatasets();
      await selectDataset(result.metadata.dataset_id, 50, 0, true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadErrorMsg(msg);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (isUploading) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleUploadFile(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      handleUploadFile(file);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  const formatDate = (isoStr: string) => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dataset Management"
        description="Ingest, validate, preview, and audit multi-sensor industrial time-series CSV telemetry. Preserves raw measurements for strict downstream compliance."
        badge="Phase 3 Live"
        badgeVariant="emerald"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadDatasets()}
            loading={isLoadingDatasets}
            icon={RefreshCw}
          >
            Refresh Catalog
          </Button>
        }
      />

      {/* Upload Notification Banners */}
      {uploadSuccessMsg && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 shadow-2xs">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <span className="font-semibold text-emerald-900">Ingestion Succeeded</span>
            <p className="text-emerald-800/90 leading-relaxed font-mono">
              {uploadSuccessMsg}
            </p>
          </div>
          <button
            onClick={() => setUploadSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadErrorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 shadow-2xs">
          <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <span className="font-semibold text-rose-900">Ingestion Rejected</span>
            <p className="text-rose-800 leading-relaxed font-mono">
              {uploadErrorMsg}
            </p>
          </div>
          <button
            onClick={() => setUploadErrorMsg(null)}
            className="text-rose-600 hover:text-rose-900 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Upload Section with Real Drag-and-Drop & File Picker */}
      <Card>
        <CardHeader
          title="Upload Industrial Telemetry Dataset"
          subtitle="Multi-channel sensor measurements in CSV format (up to 50 MB)"
          icon={Upload}
          badge={
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Active Ingestion
            </span>
          }
        />
        <CardContent className="space-y-6">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept=".csv,text/csv"
            className="hidden"
            aria-label="Upload CSV File"
          />

          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !isUploading && fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-8 sm:p-10 text-center transition-all cursor-pointer select-none ${
              isDragging
                ? 'border-[#EE602C] bg-orange-50/40 scale-[1.005]'
                : isUploading
                ? 'border-stone-300 bg-stone-50/50 opacity-75 cursor-wait'
                : 'border-[#E0DCD3] bg-white hover:border-[#EE602C] hover:bg-orange-50/10'
            }`}
          >
            <div className="mx-auto w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center border border-orange-200 text-[#EE602C] mb-4 shadow-2xs">
              {isUploading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-[#EE602C]" />
              ) : (
                <Upload className="w-6 h-6 text-[#EE602C]" />
              )}
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-sm sm:text-base font-semibold text-stone-900">
                {isUploading
                  ? 'Parsing & computing quality summary on backend...'
                  : isDragging
                  ? 'Drop CSV file to begin ingestion'
                  : 'Drag & drop your CSV file here, or click to browse'}
              </h3>
              <p className="text-xs text-stone-500 leading-relaxed">
                Accepted: <strong className="text-stone-700">.csv</strong> files. Maximum limit: <strong className="text-stone-700">50 MB</strong>. Must contain header row with at least 1 data row.
              </p>
            </div>

            <div className="mt-5 flex items-center justify-center gap-3">
              <Button
                variant="primary"
                size="sm"
                loading={isUploading}
                disabled={isUploading}
                icon={Upload}
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
              >
                {isUploading ? 'Ingesting...' : 'Select CSV File'}
              </Button>
            </div>
          </div>

          {/* Ingestion Rules & Architectural Invariants */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                <FileCheck className="w-4 h-4 text-[#EE602C]" />
                <span>Strict Header Validation</span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Headers are sanitized; empty column names and duplicate column headers are strictly rejected.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                <TableIcon className="w-4 h-4 text-[#EE602C]" />
                <span>Genuine Quality Audit</span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Calculates true missing counts, duplicate full rows, timestamp monotonicity, and numeric sensor stats.
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-stone-50 border border-stone-200 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-stone-800">
                <ShieldCheck className="w-4 h-4 text-[#EE602C]" />
                <span>Immutable Raw Storage</span>
              </div>
              <p className="text-[11px] text-stone-600 leading-relaxed">
                Raw files are assigned server-controlled identifiers and preserved intact in isolated storage.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Dataset Catalog Table */}
      <Card>
        <CardHeader
          title="Cataloged Datasets"
          subtitle="All telemetry files parsed and stored by the backend engine"
          icon={Database}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-semibold">
              {filteredDatasets.length} of {datasets.length} Total
            </span>
          }
          action={
            <div className="flex items-center gap-2">
              {selectedDatasetId && (
                <Button
                  variant="primary"
                  size="sm"
                  icon={ArrowDown}
                  onClick={() => inspectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                >
                  View Inspected Dataset
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => loadDatasets()}
                loading={isLoadingDatasets}
                icon={RefreshCw}
              >
                Refresh
              </Button>
            </div>
          }
        />
        <CardContent>
          {datasetListError && (
            <div className="p-4 mb-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{datasetListError}</span>
            </div>
          )}

          {/* Search Bar & Active Inspection Indicator */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => {
                  setCatalogSearch(e.target.value);
                  setCatalogPage(1);
                }}
                placeholder="Search datasets by filename or ID..."
                className="w-full bg-white border border-stone-300 rounded-xl pl-9 pr-8 py-1.5 text-xs font-mono text-stone-800 placeholder:text-stone-400 focus:outline-hidden focus:ring-2 focus:ring-[#EE602C]/30 focus:border-[#EE602C] shadow-2xs"
              />
              {catalogSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setCatalogSearch('');
                    setCatalogPage(1);
                  }}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 text-xs cursor-pointer p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {selectedDatasetId && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-xl text-xs font-mono text-[#EE602C]">
                <Eye className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[220px]">
                  Inspecting: <strong className="text-stone-900">{selectedMetadata?.filename || selectedDatasetId}</strong>
                </span>
                <button
                  onClick={() => inspectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                  className="underline hover:text-[#D95322] cursor-pointer ml-1 font-bold text-[11px]"
                >
                  Scroll Down ↓
                </button>
              </div>
            )}
          </div>

          {isLoadingDatasets ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 text-[#EE602C] animate-spin" />
              <p className="text-xs text-stone-500 font-mono">
                Loading catalog from backend...
              </p>
            </div>
          ) : datasets.length === 0 ? (
            <EmptyState
              icon={Database}
              title="No Datasets Cataloged"
              description="No sensor telemetry datasets have been uploaded yet. Upload a CSV file using the dropzone above to begin."
              plannedEndpoints={[
                'POST /api/datasets/upload',
                'GET /api/datasets',
                'GET /api/datasets/{id}',
              ]}
            />
          ) : filteredDatasets.length === 0 ? (
            <div className="py-12 text-center text-xs text-stone-500 font-mono">
              No datasets found matching &quot;{catalogSearch}&quot;.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border border-stone-200 rounded-xl overflow-hidden">
                  <thead className="bg-[#FAF8F5] text-stone-600 uppercase font-mono text-[10px] border-b border-stone-200">
                    <tr>
                      <th className="py-3 px-3.5">Filename</th>
                      <th className="py-3 px-3.5">Dataset ID</th>
                      <th className="py-3 px-3.5">Rows</th>
                      <th className="py-3 px-3.5">Columns</th>
                      <th className="py-3 px-3.5">File Size</th>
                      <th className="py-3 px-3.5">Uploaded</th>
                      <th className="py-3 px-3.5">Status</th>
                      <th className="py-3 px-3.5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-200/80 font-mono">
                    {pagedDatasets.map((ds) => {
                      const isSelected = selectedDatasetId === ds.dataset_id;
                      return (
                        <tr
                          key={ds.dataset_id}
                          className={`transition-colors ${
                            isSelected
                              ? 'bg-orange-50/70 text-stone-900 font-medium'
                              : 'hover:bg-stone-50 text-stone-700'
                          }`}
                        >
                          <td className="py-3 px-3.5 font-medium flex items-center gap-2">
                            <FileSpreadsheet className="w-4 h-4 text-[#EE602C] shrink-0" />
                            <span className="truncate max-w-[200px]" title={ds.filename}>
                              {ds.filename}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-stone-500">
                            <span
                              className="bg-stone-100 px-2 py-0.5 rounded border border-stone-200 text-[11px]"
                              title={ds.dataset_id}
                            >
                              {ds.dataset_id}
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-stone-900 font-semibold">
                            {ds.row_count.toLocaleString()}
                          </td>
                          <td className="py-3 px-3.5 text-stone-600">{ds.column_count}</td>
                          <td className="py-3 px-3.5 text-stone-600">
                            {formatBytes(ds.file_size_bytes)}
                          </td>
                          <td className="py-3 px-3.5 text-stone-500 text-[11px]">
                            {formatDate(ds.uploaded_at)}
                          </td>
                          <td className="py-3 px-3.5">
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] uppercase font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                              Ready
                            </span>
                          </td>
                          <td className="py-3 px-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                variant="secondary"
                                size="sm"
                                icon={Activity}
                                onClick={() => {
                                  localStorage.setItem('kintsugi_active_dataset_id', ds.dataset_id);
                                  navigate('/anomalies');
                                }}
                                title="Check Anomalies in Anomaly Explorer"
                              >
                                Anomalies
                              </Button>
                              <Button
                                variant={isSelected ? 'primary' : 'secondary'}
                                size="sm"
                                icon={Eye}
                                onClick={() => selectDataset(ds.dataset_id, 50, 0, true)}
                              >
                                {isSelected ? 'Inspecting' : 'Inspect'}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {totalCatalogPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 text-xs font-mono text-stone-500">
                  <span>
                    Showing {(catalogPage - 1) * catalogPageSize + 1}–{Math.min(catalogPage * catalogPageSize, filteredDatasets.length)} of {filteredDatasets.length} datasets
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={catalogPage <= 1}
                      onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                      icon={ChevronLeft}
                    >
                      Previous
                    </Button>
                    <span className="px-3 py-1 rounded-lg bg-stone-100 border border-stone-200 font-semibold text-stone-800">
                      {catalogPage} / {totalCatalogPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={catalogPage >= totalCatalogPages}
                      onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
                    >
                      Next
                      <ChevronRight className="w-3.5 h-3.5 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Selected Dataset Inspection Section */}
      {selectedDatasetId && (
        <div id="dataset-inspection" ref={inspectionRef} className="space-y-6 pt-4 scroll-mt-6 border-2 border-[#EE602C]/30 rounded-3xl p-5 sm:p-6 bg-gradient-to-b from-orange-50/20 to-transparent shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-stone-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-2xl bg-orange-50 border border-orange-200 text-[#EE602C]">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-stone-900 font-mono">
                    {selectedMetadata ? selectedMetadata.filename : selectedDatasetId}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-stone-100 text-stone-700 border border-stone-200">
                    {selectedDatasetId}
                  </span>
                </div>
                <p className="text-xs text-stone-500">
                  Detailed data-quality summary and row-level preview generated by the Python backend.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={Activity}
                onClick={() => {
                  if (selectedDatasetId) {
                    localStorage.setItem('kintsugi_active_dataset_id', selectedDatasetId);
                    navigate('/anomalies');
                  }
                }}
              >
                Inspect Anomalies
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon={X}
                onClick={() => {
                  setSelectedDatasetId(null);
                  setSelectedMetadata(null);
                  setSelectedQuality(null);
                  setSelectedPreview(null);
                }}
              >
                Close Inspection
              </Button>
            </div>
          </div>

          {detailsError && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{detailsError}</span>
            </div>
          )}

          {isLoadingDetails ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-[#EE602C] animate-spin" />
              <p className="text-xs text-stone-600 font-mono">
                Calculating quality audit and loading row preview...
              </p>
            </div>
          ) : selectedQuality && selectedMetadata ? (
            <>
              {/* Quality Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E1] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1">
                  <span className="text-[10px] uppercase font-mono text-stone-500 block">
                    Total Rows
                  </span>
                  <span className="text-xl font-mono font-bold text-stone-900">
                    {selectedQuality.total_rows.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-stone-500 block font-mono">
                    {selectedMetadata.columns.length} columns registered
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E1] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1">
                  <span className="text-[10px] uppercase font-mono text-stone-500 block">
                    Missing Cells
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xl font-mono font-bold ${
                        selectedQuality.total_missing_cells === 0
                          ? 'text-emerald-700'
                          : 'text-amber-700'
                      }`}
                    >
                      {selectedQuality.total_missing_cells.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-stone-500">
                      ({selectedQuality.missing_cells_percentage}%)
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-500 block font-mono">
                    Across all cells
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E1] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1">
                  <span className="text-[10px] uppercase font-mono text-stone-500 block">
                    Duplicate Rows
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xl font-mono font-bold ${
                        selectedQuality.duplicate_rows_count === 0
                          ? 'text-emerald-700'
                          : 'text-rose-700'
                      }`}
                    >
                      {selectedQuality.duplicate_rows_count.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-stone-500">
                      ({selectedQuality.duplicate_rows_percentage}%)
                    </span>
                  </div>
                  <span className="text-[10px] text-stone-500 block font-mono">
                    Full row duplicates
                  </span>
                </div>

                <div className="p-4 rounded-2xl bg-white border border-[#EBE7E1] shadow-[0_2px_8px_rgba(0,0,0,0.02)] space-y-1">
                  <span className="text-[10px] uppercase font-mono text-stone-500 block">
                    Timestamp Candidates
                  </span>
                  <span className="text-xl font-mono font-bold text-amber-700">
                    {selectedQuality.timestamp_candidates.length}
                  </span>
                  <span className="text-[10px] text-stone-500 block font-mono truncate">
                    {selectedQuality.timestamp_candidates.length > 0
                      ? selectedQuality.timestamp_candidates.map((t) => t.column_name).join(', ')
                      : 'None detected'}
                  </span>
                </div>
              </div>

              {/* Timestamp Candidates Analysis Card */}
              {selectedQuality.timestamp_candidates.length > 0 && (
                <Card>
                  <CardHeader
                    title="Candidate Timestamp Channel Analysis"
                    subtitle="Conservative detection of temporal telemetry coordinates"
                    icon={Clock}
                    badge={
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        {selectedQuality.timestamp_candidates.length} Candidate(s)
                      </span>
                    }
                  />
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedQuality.timestamp_candidates.map((ts) => (
                        <div
                          key={ts.column_name}
                          className="p-4 rounded-2xl bg-stone-50 border border-stone-200 space-y-2.5 font-mono text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-stone-900 text-sm">
                              {ts.column_name}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border uppercase font-semibold ${
                                ts.is_monotonic
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : 'bg-amber-50 text-amber-800 border-amber-200'
                              }`}
                            >
                              {ts.is_monotonic ? 'Monotonic Increasing' : 'Non-Monotonic'}
                            </span>
                          </div>

                          <div className="space-y-1 text-stone-600 text-[11px]">
                            <div className="flex justify-between">
                              <span>Parseable Ratio:</span>
                              <span className="text-stone-900 font-semibold">{ts.parseable_percentage}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Duplicate Timestamps:</span>
                              <span className="text-stone-900 font-semibold">
                                {ts.duplicate_timestamp_count} ({ts.duplicate_percentage}%)
                              </span>
                            </div>
                            {ts.sample_format && (
                              <div className="flex justify-between">
                                <span>Sample Format:</span>
                                <span className="text-stone-800 truncate max-w-[200px]">
                                  {ts.sample_format}
                                </span>
                              </div>
                            )}
                          </div>

                          {ts.notes && (
                            <p className="text-[11px] text-stone-600 font-sans pt-1 border-t border-stone-200">
                              {ts.notes}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Column-by-Column Metadata & Data Quality Table */}
              <Card>
                <CardHeader
                  title="Column Schema & Quality Audit"
                  subtitle="Detailed type detection, missing value distribution, and descriptive statistics"
                  icon={Sliders}
                  badge={
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-stone-100 text-stone-700 border border-stone-200 font-semibold">
                      {selectedQuality.columns.length} Columns
                    </span>
                  }
                />
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-stone-200 rounded-xl overflow-hidden">
                      <thead className="bg-[#FAF8F5] text-stone-600 uppercase font-mono text-[10px] border-b border-stone-200">
                        <tr>
                          <th className="py-2.5 px-3">Column</th>
                          <th className="py-2.5 px-3">Type</th>
                          <th className="py-2.5 px-3">Missing</th>
                          <th className="py-2.5 px-3">Unique</th>
                          <th className="py-2.5 px-3">Min</th>
                          <th className="py-2.5 px-3">Max</th>
                          <th className="py-2.5 px-3">Mean</th>
                          <th className="py-2.5 px-3">Median</th>
                          <th className="py-2.5 px-3">Std Dev</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-200 font-mono text-stone-700">
                        {selectedQuality.columns.map((col) => {
                          const typeBadgeClasses = {
                            float: 'bg-cyan-50 text-cyan-800 border-cyan-200',
                            integer: 'bg-blue-50 text-blue-800 border-blue-200',
                            datetime: 'bg-amber-50 text-amber-800 border-amber-200',
                            boolean: 'bg-purple-50 text-purple-800 border-purple-200',
                            string: 'bg-stone-100 text-stone-700 border-stone-200',
                          }[col.detected_type] || 'bg-stone-100 text-stone-700 border-stone-200';

                          return (
                            <tr key={col.name} className="hover:bg-stone-50/70">
                              <td className="py-2.5 px-3 font-semibold text-stone-900">
                                {col.name}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-mono font-semibold ${typeBadgeClasses}`}
                                >
                                  {col.detected_type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={
                                    col.missing_count > 0 ? 'text-amber-700 font-bold' : 'text-stone-500'
                                  }
                                >
                                  {col.missing_count} ({col.missing_percentage}%)
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-stone-600">
                                {col.unique_count.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-stone-700">
                                {col.numeric_stats && col.numeric_stats.min !== null && col.numeric_stats.min !== undefined ? col.numeric_stats.min : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-stone-700">
                                {col.numeric_stats && col.numeric_stats.max !== null && col.numeric_stats.max !== undefined ? col.numeric_stats.max : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-stone-700">
                                {col.numeric_stats && col.numeric_stats.mean !== null && col.numeric_stats.mean !== undefined ? col.numeric_stats.mean : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-stone-700">
                                {col.numeric_stats && col.numeric_stats.median !== null && col.numeric_stats.median !== undefined ? col.numeric_stats.median : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-stone-600">
                                {col.numeric_stats && col.numeric_stats.std !== null
                                  ? col.numeric_stats.std
                                  : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Tabular Preview of Actual Stored Rows */}
              {selectedPreview && (
                <Card>
                  <CardHeader
                    title="Actual Dataset Row Preview"
                    subtitle={`Displaying rows ${selectedPreview.offset + 1} to ${Math.min(
                      selectedPreview.offset + selectedPreview.preview_rows,
                      selectedPreview.total_rows
                    )} of ${selectedPreview.total_rows.toLocaleString()}`}
                    icon={TableIcon}
                    badge={
                      <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {selectedPreview.preview_rows} Rows Loaded
                      </span>
                    }
                    action={
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={previewOffset === 0 || isLoadingDetails}
                            onClick={() => {
                              const newOffset = Math.max(0, previewOffset - previewLimit);
                              selectDataset(selectedDatasetId, previewLimit, newOffset);
                            }}
                          >
                            Prev
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={
                              previewOffset + selectedPreview.preview_rows >= selectedPreview.total_rows ||
                              isLoadingDetails
                            }
                            onClick={() => {
                              const newOffset = previewOffset + previewLimit;
                              selectDataset(selectedDatasetId, previewLimit, newOffset);
                            }}
                          >
                            Next
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-mono text-stone-500">Size:</span>
                          <select
                            value={previewLimit}
                            onChange={(e) => {
                              const newLimit = parseInt(e.target.value, 10);
                              selectDataset(selectedDatasetId, newLimit, 0);
                            }}
                            className="bg-white border border-stone-200 text-xs font-mono text-stone-800 rounded-lg px-2.5 py-1 focus:outline-hidden focus:ring-1 focus:ring-[#EE602C] cursor-pointer shadow-2xs"
                          >
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>
                    }
                  />
                  <CardContent>
                    <div className="overflow-x-auto max-h-[480px] border border-stone-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#FAF8F5] text-stone-600 uppercase font-mono text-[10px] border-b border-stone-200 sticky top-0 z-10 shadow-2xs">
                          <tr>
                            <th className="py-2 px-3 text-stone-400 w-12 text-center">#</th>
                            {selectedPreview.columns.map((c) => (
                              <th key={c} className="py-2.5 px-3 whitespace-nowrap">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-200 font-mono text-stone-800 bg-white">
                          {selectedPreview.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-stone-50">
                              <td className="py-2 px-3 text-stone-400 text-center text-[10px]">
                                {selectedPreview.offset + rIdx + 1}
                              </td>
                              {selectedPreview.columns.map((c) => {
                                const val = row[c];
                                const isNull = val === null || val === undefined;
                                return (
                                  <td
                                    key={c}
                                    className={`py-2 px-3 whitespace-nowrap ${
                                      isNull ? 'text-stone-400 italic font-normal' : 'text-stone-900 font-medium'
                                    }`}
                                  >
                                    {isNull ? 'null' : String(val)}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};
