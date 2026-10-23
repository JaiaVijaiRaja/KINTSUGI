import React from 'react';
import {
  Award,
  CheckCircle2,
  TrendingUp,
  Zap,
  Sliders,
  BarChart2,
  Info,
} from 'lucide-react';
import { PageHeader } from '../components/common/PageHeader';
import { Card, CardHeader, CardContent } from '../components/common/Card';
import { EmptyState } from '../components/common/EmptyState';

export const EvaluationPage: React.FC = () => {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Evaluation Center"
        description="Rigorous benchmark evaluation suite assessing anomaly detection accuracy, reconstruction error, confidence calibration, and audit completeness."
        badge="Phase 4 Target"
        badgeVariant="amber"
      />

      {/* Strict Anti-Fabrication Notice */}
      <div className="flex items-start gap-3 p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300">
        <Info className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="font-semibold text-slate-200">
            Phase 2 Evaluation Boundary: Zero Fabricated Metrics
          </span>
          <p className="text-slate-400 leading-relaxed">
            All metric cards below display planned benchmark targets (<code className="text-amber-300 font-mono">—</code>). 
            No invented F1 scores, synthetic RMSE numbers, or benchmark claims are fabricated. Controlled evaluation will run against labeled benchmark suites in Phase 4.
          </p>
        </div>
      </div>

      {/* Evaluation Metric Categories */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Detection Accuracy */}
        <Card>
          <CardHeader
            title="Detection Metrics"
            subtitle="Precision, Recall & F1-Score"
            icon={CheckCircle2}
            badge={
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Planned
              </span>
            }
          />
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Target F1-Score</span>
              <span className="text-xl font-mono font-bold text-slate-500">—</span>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Precision (P):</span>
                <span className="text-slate-500">TP / (TP + FP)</span>
              </div>
              <div className="flex justify-between">
                <span>Recall (R):</span>
                <span className="text-slate-500">TP / (TP + FN)</span>
              </div>
              <div className="flex justify-between">
                <span>False Positive Rate:</span>
                <span className="text-slate-500">FP / (FP + TN)</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2: Reconstruction Error */}
        <Card>
          <CardHeader
            title="Reconstruction Error"
            subtitle="MAE & RMSE residual metrics"
            icon={Sliders}
            badge={
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Planned
              </span>
            }
          />
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Target RMSE</span>
              <span className="text-xl font-mono font-bold text-slate-500">—</span>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>MAE:</span>
                <span className="text-slate-500">(1/n) Σ |y - ŷ|</span>
              </div>
              <div className="flex justify-between">
                <span>RMSE:</span>
                <span className="text-slate-500">√[(1/n) Σ (y - ŷ)²]</span>
              </div>
              <div className="flex justify-between">
                <span>Signal Coverage:</span>
                <span className="text-slate-500">Repairs / Flags</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3: Confidence Calibration */}
        <Card>
          <CardHeader
            title="Confidence Calibration"
            subtitle="ECE & Legit Abstention"
            icon={TrendingUp}
            badge={
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Planned
              </span>
            }
          />
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Calibration Error (ECE)</span>
              <span className="text-xl font-mono font-bold text-slate-500">—</span>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Reliability Diagram:</span>
                <span className="text-slate-500">Planned Phase 4</span>
              </div>
              <div className="flex justify-between">
                <span>Brier Score:</span>
                <span className="text-slate-500">Planned Phase 4</span>
              </div>
              <div className="flex justify-between">
                <span>Abstention Accuracy:</span>
                <span className="text-slate-500">Planned Phase 4</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4: Audit Completeness & Throughput */}
        <Card>
          <CardHeader
            title="Audit & Throughput"
            subtitle="Ledger coverage & processing speed"
            icon={Zap}
            badge={
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700">
                Planned
              </span>
            }
          />
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-400">Audit Completeness</span>
              <span className="text-xl font-mono font-bold text-slate-500">—</span>
            </div>
            <div className="space-y-1 pt-2 border-t border-slate-800/80 text-[11px] font-mono text-slate-400">
              <div className="flex justify-between">
                <span>Ledger Compliance:</span>
                <span className="text-slate-500">100% Target</span>
              </div>
              <div className="flex justify-between">
                <span>Throughput:</span>
                <span className="text-slate-500">Records / sec</span>
              </div>
              <div className="flex justify-between">
                <span>Lineage Verification:</span>
                <span className="text-slate-500">SHA-256 Valid</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Benchmark Benchmark Suites Architecture */}
      <Card>
        <CardHeader
          title="Planned Benchmark Validation Suites"
          subtitle="Ground-truth industrial datasets targeted for empirical pipeline validation"
          icon={Award}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30">
              Phase 4 Suite
            </span>
          }
        />
        <CardContent className="space-y-4">
          <p className="text-xs text-slate-400 leading-relaxed">
            In Phase 4, KINTSUGI will be evaluated against standardized industrial benchmark datasets containing verified ground-truth sensor failure modes:
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-semibold text-slate-200">1. IMS Bearing Dataset (NASA)</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Run-to-failure vibration acceleration data across high-speed test bearings. Validates spike and outer race fault detection.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-semibold text-slate-200">2. SWaT Industrial Water Treatment</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Multi-channel cyber-physical testbed telemetry (51 sensors and actuators). Validates multivariate imputation and packet loss healing.
              </p>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 space-y-1.5">
              <div className="font-semibold text-slate-200">3. Controlled Synthetic Benchmark</div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Controlled signal masking (1% to 25% dropped frames) with known ground truth to compute empirical MAE and RMSE curves.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Historical Evaluation Runs — Honest Empty State */}
      <Card>
        <CardHeader
          title="Evaluation Execution History"
          subtitle="Chronological log of benchmark evaluation runs"
          icon={BarChart2}
          badge={
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              0 Executions
            </span>
          }
        />
        <CardContent>
          <EmptyState
            icon={Award}
            title="No Benchmark Evaluations Executed"
            description="Benchmark evaluation execution will be enabled in Phase 4. Rigorous evaluation reports will be produced after validating models against ground-truth datasets."
            plannedPhase="Phase 4"
            plannedEndpoints={[
              'GET /api/evaluation/benchmarks',
              'POST /api/evaluation/run',
              'GET /api/evaluation/results/{id}',
            ]}
          />
        </CardContent>
      </Card>
    </div>
  );
};
