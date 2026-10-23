import React, { useState } from 'react';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import type { ConnectionStatus } from '../../types/api';

interface LayoutProps {
  children: React.ReactNode;
  connectionStatus: ConnectionStatus;
  latencyMs: number | null;
  onRefreshHealth: () => void;
}

export const Layout: React.FC<LayoutProps> = ({
  children,
  connectionStatus,
  latencyMs,
  onRefreshHealth,
}) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      <Header
        connectionStatus={connectionStatus}
        latencyMs={latencyMs}
        onRefreshHealth={onRefreshHealth}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main
          id="main-content"
          role="main"
          className="flex-1 overflow-y-auto bg-gradient-to-b from-slate-950 via-[#070b14] to-slate-950 p-4 sm:p-6 lg:p-8"
        >
          <div className="max-w-7xl mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
