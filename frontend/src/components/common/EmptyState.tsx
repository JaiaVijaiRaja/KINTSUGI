import React from 'react';
import { Database, Clock } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  plannedPhase?: string;
  plannedEndpoints?: string[];
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Database,
  title,
  description,
  plannedPhase,
  plannedEndpoints,
  action,
  className = '',
}) => {
  return (
    <div
      className={`rounded-xl border border-slate-800/80 bg-slate-900/30 p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto space-y-4 ${className}`}
    >
      <div className="p-3.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-400">
        <Icon className="w-8 h-8 text-slate-400" />
      </div>

      <div className="space-y-2 max-w-md">
        <h3 className="text-base sm:text-lg font-semibold text-slate-200">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
          {description}
        </p>
      </div>

      {plannedPhase && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-[11px] font-mono text-amber-300">
          <Clock className="w-3.5 h-3.5 text-amber-400" />
          <span>Scheduled for {plannedPhase}</span>
        </div>
      )}

      {plannedEndpoints && plannedEndpoints.length > 0 && (
        <div className="w-full max-w-md pt-3 border-t border-slate-800/70 text-left">
          <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500 block mb-1.5">
            Planned Backend Endpoints
          </span>
          <div className="space-y-1">
            {plannedEndpoints.map((ep, idx) => (
              <div
                key={idx}
                className="text-[11px] font-mono text-slate-300 bg-slate-950/70 px-2.5 py-1 rounded border border-slate-800/90"
              >
                {ep}
              </div>
            ))}
          </div>
        </div>
      )}

      {action && <div className="pt-2">{action}</div>}
    </div>
  );
};
