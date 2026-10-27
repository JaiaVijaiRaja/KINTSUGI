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
  const sizeClasses = size === 'sm' ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5';

  const getBadgeConfig = () => {
    switch (status) {
      case 'MEASURED':
        return {
          label: 'MEASURED',
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          dot: 'bg-emerald-500',
          title: 'Original unmodified sensor telemetry reading preserved for auditing',
        };
      case 'ESTIMATED':
        return {
          label: 'ESTIMATED',
          classes: 'bg-amber-50 text-amber-800 border-amber-200/80',
          dot: 'bg-amber-500',
          title: 'Contextual reconstruction proposal generated via model imputation',
        };
      case 'CORRECTED':
        return {
          label: 'CORRECTED',
          classes: 'bg-sky-50 text-sky-800 border-sky-200/80',
          dot: 'bg-sky-500',
          title: 'High-confidence validated signal repair approved for output streams',
        };
      case 'UNRESOLVED':
        return {
          label: 'UNRESOLVED',
          classes: 'bg-rose-50 text-rose-800 border-rose-200/80',
          dot: 'bg-rose-500',
          title: 'Confidence below threshold; system strictly abstained from guessing',
        };
      case 'ACTIVE':
        return {
          label: 'ACTIVE',
          classes: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
          dot: 'bg-emerald-500',
          title: 'Module is active and operational',
        };
      case 'PLANNED':
      default:
        return {
          label: 'PLANNED',
          classes: 'bg-stone-100 text-stone-600 border-stone-200',
          dot: 'bg-stone-400',
          title: 'Functionality designed and planned for upcoming release',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-mono uppercase font-semibold rounded-md border ${sizeClasses} ${config.classes} ${className}`}
      title={config.title}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} />
      <span>{config.label}</span>
    </span>
  );
};

