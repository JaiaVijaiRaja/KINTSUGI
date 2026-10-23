import React from 'react';
import {
  History,
  FileCheck2,
  ShieldCheck,
  Filter,
  Lock,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';

export const AuditPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Audit Trail"
        description="Immutable append-only ledger recording all telemetry ingestions, anomaly detections, repair proposals, confidence scores, and status commits."
        badge="Phase 4 Target"
        badgeVariant="amber"
      />

      {/* Informational Boundary Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Audit Ledger Invariants & Compliance
          </span>
          <p className="text-slate-400 leading-relaxed">
            The KINTSUGI audit ledger is designed as an immutable append-only event store. 
            Real audit ledger persistence and query endpoints (<code className="text-amber-300 font-mono">GET /api/audit/records</code>) will be implemented in Phase 4.
          </p>
        </div>
      </div>

      {/* Ledger Integrity Architecture */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Cryptographic Lineage</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Each event links to the preceding entry via SHA-256 digest hashing to prevent retroactive record alteration.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Complete Traceability</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Captures raw measured values, algorithmic reconstruction proposals, confidence scores, and final commit status.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <FileCheck2 className="w-4 h-4 text-amber-400" />
            <span>Regulatory Export</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Supports standardized export formats (JSONL, Parquet) for external compliance audits and safety certifications.
          </p>
        </div>
      </div>

      {/* Audit Query Filter Concept */}
      <Card>
        <CardHeader
          title="Ledger Query & Filter Concept"
          subtitle="Query ledger entries by dataset, run, sensor channel, or processing status"
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
                Pipeline Run ID
              </label>
              <input
                type="text"
                disabled
                placeholder="All pipeline runs (Phase 4)"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-mono uppercase text-slate-400 block">
                Final Status
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>All Statuses (MEASURED, ESTIMATED, CORRECTED, UNRESOLVED)</option>
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
                Action Type
              </label>
              <select
                disabled
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-500 cursor-not-allowed"
              >
                <option>All Actions (Ingest, Flag, Repair, Abstain)</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Table Structure — Honest Empty State */}
      <Card>
        <CardHeader
          title="Immutable Audit Ledger Records"
          subtitle="Event-by-event chronological history of pipeline decisions"
          icon={History}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              0 Entries Logged
            </span>
          }
        />
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border border-slate-800 rounded-lg overflow-hidden">
              <thead className="bg-slate-950 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Timestamp (UTC)</th>
                  <th className="py-2.5 px-3">Run ID</th>
                  <th className="py-2.5 px-3">Sensor Channel</th>
                  <th className="py-2.5 px-3">Raw Value</th>
                  <th className="py-2.5 px-3">Proposed Value</th>
                  <th className="py-2.5 px-3">Final Value</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Final Status</th>
                  <th className="py-2.5 px-3">Decision Reason</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={10} className="py-12 text-center bg-slate-950/30">
                    <EmptyState
                      icon={History}
                      title="No Audit Records Present"
                      description="The immutable audit ledger will begin logging events as soon as pipeline runs execute in Phase 4. No synthetic audit events are fabricated."
                      plannedPhase="Phase 4"
                      plannedEndpoints={[
                        'GET /api/audit/records',
                        'GET /api/audit/verify/{id}',
                        'GET /api/audit/export',
                      ]}
                    />
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
