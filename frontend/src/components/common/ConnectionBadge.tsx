import React from 'react';
import type { ConnectionStatus } from '../../types/api';
import { CheckCircle2, RefreshCw, XCircle } from 'lucide-react';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  latencyMs?: number | null;
  className?: string;
  onRefresh?: () => void;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  latencyMs,
  className = '',
  onRefresh,
}) => {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          bg: 'bg-emerald-50 border-emerald-200 text-emerald-800 shadow-2xs',
          dot: 'bg-emerald-500 ring-emerald-500/20',
          label: 'Connected',
          icon: CheckCircle2,
        };
      case 'loading':
        return {
          bg: 'bg-amber-50 border-amber-200 text-amber-800 shadow-2xs',
          dot: 'bg-amber-500 ring-amber-500/20 animate-pulse',
          label: 'Connecting...',
          icon: RefreshCw,
        };
      case 'error':
      case 'disconnected':
      default:
        return {
          bg: 'bg-rose-50 border-rose-200 text-rose-800 shadow-2xs',
          dot: 'bg-rose-500 ring-rose-500/20',
          label: 'Disconnected',
          icon: XCircle,
        };
    }
  };

  const config = getStatusConfig();
  const IconComponent = config.icon;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium backdrop-blur-sm transition-all duration-200 ${config.bg} ${className}`}
      title={`Backend API Status: ${config.label}${latencyMs ? ` (${latencyMs}ms)` : ''}`}
    >
      <span className="relative flex h-2 w-2">
        {status === 'connected' && (
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${config.dot}`} />
      </span>

      <IconComponent
        className={`w-3.5 h-3.5 ${status === 'loading' ? 'animate-spin' : ''}`}
      />

      <span className="tracking-wide uppercase font-semibold text-[11px]">
        {config.label}
      </span>

      {status === 'connected' && latencyMs !== null && latencyMs !== undefined && (
        <span className="font-mono text-[10px] text-emerald-700 pl-1 border-l border-emerald-300">
          {latencyMs}ms
        </span>
      )}

      {onRefresh && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="ml-1 text-stone-400 hover:text-stone-700 transition-colors cursor-pointer"
          title="Retry Health Check"
          disabled={status === 'loading'}
        >
          <RefreshCw className={`w-3 h-3 ${status === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  );
};
