import React from 'react';
import type { ProcessingStatus } from '../../types/reconstruction';

interface StatusBadgeProps {
  status: ProcessingStatus | 'PLANNED' | 'ACTIVE' | 'EXPERIMENTAL';
  size?: 'sm' | 'md';
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  className = '',
}) => {
  const sizeClasses = size === 'sm' ? 'text-[9px] px-1.5 py-0.2' : 'text-[10px] px-2 py-0.5';

  const getBadgeConfig = () => {
    switch (status) {
      case 'MEASURED':
        return {
          label: 'MEASURED',
          classes: 'bg-cyan-950/60 text-cyan-300 border-cyan-500/40',
          dot: 'bg-cyan-400',
          title: 'Original unmodified sensor telemetry reading preserved for auditing',
        };
      case 'ESTIMATED':
        return {
          label: 'ESTIMATED',
          classes: 'bg-amber-950/60 text-amber-300 border-amber-500/40',
          dot: 'bg-amber-400',
          title: 'Contextual reconstruction proposal generated via model imputation',
        };
      case 'CORRECTED':
        return {
          label: 'CORRECTED',
          classes: 'bg-emerald-950/60 text-emerald-300 border-emerald-500/40',
          dot: 'bg-emerald-400',
          title: 'High-confidence validated signal repair approved for output streams',
        };
      case 'UNRESOLVED':
        return {
          label: 'UNRESOLVED',
          classes: 'bg-rose-950/60 text-rose-300 border-rose-500/40',
          dot: 'bg-rose-500',
          title: 'Confidence below threshold; system strictly abstained from guessing',
        };
      case 'ACTIVE':
        return {
          label: 'ACTIVE',
          classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
          dot: 'bg-emerald-400',
          title: 'Module is active and operational in current phase',
        };
      case 'PLANNED':
      default:
        return {
          label: 'PLANNED',
          classes: 'bg-slate-800 text-slate-400 border-slate-700',
          dot: 'bg-slate-500',
          title: 'Functionality designed and planned for upcoming phase',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase font-semibold rounded border ${sizeClasses} ${config.classes} ${className}`}
      title={config.title}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
};
