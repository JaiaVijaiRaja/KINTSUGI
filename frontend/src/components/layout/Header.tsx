import React, { useEffect, useState } from 'react';
import type { ConnectionStatus } from '../../types/api';
import { ConnectionBadge } from '../common/ConnectionBadge';
import {
  LayoutDashboard,
  Database,
  Sliders,
  Activity,
  Wrench,
  CheckCircle2,
  ShieldCheck,
  FileText,
  Settings,
  Plus,
  Search,
  Moon,
  ArrowRight,
  Shield,
  Cpu,
} from 'lucide-react';
import { useRouter, type AppRoute } from '../../router';

interface HeaderProps {
  connectionStatus: ConnectionStatus;
  latencyMs: number | null;
  onRefreshHealth: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
}

interface NavTab {
  path: AppRoute;
  label: string;
  icon: React.ElementType;
}

export const Header: React.FC<HeaderProps> = ({
  connectionStatus,
  latencyMs,
  onRefreshHealth,
}) => {
  const [currentUtc, setCurrentUtc] = useState<string>('');
  const [dayOfMonth, setDayOfMonth] = useState<number>(27);
  const [monthName, setMonthName] = useState<string>('October');
  const [dayName, setDayName] = useState<string>('Tue');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { currentPath, navigate } = useRouter();

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setDayOfMonth(now.getUTCDate());
      setDayName(now.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }));
      setMonthName(now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }));
      const timeStr = now.toISOString().substring(11, 19);
      setCurrentUtc(`${timeStr} UTC`);
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  const navTabs: NavTab[] = [
    { path: '/overview', label: 'Overview', icon: LayoutDashboard },
    { path: '/datasets', label: 'Datasets', icon: Database },
    { path: '/pipeline', label: 'Pipeline', icon: Sliders },
    { path: '/anomalies', label: 'Anomalies', icon: Activity },
    { path: '/reconstruction', label: 'Reconstruction', icon: Wrench },
    { path: '/evaluation', label: 'Evaluation', icon: CheckCircle2 },
    { path: '/audit', label: 'Audit Trail', icon: ShieldCheck },
    { path: '/diagnostics', label: 'Diagnostic Report', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="sticky top-0 z-30 w-full bg-[#F6F5F2] border-b border-[#EBE7E1] px-3 sm:px-6 py-2.5 space-y-2.5">
      {/* ========================================================================= */}
      {/* ROW 1: BRAND IDENTITY + TOP HORIZONTAL NAV PILLS + CONNECTION STATUS */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Brand identity badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/overview')}
            className="flex items-center gap-2.5 text-left cursor-pointer group focus:outline-hidden"
            title="KINTSUGI — Telemetry & Fault Dashboard"
          >
            {/* Black circle with golden kanji 金 */}
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-stone-900 border border-amber-400/50 shadow-xs flex items-center justify-center shrink-0">
              <span className="text-amber-300 font-serif font-bold text-xs sm:text-sm select-none">
                金
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-stone-900 text-sm tracking-tight font-sans">
                  Kintsugi
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-300/60">
                  Phase 10 • Verified
                </span>
              </div>
              <p className="text-[10px] text-stone-500 font-medium tracking-normal hidden sm:block">
                Telemetry & Fault Dashboard
              </p>
            </div>
          </button>
        </div>

        {/* Horizontal Navigation Pills */}
        <nav
          className="hidden md:flex items-center gap-1 bg-[#EFECE6]/80 p-1 rounded-full border border-[#E5E0D6] overflow-x-auto"
          aria-label="Primary Header Navigation"
        >
          {navTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentPath === tab.path;
            return (
              <button
                key={tab.path}
                type="button"
                onClick={() => navigate(tab.path)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer ${
                  isActive
                    ? 'bg-[#EE602C] text-white shadow-xs shadow-[#EE602C]/30 font-semibold'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-white/60'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-white' : 'text-stone-500'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Backend health status pill */}
        <div className="flex items-center gap-2 shrink-0">
          <ConnectionBadge
            status={connectionStatus}
            latencyMs={latencyMs}
            onRefresh={onRefreshHealth}
          />
        </div>
      </div>

      {/* ========================================================================= */}
      {/* ROW 2: SUB-BAR (Operator, Quick Upload, Search, Date/UTC, Diagnostics) */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#EBE7E1]/60 flex-wrap">
        {/* Left tools: Quick Add, Operator Badge, Search, Theme toggle */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => navigate('/datasets')}
            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border border-[#E0DCD3] hover:border-stone-400 text-stone-700 hover:text-stone-900 shadow-2xs flex items-center justify-center transition-colors cursor-pointer"
            title="Upload New Industrial Telemetry CSV"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Operator badge */}
          <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-full border border-[#E0DCD3] shadow-2xs">
            <div className="w-5 h-5 rounded-full bg-amber-500 text-white font-bold text-[9px] flex items-center justify-center">
              DT
            </div>
            <div className="text-[11px] leading-tight">
              <span className="font-semibold text-stone-800">Dwayne Tatum</span>
              <span className="text-stone-500 font-mono text-[9px] ml-1.5 hidden md:inline">
                operator_local • Lead
              </span>
            </div>
          </div>

          {/* Quick Search */}
          <div className="relative hidden md:block">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sensor, fault, hash..."
              className="w-48 lg:w-60 bg-white border border-[#E0DCD3] rounded-full pl-8 pr-3 py-1 text-xs text-stone-700 placeholder:text-stone-400 focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/30 shadow-2xs transition-all"
            />
          </div>

          {/* Theme Icon indicator */}
          <button
            type="button"
            className="w-7 h-7 rounded-full bg-white border border-[#E0DCD3] text-stone-500 hover:text-stone-800 shadow-2xs flex items-center justify-center transition-colors"
            title="Industrial Light Mode (Current Active Theme)"
          >
            <Moon className="w-3 h-3" />
          </button>
        </div>

        {/* Right tools: Date UTC, Show Sensor Faults, Hero Message */}
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
          {/* Date & UTC synchronized pill */}
          <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-full border border-[#E0DCD3] shadow-2xs">
            <span className="text-base sm:text-lg font-bold text-stone-900 leading-none font-mono">
              {dayOfMonth}
            </span>
            <div className="text-[10px] leading-tight font-mono text-stone-600">
              <span className="font-semibold">{dayName},</span>{' '}
              <span>
                {monthName} • {currentUtc || 'Syncing...'}
              </span>
            </div>
          </div>

          {/* Show Sensor Faults CTA */}
          <button
            type="button"
            onClick={() => navigate('/anomalies')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#EE602C] hover:bg-[#D95322] text-white text-xs font-semibold shadow-xs shadow-[#EE602C]/25 transition-all cursor-pointer active:scale-95"
          >
            <span>Show Sensor Faults</span>
            <ArrowRight className="w-3 h-3" />
          </button>

          {/* Quick status badge */}
          <div className="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-700 flex items-center justify-center shadow-2xs shrink-0" title="System Ledger Verified">
            <Shield className="w-3 h-3" />
          </div>

          {/* CPU / Microchip badge */}
          <div className="w-6 h-6 rounded-full bg-white border border-[#E0DCD3] text-stone-500 flex items-center justify-center shadow-2xs shrink-0" title="Edge Compute Engine Operational">
            <Cpu className="w-3 h-3" />
          </div>
        </div>
      </div>
    </header>
  );
};
