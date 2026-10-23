import React from 'react';
import {
  Wrench,
  ArrowRightLeft,
  Info,
  Scale,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';
import { StatusBadge } from '../components/common/StatusBadge';

export const ReconstructionPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Reconstruction Studio"
        description="Self-healing signal repair and evidence-based confidence evaluation. Preserves raw measurements while reconstructing damaged signals or abstaining when evidence is insufficient."
        badge="Phase 3 Target"
        badgeVariant="amber"
      />

      {/* Informational Boundary Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Reconstruction Engine Invariants
          </span>
          <p className="text-slate-400 leading-relaxed">
            Signal reconstruction models will be implemented in Phase 3. In accordance with strict pipeline invariants, 
            <strong> no synthetic repaired readings are generated</strong>. Below is the complete structural architecture and status specification.
          </p>
        </div>
      </div>

      {/* Deep Dive: The Four Processing Statuses */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-semibold text-slate-200 uppercase tracking-wide font-mono">
              Signal Status Architecture
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-400">
            4 Rigorous Classification States
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Status 1: MEASURED */}
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-950/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status="MEASURED" />
              <span className="text-[10px] font-mono text-cyan-400">01 Raw</span>
            </div>
            <h3 className="text-sm font-semibold text-cyan-200">Original Measurement</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Physical sensor reading preserved in its exact un-altered form. Stored in an immutable ledger and never overwritten.
            </p>
            <div className="pt-2 border-t border-cyan-900/40 text-[10px] font-mono text-cyan-300/80">
              Preservation: 100% Immutable
            </div>
          </div>

          {/* Status 2: ESTIMATED */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-950/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status="ESTIMATED" />
              <span className="text-[10px] font-mono text-amber-400">02 Proposal</span>
            </div>
            <h3 className="text-sm font-semibold text-amber-200">Contextual Proposal</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Candidate signal generated through multivariate physical correlations and temporal dynamics. Pending confidence validation.
            </p>
            <div className="pt-2 border-t border-amber-900/40 text-[10px] font-mono text-amber-300/80">
              Confidence Range: 0.00 – 1.00
            </div>
          </div>

          {/* Status 3: CORRECTED */}
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status="CORRECTED" />
              <span className="text-[10px] font-mono text-emerald-400">03 Verified</span>
            </div>
            <h3 className="text-sm font-semibold text-emerald-200">Validated Repair</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Reconstructed signal with confidence meeting or exceeding the strict policy threshold (≥ 0.80). Cleared for downstream analytics.
            </p>
            <div className="pt-2 border-t border-emerald-900/40 text-[10px] font-mono text-emerald-300/80">
              Threshold: Confidence ≥ 0.80
            </div>
          </div>

          {/* Status 4: UNRESOLVED */}
          <div className="rounded-xl border border-rose-500/30 bg-rose-950/10 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <StatusBadge status="UNRESOLVED" />
              <span className="text-[10px] font-mono text-rose-400">04 Abstained</span>
            </div>
            <h3 className="text-sm font-semibold text-rose-200">Strict Abstention</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Evidence was insufficient or sensor correlations were degraded. The pipeline strictly abstains rather than injecting synthetic guesses.
            </p>
            <div className="pt-2 border-t border-rose-900/40 text-[10px] font-mono text-rose-300/80">
              Policy: Zero Fabricated Values
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Interface Concept */}
      <Card>
        <CardHeader
          title="Raw Telemetry vs Reconstructed Signal Comparison Concept"
          subtitle="Dual-trace comparison interface between original readings and healed proposals"
          icon={ArrowRightLeft}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              Interface Specification
            </span>
          }
        />
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            When a pipeline run executes in Phase 3, this studio provides an interactive side-by-side visualization:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-cyan-400 font-semibold">1. Raw Trace</div>
              <div className="text-slate-400 text-[11px]">
                Displays un-filtered measured readings including missing gaps, clipped peaks, and transient spikes.
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-amber-400 font-semibold">2. Proposed Healing</div>
              <div className="text-slate-400 text-[11px]">
                Renders model-generated reconstruction with confidence band intervals and uncertainty margins.
              </div>
            </div>
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <div className="text-emerald-400 font-semibold">3. Audit Decision</div>
              <div className="text-slate-400 text-[11px]">
                Indicates final status commit (MEASURED, CORRECTED, or UNRESOLVED) with rationale code.
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reconstruction Ledger & Records — Honest Empty State */}
      <Card>
        <CardHeader
          title="Signal Reconstruction Records"
          subtitle="Audit ledger of individual signal repair decisions"
          icon={Wrench}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              0 Records
            </span>
          }
        />
        <CardContent>
          <EmptyState
            icon={Wrench}
            title="No Reconstruction Records"
            description="Reconstruction records will be produced once dataset pipelines execute in Phase 3. Every record will detail original raw values, proposed values, confidence scores, and final status tags."
            plannedPhase="Phase 3"
            plannedEndpoints={[
              'GET /api/reconstruction/records',
              'GET /api/reconstruction/summary',
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
};
