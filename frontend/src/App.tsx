import React, { useState, useEffect, useCallback } from 'react';
import { RouterProvider, useRouter } from './router';
import { Layout } from './components/layout/Layout';
import {
  OverviewPage,
  DatasetsPage,
  PipelinePage,
  AnomaliesPage,
  ReconstructionPage,
  AuditPage,
  EvaluationPage,
  SettingsPage,
} from './pages';
import { NotFoundPage } from './components/common/NotFoundPage';
import type { ConnectionState } from './types/api';
import { apiService } from './services/api';

const AppContent: React.FC = () => {
  const { currentPath, isNotFound } = useRouter();

  const [connection, setConnection] = useState<ConnectionState>({
    status: 'loading',
    data: null,
    error: null,
    latencyMs: null,
    lastChecked: null,
  });

  const checkBackendHealth = useCallback(async (isInitial: boolean = false) => {
    if (!isInitial) {
      setConnection((prev) => ({
        ...prev,
        status: 'loading',
        error: null,
      }));
    }

    try {
      const { data, latencyMs } = await apiService.checkHealth(4000);
      setConnection({
        status: 'connected',
        data,
        error: null,
        latencyMs,
        lastChecked: new Date(),
      });
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : 'Unknown connection error';
      setConnection({
        status: 'disconnected',
        data: null,
        error: errorMsg,
        latencyMs: null,
        lastChecked: new Date(),
      });
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    apiService
      .checkHealth(4000)
      .then(({ data, latencyMs }) => {
        if (!ignore) {
          setConnection({
            status: 'connected',
            data,
            error: null,
            latencyMs,
            lastChecked: new Date(),
          });
        }
      })
      .catch((err: unknown) => {
        if (!ignore) {
          const errorMsg =
            err instanceof Error ? err.message : 'Unknown connection error';
          setConnection({
            status: 'disconnected',
            data: null,
            error: errorMsg,
            latencyMs: null,
            lastChecked: new Date(),
          });
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleManualRefresh = useCallback(() => {
    checkBackendHealth(false);
  }, [checkBackendHealth]);

  const renderActivePage = () => {
    if (isNotFound) {
      return <NotFoundPage />;
    }

    switch (currentPath) {
      case '/overview':
        return (
          <OverviewPage
            connection={connection}
            onRetry={handleManualRefresh}
          />
        );
      case '/datasets':
        return <DatasetsPage />;
      case '/pipeline':
        return <PipelinePage />;
      case '/anomalies':
        return <AnomaliesPage />;
      case '/reconstruction':
        return <ReconstructionPage />;
      case '/audit':
        return <AuditPage />;
      case '/evaluation':
        return <EvaluationPage />;
      case '/settings':
        return (
          <SettingsPage
            connection={connection}
            onRefreshHealth={handleManualRefresh}
          />
        );
      default:
        return <NotFoundPage />;
    }
  };

  return (
    <Layout
      connectionStatus={connection.status}
      latencyMs={connection.latencyMs}
      onRefreshHealth={handleManualRefresh}
    >
      {renderActivePage()}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <RouterProvider>
      <AppContent />
    </RouterProvider>
  );
};

export default App;
