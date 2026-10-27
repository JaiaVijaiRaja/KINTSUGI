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
    <div className="h-screen overflow-hidden bg-[#F6F5F2] text-stone-900 flex flex-col font-sans selection:bg-[#EE602C]/20 selection:text-[#EE602C]">
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
          className="flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6"
        >
          <div className="max-w-[1440px] mx-auto space-y-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};
