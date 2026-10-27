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
  Search,
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
    { path: '/overview', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/datasets', label: 'Datasets', icon: Database },
    { path: '/anomalies', label: 'Anomalies', icon: Activity },
    { path: '/pipeline', label: 'Pipeline', icon: Sliders },
    { path: '/reconstruction', label: 'Reconstruction', icon: Wrench },
    { path: '/evaluation', label: 'Evaluation', icon: CheckCircle2 },
    { path: '/audit', label: 'Audit Trail', icon: ShieldCheck },
    { path: '/diagnostics', label: 'Diagnostic Report', icon: FileText },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <header className="shrink-0 z-30 w-full bg-[#F6F5F2] border-b border-[#EBE7E1] px-3 sm:px-6 py-2.5 space-y-2.5">
      {/* ========================================================================= */}
      {/* ROW 1: BRAND IDENTITY + TOP HORIZONTAL NAV PILLS + CONNECTION STATUS */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {/* Brand identity badge */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/overview')}
            className="flex items-center gap-3 text-left cursor-pointer group focus:outline-hidden"
            title="KINTSUGI — Telemetry & Fault Dashboard"
          >
            {/* Stylish modern Kintsugi gold-fused geometric emblem */}
            <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-stone-900 via-stone-950 to-amber-950/80 border border-amber-400/40 shadow-xs shadow-amber-500/20 flex items-center justify-center shrink-0 group-hover:border-amber-400/80 group-hover:shadow-amber-500/30 transition-all duration-200">
              <svg viewBox="0 0 32 32" className="w-5 h-5 sm:w-5.5 sm:h-5.5" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <linearGradient id="kintsugiGoldShine" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE68A" />
                    <stop offset="35%" stopColor="#F59E0B" />
                    <stop offset="70%" stopColor="#D97706" />
                    <stop offset="100%" stopColor="#92400E" />
                  </linearGradient>
                  <linearGradient id="kintsugiGoldGleam" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#F59E0B" />
                    <stop offset="50%" stopColor="#FEF3C7" />
                    <stop offset="100%" stopColor="#D97706" />
                  </linearGradient>
                  <filter id="kintsugiGlow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="0.8" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>
                {/* Outer faceted shield in deep charcoal/stone */}
                <path
                  d="M16 3L27 9.5V22.5L16 29L5 22.5V9.5L16 3Z"
                  fill="#1C1917"
                  stroke="url(#kintsugiGoldShine)"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
                {/* Faceted ceramic shards */}
                <path d="M16 3L13 14L5 9.5" stroke="#44403C" strokeWidth="0.8" strokeLinecap="round" />
                <path d="M27 9.5L18 16L27 22.5" stroke="#44403C" strokeWidth="0.8" strokeLinecap="round" />
                <path d="M5 22.5L14 19L16 29" stroke="#44403C" strokeWidth="0.8" strokeLinecap="round" />
                {/* Dynamic Kintsugi golden repair seam forming a stylized K */}
                <path
                  d="M11 7L13 14L11 25"
                  stroke="url(#kintsugiGoldGleam)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#kintsugiGlow)"
                />
                <path
                  d="M23 8L13 14L21 24"
                  stroke="url(#kintsugiGoldGleam)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  filter="url(#kintsugiGlow)"
                />
                {/* Central golden nexus node */}
                <circle cx="13" cy="14" r="2.2" fill="#FEF3C7" stroke="#D97706" strokeWidth="0.8" />
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold italic text-stone-900 text-base sm:text-lg tracking-tight font-sans">
                  Kintsugi
                </span>
              </div>
              <p className="text-[10px] text-stone-500 font-medium tracking-normal hidden sm:block">
                Telemetry & Fault Dashboard
              </p>
            </div>
          </button>
        </div>

        {/* Horizontal Navigation Pills (Dashboard, Datasets, Anomalies, Pipeline, ...) */}
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
      {/* ROW 2: SUB-BAR (Search, Date/UTC, Sensor Faults CTA, Badges) */}
      {/* ========================================================================= */}
      <div className="flex items-center justify-between gap-3 pt-1 border-t border-[#EBE7E1]/60 flex-wrap">
        {/* Left tools: Clean Quick Search */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sensor, fault, hash..."
              className="w-56 sm:w-64 lg:w-72 bg-white border border-[#E0DCD3] rounded-full pl-8 pr-3 py-1 text-xs text-stone-700 placeholder:text-stone-400 focus:outline-hidden focus:border-[#EE602C] focus:ring-1 focus:ring-[#EE602C]/30 shadow-2xs transition-all"
            />
          </div>
        </div>

        {/* Right tools: Date UTC, Show Sensor Faults, Badges */}
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
