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
      label: 'Dashboard',
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
      path: '/anomalies',
      label: 'Anomaly Explorer',
      icon: ShieldAlert,
      description: 'Statistical MAD & Isolation Forest detections',
    },
    {
      path: '/pipeline',
      label: 'Pipeline Configuration',
      icon: Sliders,
      description: 'Multi-sensor detection & repair settings',
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
    <aside
      id="kintsugi-sidebar"
      role="navigation"
      aria-label="Main Navigation"
      className="sr-only"
    >
      <nav aria-label="Accessible Secondary Navigation">
        {navItems.map((item) => {
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
            >
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
};
