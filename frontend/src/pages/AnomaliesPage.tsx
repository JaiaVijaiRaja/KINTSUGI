import React from 'react';
import {
  ShieldAlert,
  LineChart,
  Filter,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';

export const AnomaliesPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Anomaly Explorer"
        description="Inspect quality anomalies, high-frequency transients, frozen signals, and packet losses detected across industrial sensor streams."
        badge="Phase 3 Target"
        badgeVariant="amber"
      />

      {/* Informational Boundary Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Anomaly Detection Engine Boundary
          </span>
          <p className="text-slate-400 leading-relaxed">
            No synthetic anomaly points or simulated charts are shown. 
            Real anomaly detection will execute against ingested datasets in Phase 3 via <code className="text-amber-300 font-mono">GET /api/anomalies</code>.
          </p>
        </div>
      </div>

      {/* Filter and Sensor Selection Controls (Planned Interface) */}
      <Card>
        <CardHeader
          title="Telemetry Filter & Sensor Channel Selection"
          subtitle="Query filters for multi-channel industrial telemetry analysis"
          icon={Filter}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Query Interface
            </span>
          }
        />
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 block">
                Target Dataset
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>No datasets registered (Phase 3)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 block">
                Sensor Channel
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>All Sensor Channels</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 block">
                Anomaly Type
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>All Types (Spike, Frozen, Loss)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 block">
                Severity Cutoff
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>All Severities (Low - Critical)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Time-Series Visualization Area — Honest Empty State */}
      <Card>
        <CardHeader
          title="Multi-Channel Time-Series Visualization Canvas"
          subtitle="Interactive chart overlaying detected anomalies on raw telemetry channels"
          icon={LineChart}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Interactive View
            </span>
          }
        />
        <CardContent>
          <div className="min-h-[280px] flex items-center justify-center border border-slate-800/80 rounded-xl bg-slate-950/50 p-6">
            <EmptyState
              icon={LineChart}
              title="Visualization Canvas Standby"
              description="No anomaly points to display. Once sensor datasets are processed by the detection engine in Phase 3, this canvas will render synchronous time-series graphs with highlighted anomaly bounding intervals."
              plannedPhase="Phase 3"
              plannedEndpoints={[
                'GET /api/anomalies/timeseries',
                'GET /api/anomalies/summary',
              ]}
            />
          </div>
        </CardContent>
      </Card>

      {/* Anomaly Records Table Structure */}
      <Card>
        <CardHeader
          title="Detected Anomaly Records"
          subtitle="Tabular audit of flagged points with anomaly classification and severity"
          icon={ShieldAlert}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              0 Records
            </span>
          }
        />
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Sensor Channel</th>
                  <th className="py-2.5 px-3">Measured Value</th>
                  <th className="py-2.5 px-3">Anomaly Type</th>
                  <th className="py-2.5 px-3">Severity</th>
                  <th className="py-2.5 px-3">Score</th>
                  <th className="py-2.5 px-3">Triggered Rule</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={7} className="py-8 text-center bg-slate-950/30">
                    <div className="text-xs text-slate-500 font-mono">
                      No anomaly records detected. Ingest and execute an industrial dataset in Phase 3 to populate.
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
