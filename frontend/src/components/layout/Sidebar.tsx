import React, { useEffect } from 'react';
import {
  LayoutDashboard,
  Database,
  Sliders,
  ShieldAlert,
  Wrench,
  History,
  CheckCircle2,
  Settings,
  Cpu,
  Layers,
  ChevronRight,
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
  phase: string;
  badge?: string;
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
      phase: 'Phase 1',
      badge: 'Active',
      description: 'System health & pipeline roadmap',
    },
    {
      path: '/datasets',
      label: 'Dataset Management',
      icon: Database,
      phase: 'Phase 3',
      badge: 'Active',
      description: 'Upload, schemas & data quality',
    },
    {
      path: '/pipeline',
      label: 'Pipeline Configuration',
      icon: Sliders,
      phase: 'Phase 3',
      description: 'Sensor mappings & detection rules',
    },
    {
      path: '/anomalies',
      label: 'Anomaly Explorer',
      icon: ShieldAlert,
      phase: 'Phase 3',
      description: 'Outlier detection & signals',
    },
    {
      path: '/reconstruction',
      label: 'Reconstruction Studio',
      icon: Wrench,
      phase: 'Phase 3',
      description: 'Self-healing signal repair & confidence',
    },
    {
      path: '/audit',
      label: 'Audit Trail',
      icon: History,
      phase: 'Phase 4',
      description: 'Immutable ledger of repair decisions',
    },
    {
      path: '/evaluation',
      label: 'Evaluation Center',
      icon: CheckCircle2,
      phase: 'Phase 4',
      description: 'Precision, MAE, RMSE & benchmarks',
    },
    {
      path: '/settings',
      label: 'Settings & System Info',
      icon: Settings,
      phase: 'Phase 2',
      badge: 'Active',
      description: 'Environment & API configurations',
    },
  ];

  return (
    <>
      {/* Mobile backdrop overlay with smooth fade */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-xs md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar container */}
      <aside
        id="kintsugi-sidebar"
        role="navigation"
        aria-label="Main Navigation"
        className={`fixed md:static inset-y-0 left-0 z-40 w-64 lg:w-72 shrink-0 flex flex-col border-r border-slate-800/80 bg-slate-950 transition-transform duration-200 ease-in-out md:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Navigation Category Label */}
        <div className="p-4 border-b border-slate-800/60 bg-slate-950/40">
          <div className="flex items-center gap-2 text-xs font-mono font-semibold uppercase tracking-wider text-slate-300">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Pipeline Modules</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5 font-mono">
            Phase 2 • Shell & Skeleton
          </p>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
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
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-all duration-150 group cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 ${
                  isSelected
                    ? 'bg-amber-500/15 text-amber-300 font-medium border border-amber-500/35 shadow-xs shadow-amber-500/10'
                    : 'text-slate-300 hover:text-white hover:bg-slate-900/80 border border-transparent'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 transition-colors ${
                      isSelected
                        ? 'text-amber-400'
                        : 'text-slate-400 group-hover:text-amber-300'
                    }`}
                  />
                  <div className="truncate">
                    <span className="text-xs font-medium block truncate">
                      {item.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0 ml-2">
                  {item.badge ? (
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      {item.badge}
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 rounded bg-slate-900 text-slate-500 border border-slate-800">
                      {item.phase}
                    </span>
                  )}
                  {isSelected && (
                    <ChevronRight className="w-3 h-3 text-amber-400 shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Bottom System Environment info card */}
        <div className="p-3 border-t border-slate-800/60 bg-slate-950/60 m-2 rounded-lg border border-slate-800/80">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              Stack Architecture
            </span>
            <span className="text-amber-400/90 font-medium">FastAPI + Vite</span>
          </div>

          <div className="space-y-1 text-[10px] font-mono text-slate-500">
            <div className="flex justify-between">
              <span>Frontend:</span>
              <span className="text-slate-300">React 19 + TypeScript</span>
            </div>
            <div className="flex justify-between">
              <span>Backend:</span>
              <span className="text-slate-300">Python 3.14 + FastAPI</span>
            </div>
            <div className="flex justify-between">
              <span>Shell Status:</span>
              <span className="text-amber-300">Phase 2 Complete</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
};
