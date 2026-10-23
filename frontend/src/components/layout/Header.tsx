import React, { useEffect, useState } from 'react';
import type { ConnectionStatus } from '../../types/api';
import { ConnectionBadge } from '../common/ConnectionBadge';
import { Menu, X, Shield, Clock } from 'lucide-react';
import { useRouter } from '../../router';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  latencyMs: number | null;
  onRefreshHealth: () => void;
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connectionStatus,
  latencyMs,
  onRefreshHealth,
  sidebarOpen,
  onToggleSidebar,
}) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const { navigate } = useRouter();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="flex h-16 items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Mobile Menu Button & Brand */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="inline-flex md:hidden items-center justify-center p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/50 transition-colors focus:outline-hidden focus:ring-2 focus:ring-amber-400/50"
            aria-label="Toggle navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="kintsugi-sidebar"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <button
            type="button"
            onClick={() => navigate('/overview')}
            className="flex items-center gap-3 text-left cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 rounded-lg p-1 -m-1"
            title="KINTSUGI — Home"
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500/20 via-amber-600/30 to-amber-700/10 border border-amber-500/40 shadow-xs shadow-amber-500/10">
              <Shield className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold tracking-wider text-base text-slate-100 uppercase font-mono">
                  KINTSUGI
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                  Phase 2 Shell
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block tracking-wide">
                Confidence-Aware Self-Healing Industrial Data Pipeline
              </p>
            </div>
          </button>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-3 sm:gap-5">
          {/* UTC Clock */}
          <div
            className="hidden lg:flex items-center gap-1.5 text-xs font-mono text-slate-400 bg-slate-900/60 px-2.5 py-1 rounded-md border border-slate-800"
            title="System Synchronized UTC Clock"
          >
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>{currentTime || 'Syncing...'}</span>
          </div>

          {/* Backend Connection Health Badge with Latency and Refresh */}
          <ConnectionBadge
            status={connectionStatus}
            latencyMs={latencyMs}
            onRefresh={onRefreshHealth}
          />
        </div>
      </div>
    </header>
  );
};
