import React from 'react';
import { Compass, ArrowLeft } from 'lucide-react';
import { useRouter } from '../../router';
import { Button } from './Button';

export const NotFoundPage: React.FC = () => {
  const { currentPath, navigate } = useRouter();

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
      <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-6">
        <Compass className="w-12 h-12 stroke-[1.5]" />
      </div>

      <div className="space-y-3 max-w-md">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-mono text-slate-400">
          <span>HTTP 404</span>
          <span>•</span>
          <span className="text-amber-400">Route Not Found</span>
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-100 font-mono">
          Page Not Located
        </h1>

        <p className="text-sm text-slate-400 leading-relaxed">
          The requested route <code className="text-amber-300 font-mono bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">{currentPath}</code> does not match any registered module in the KINTSUGI industrial data pipeline.
        </p>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button
          variant="primary"
          icon={ArrowLeft}
          onClick={() => navigate('/overview')}
        >
          Return to Overview
        </Button>
      </div>
    </div>
  );
};
