import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Database,
  Sliders,
  ShieldAlert,
  Wrench,
  CheckCircle2,
  History,
  FileText,
  Settings,
  Sparkles,
  Lock,
  Share2,
} from 'lucide-react';
import { useRouter, type AppRoute } from '../../router';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

interface NavItem {
  path: AppRoute;
  label: string;
  icon: React.ElementType;
  description: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose }) => {
  const { currentPath, navigate } = useRouter();

  // Close sidebar on Escape key press (accessibility)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navItems: NavItem[] = [
    {
      path: '/overview',
      label: 'Overview',
      icon: LayoutDashboard,
      description: 'System health, fault telemetry & KPI summary',
    },
    {
      path: '/datasets',
      label: 'Dataset Management',
      icon: Database,
      description: 'Ingest industrial CSVs & schema validation',
    },
    {
      path: '/pipeline',
      label: 'Pipeline Configuration',
      icon: Sliders,
      description: 'Multi-sensor detection & repair settings',
    },
    {
      path: '/anomalies',
      label: 'Anomaly Explorer',
      icon: ShieldAlert,
      description: 'Statistical MAD & Isolation Forest detections',
    },
    {
      path: '/reconstruction',
      label: 'Reconstruction Studio',
      icon: Wrench,
      description: 'Confidence-aware signal repair & abstention',
    },
    {
      path: '/evaluation',
      label: 'Evaluation Center',
      icon: CheckCircle2,
      description: 'Controlled benchmarks & ground truth validation',
    },
    {
      path: '/audit',
      label: 'Audit Trail',
      icon: History,
      description: 'Immutable SHA-256 ledger & provenance verification',
    },
    {
      path: '/diagnostics',
      label: 'Diagnostic Report',
      icon: FileText,
      description: 'Comprehensive system diagnostic health summary',
    },
    {
      path: '/settings',
      label: 'Settings & System Info',
      icon: Settings,
      description: 'Backend environment & API connectivity',
    },
    {
      path: '/demos',
      label: 'Live Demonstrations',
      icon: Sparkles,
      description: 'Interactive demo workflows and benchmark sandbox',
    },
  ];

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-stone-900/50 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Vertical Icon Dock matching reference screenshot */}
      <aside
        id="kintsugi-sidebar"
        role="navigation"
        aria-label="Main Navigation"
        className={`fixed md:static inset-y-0 left-0 z-40 my-auto py-3 pl-3 pr-1 shrink-0 flex flex-col items-center justify-between transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <div className="w-14 sm:w-16 bg-white rounded-3xl border border-[#EBE7E1] shadow-[0_4px_20px_rgba(0,0,0,0.04)] py-4 px-2 flex flex-col items-center gap-3">
          {/* Top orange pill with vertical rotated text 'PIPELINE' */}
          <div
            className="w-7 h-20 rounded-full bg-gradient-to-b from-[#EE602C] to-[#E3541E] flex items-center justify-center shadow-xs shadow-[#EE602C]/30 select-none group relative cursor-default"
            title="KINTSUGI Self-Healing Pipeline Dock"
          >
            <span
              className="text-[9px] font-mono tracking-widest text-white font-bold uppercase"
              style={{
                writingMode: 'vertical-rl',
                textOrientation: 'mixed',
                transform: 'rotate(180deg)',
              }}
            >
              PIPELINE
            </span>
          </div>

          <div className="w-6 h-px bg-stone-200 my-1" />

          {/* Navigation Icon Buttons Stack */}
          <nav className="flex flex-col items-center gap-2 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isSelected = currentPath === item.path;

              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => {
                    navigate(item.path);
                    onClose();
                  }}
                  aria-current={isSelected ? 'page' : undefined}
                  title={`${item.label} — ${item.description}`}
                  className={`relative w-10 h-10 rounded-2xl flex items-center justify-center transition-all duration-150 group cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-[#EE602C]/40 ${
                    isSelected
                      ? 'bg-[#EE602C] text-white shadow-xs shadow-[#EE602C]/35 scale-105'
                      : 'text-stone-500 hover:text-stone-900 hover:bg-stone-100/80'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 transition-transform group-hover:scale-110 ${
                      isSelected ? 'text-white' : 'text-stone-600'
                    }`}
                  />

                  {/* Accessible label for Playwright assertions and screen readers */}
                  <span className="sr-only">{item.label}</span>

                  {/* Hover tooltip for desktop */}
                  <div className="absolute left-full ml-3 px-2.5 py-1 bg-stone-900 text-white text-[11px] font-medium rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-50">
                    <span className="font-semibold block">{item.label}</span>
                    <span className="text-[10px] text-stone-300 font-normal">
                      {item.description}
                    </span>
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="w-6 h-px bg-stone-200 my-1" />

          {/* Bottom Dock Icons: Lock & Share/Network */}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/audit')}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-500/80 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
              title="Immutable SHA-256 Ledger Lock"
            >
              <Lock className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/pipeline')}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-stone-400 hover:text-stone-700 hover:bg-stone-100 transition-colors cursor-pointer"
              title="Pipeline Topology & Sensor Network"
            >
              <Share2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
