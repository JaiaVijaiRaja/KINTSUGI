import React from 'react';
import { Database, Clock } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ElementType;
  title: string;
  description: string;
  milestone?: string;
  plannedEndpoints?: string[];
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Database,
  title,
  description,
  milestone,
  plannedEndpoints,
  action,
  className = '',
}) => {
  return (
    <div
      className={`rounded-2xl border border-dashed border-stone-300 bg-stone-50/80 p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-2xl mx-auto space-y-4 shadow-2xs ${className}`}
    >
      <div className="p-3.5 rounded-2xl bg-white border border-stone-200 text-[#EE602C] shadow-2xs">
        <Icon className="w-8 h-8 text-[#EE602C]" />
      </div>

      <div className="space-y-1.5 max-w-md">
        <h3 className="text-base sm:text-lg font-semibold text-stone-900">
          {title}
        </h3>
        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
          {description}
        </p>
      </div>

      {milestone && (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-800">
          <Clock className="w-3.5 h-3.5 text-amber-600" />
          <span>Release: {milestone}</span>
        </div>
      )}

      {plannedEndpoints && plannedEndpoints.length > 0 && (
        <div className="w-full max-w-md pt-3 border-t border-stone-200 text-left">
          <span className="text-[10px] uppercase font-mono tracking-wider text-stone-500 block mb-1.5 font-semibold">
            Planned Backend Endpoints
          </span>
          <div className="space-y-1">
            {plannedEndpoints.map((ep, idx) => (
              <div
                key={idx}
                className="text-[11px] font-mono text-stone-800 bg-white px-2.5 py-1 rounded-lg border border-stone-200"
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
