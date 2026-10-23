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
          bg: 'bg-emerald-950/60 border-emerald-500/30 text-emerald-400',
          dot: 'bg-emerald-400 ring-emerald-400/30',
          label: 'Connected',
          icon: CheckCircle2,
        };
      case 'loading':
        return {
          bg: 'bg-amber-950/60 border-amber-500/30 text-amber-400',
          dot: 'bg-amber-400 ring-amber-400/30 animate-pulse',
          label: 'Connecting...',
          icon: RefreshCw,
        };
      case 'error':
      case 'disconnected':
      default:
        return {
          bg: 'bg-rose-950/60 border-rose-500/30 text-rose-400',
          dot: 'bg-rose-500 ring-rose-500/30',
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
        <span className="font-mono text-[10px] text-emerald-300/80 pl-1 border-l border-emerald-500/20">
          {latencyMs}ms
        </span>
      )}

      {onRefresh && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRefresh();
          }}
          className="ml-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Retry Health Check"
          disabled={status === 'loading'}
        >
          <RefreshCw className={`w-3 h-3 ${status === 'loading' ? 'animate-spin' : ''}`} />
        </button>
      )}
    </div>
  );
};
