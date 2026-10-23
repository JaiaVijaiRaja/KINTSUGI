import React, { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { Button } from '../components/common/Button';
import { datasetService } from '../services/datasetService';
import type {
  DatasetMetadata,
  DataQualitySummary,
  DatasetPreviewResponse,
} from '../types/dataset';

export const DatasetsPage: React.FC = () => {
  // State for dataset catalog
  const [datasets, setDatasets] = useState<DatasetMetadata[]>([]);
  const [isLoadingDatasets, setIsLoadingDatasets] = useState<boolean>(true);
  const [datasetListError, setDatasetListError] = useState<string | null>(null);

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
    async (datasetId: string, limit: number = 50, offset: number = 0) => {
      setSelectedDatasetId(datasetId);
      setIsLoadingDetails(true);
      setDetailsError(null);

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
        `Successfully ingested '${result.metadata.filename}' (${result.metadata.row_count.toLocaleString()} rows, ${result.metadata.column_count} columns).`
      );
      // Reload catalog and auto-inspect newly uploaded dataset
      await loadDatasets();
      await selectDataset(result.metadata.dataset_id);
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
    <div className="space-y-8">
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
        <div className="flex items-start gap-3 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-300">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <span className="font-semibold text-emerald-200">Ingestion Succeeded</span>
            <p className="text-emerald-300/90 leading-relaxed font-mono">
              {uploadSuccessMsg}
            </p>
          </div>
          <button
            onClick={() => setUploadSuccessMsg(null)}
            className="text-emerald-400 hover:text-emerald-200 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {uploadErrorMsg && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
          <XCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1 space-y-0.5">
            <span className="font-semibold text-rose-200">Ingestion Rejected</span>
            <p className="text-rose-300/90 leading-relaxed font-mono">
              {uploadErrorMsg}
            </p>
          </div>
          <button
            onClick={() => setUploadErrorMsg(null)}
            className="text-rose-400 hover:text-rose-200 transition-colors cursor-pointer"
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
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
            className={`border-2 border-dashed rounded-xl p-8 sm:p-10 text-center transition-all cursor-pointer select-none ${
              isDragging
                ? 'border-amber-400 bg-amber-500/10 scale-[1.005]'
                : isUploading
                ? 'border-slate-700 bg-slate-950/40 opacity-75 cursor-wait'
                : 'border-slate-800 bg-slate-950/40 hover:border-amber-500/50 hover:bg-slate-900/40'
            }`}
          >
            <div className="mx-auto w-12 h-12 rounded-xl bg-slate-900 flex items-center justify-center border border-slate-800 text-amber-400 mb-4 shadow-sm">
              {isUploading ? (
                <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
              ) : (
                <Upload className="w-6 h-6 text-amber-400" />
              )}
            </div>

            <div className="space-y-1.5 max-w-md mx-auto">
              <h3 className="text-sm sm:text-base font-semibold text-slate-200">
                {isUploading
                  ? 'Parsing & computing quality summary on backend...'
                  : isDragging
                  ? 'Drop CSV file to begin ingestion'
                  : 'Drag & drop your CSV file here, or click to browse'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Accepted: <strong className="text-slate-300">.csv</strong> files. Maximum limit: <strong className="text-slate-300">50 MB</strong>. Must contain header row with at least 1 data row.
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
            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <FileCheck className="w-4 h-4 text-amber-400" />
                <span>Strict Header Validation</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Headers are sanitized; empty column names and duplicate column headers are strictly rejected.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <TableIcon className="w-4 h-4 text-amber-400" />
                <span>Genuine Quality Audit</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Calculates true missing counts, duplicate full rows, timestamp monotonicity, and numeric sensor stats.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>Immutable Raw Storage</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
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
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              {datasets.length} Total
            </span>
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => loadDatasets()}
              loading={isLoadingDatasets}
              icon={RefreshCw}
            >
              Refresh
            </Button>
          }
        />
        <CardContent>
          {datasetListError && (
            <div className="p-4 mb-4 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{datasetListError}</span>
            </div>
          )}

          {isLoadingDatasets ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
              <p className="text-xs text-slate-400 font-mono">
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
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
                <tbody className="divide-y divide-slate-800/80 font-mono">
                  {datasets.map((ds) => {
                    const isSelected = selectedDatasetId === ds.dataset_id;
                    return (
                      <tr
                        key={ds.dataset_id}
                        className={`transition-colors ${
                          isSelected
                            ? 'bg-amber-500/10 text-amber-200'
                            : 'hover:bg-slate-900/60 text-slate-300'
                        }`}
                      >
                        <td className="py-3 px-3.5 font-medium flex items-center gap-2">
                          <FileSpreadsheet className="w-4 h-4 text-amber-400 shrink-0" />
                          <span className="truncate max-w-[200px]" title={ds.filename}>
                            {ds.filename}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-slate-400">
                          <span
                            className="bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-[11px]"
                            title={ds.dataset_id}
                          >
                            {ds.dataset_id}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-slate-200 font-semibold">
                          {ds.row_count.toLocaleString()}
                        </td>
                        <td className="py-3 px-3.5 text-slate-400">{ds.column_count}</td>
                        <td className="py-3 px-3.5 text-slate-400">
                          {formatBytes(ds.file_size_bytes)}
                        </td>
                        <td className="py-3 px-3.5 text-slate-400 text-[11px]">
                          {formatDate(ds.uploaded_at)}
                        </td>
                        <td className="py-3 px-3.5">
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-500/30 text-[10px] uppercase font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            Ready
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-right">
                          <Button
                            variant={isSelected ? 'primary' : 'secondary'}
                            size="sm"
                            icon={Eye}
                            onClick={() => selectDataset(ds.dataset_id)}
                          >
                            {isSelected ? 'Inspecting' : 'Inspect'}
                          </Button>
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

      {/* Selected Dataset Inspection Section */}
      {selectedDatasetId && (
        <div id="dataset-inspection" className="space-y-6 pt-2">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100 font-mono">
                    {selectedMetadata ? selectedMetadata.filename : selectedDatasetId}
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                    {selectedDatasetId}
                  </span>
                </div>
                <p className="text-xs text-slate-400">
                  Detailed data-quality summary and row-level preview generated by the Python backend.
                </p>
              </div>
            </div>

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

          {detailsError && (
            <div className="p-4 rounded-lg bg-rose-950/40 border border-rose-900/60 text-xs text-rose-300 flex items-center gap-2">
              <XCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{detailsError}</span>
            </div>
          )}

          {isLoadingDetails ? (
            <div className="py-16 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-slate-300 font-mono">
                Calculating quality audit and loading row preview...
              </p>
            </div>
          ) : selectedQuality && selectedMetadata ? (
            <>
              {/* Quality Summary KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">
                    Total Rows
                  </span>
                  <span className="text-xl font-mono font-bold text-slate-100">
                    {selectedQuality.total_rows.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    {selectedMetadata.columns.length} columns registered
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">
                    Missing Cells
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xl font-mono font-bold ${
                        selectedQuality.total_missing_cells === 0
                          ? 'text-emerald-400'
                          : 'text-amber-400'
                      }`}
                    >
                      {selectedQuality.total_missing_cells.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ({selectedQuality.missing_cells_percentage}%)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    Across all cells
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">
                    Duplicate Rows
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span
                      className={`text-xl font-mono font-bold ${
                        selectedQuality.duplicate_rows_count === 0
                          ? 'text-emerald-400'
                          : 'text-rose-400'
                      }`}
                    >
                      {selectedQuality.duplicate_rows_count.toLocaleString()}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      ({selectedQuality.duplicate_rows_percentage}%)
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-500 block font-mono">
                    Full row duplicates
                  </span>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-mono text-slate-400 block">
                    Timestamp Candidates
                  </span>
                  <span className="text-xl font-mono font-bold text-amber-400">
                    {selectedQuality.timestamp_candidates.length}
                  </span>
                  <span className="text-[10px] text-slate-500 block font-mono truncate">
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
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        {selectedQuality.timestamp_candidates.length} Candidate(s)
                      </span>
                    }
                  />
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedQuality.timestamp_candidates.map((ts) => (
                        <div
                          key={ts.column_name}
                          className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2.5 font-mono text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-amber-300 text-sm">
                              {ts.column_name}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border uppercase ${
                                ts.is_monotonic
                                  ? 'bg-emerald-950/60 text-emerald-400 border-emerald-500/30'
                                  : 'bg-amber-950/60 text-amber-400 border-amber-500/30'
                              }`}
                            >
                              {ts.is_monotonic ? 'Monotonic Increasing' : 'Non-Monotonic'}
                            </span>
                          </div>

                          <div className="space-y-1 text-slate-400 text-[11px]">
                            <div className="flex justify-between">
                              <span>Parseable Ratio:</span>
                              <span className="text-slate-200">{ts.parseable_percentage}%</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Duplicate Timestamps:</span>
                              <span className="text-slate-200">
                                {ts.duplicate_timestamp_count} ({ts.duplicate_percentage}%)
                              </span>
                            </div>
                            {ts.sample_format && (
                              <div className="flex justify-between">
                                <span>Sample Format:</span>
                                <span className="text-slate-300 truncate max-w-[200px]">
                                  {ts.sample_format}
                                </span>
                              </div>
                            )}
                          </div>

                          {ts.notes && (
                            <p className="text-[11px] text-slate-400 font-sans pt-1 border-t border-slate-800/80">
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
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {selectedQuality.columns.length} Columns
                    </span>
                  }
                />
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
                      <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
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
                      <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300">
                        {selectedQuality.columns.map((col) => {
                          const typeBadgeClasses = {
                            float: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
                            integer: 'bg-blue-950/60 text-blue-300 border-blue-500/40',
                            datetime: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
                            boolean: 'bg-purple-950/60 text-purple-300 border-purple-500/40',
                            string: 'bg-slate-800 text-slate-300 border-slate-700',
                          }[col.detected_type] || 'bg-slate-800 text-slate-300 border-slate-700';

                          return (
                            <tr key={col.name} className="hover:bg-slate-900/40">
                              <td className="py-2.5 px-3 font-semibold text-slate-200">
                                {col.name}
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={`text-[9px] uppercase px-1.5 py-0.2 rounded border font-mono ${typeBadgeClasses}`}
                                >
                                  {col.detected_type}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <span
                                  className={
                                    col.missing_count > 0 ? 'text-amber-400' : 'text-slate-400'
                                  }
                                >
                                  {col.missing_count} ({col.missing_percentage}%)
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">
                                {col.unique_count.toLocaleString()}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                {col.numeric_stats ? col.numeric_stats.min : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                {col.numeric_stats ? col.numeric_stats.max : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                {col.numeric_stats ? col.numeric_stats.mean : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-300">
                                {col.numeric_stats ? col.numeric_stats.median : '—'}
                              </td>
                              <td className="py-2.5 px-3 text-slate-400">
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
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
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
                          <span className="text-[11px] font-mono text-slate-400">Size:</span>
                          <select
                            value={previewLimit}
                            onChange={(e) => {
                              const newLimit = parseInt(e.target.value, 10);
                              selectDataset(selectedDatasetId, newLimit, 0);
                            }}
                            className="bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 rounded px-2.5 py-1 focus:outline-hidden focus:ring-1 focus:ring-amber-400 cursor-pointer"
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
                    <div className="overflow-x-auto max-h-[480px] border border-slate-800 rounded-lg">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800 sticky top-0 z-10 shadow-xs">
                          <tr>
                            <th className="py-2 px-3 text-slate-500 w-12 text-center">#</th>
                            {selectedPreview.columns.map((c) => (
                              <th key={c} className="py-2.5 px-3 whitespace-nowrap">
                                {c}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300 bg-slate-950/40">
                          {selectedPreview.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="hover:bg-slate-900/50">
                              <td className="py-2 px-3 text-slate-500 text-center text-[10px]">
                                {selectedPreview.offset + rIdx + 1}
                              </td>
                              {selectedPreview.columns.map((c) => {
                                const val = row[c];
                                const isNull = val === null || val === undefined;
                                return (
                                  <td
                                    key={c}
                                    className={`py-2 px-3 whitespace-nowrap ${
                                      isNull ? 'text-slate-600 italic' : 'text-slate-200'
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
