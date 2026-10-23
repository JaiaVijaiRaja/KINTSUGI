import React from 'react';
import { RefreshCw } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  submessage?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  submessage,
  className = '',
}) => {
  return (
    <div
      className={`py-12 flex flex-col items-center justify-center space-y-3 text-center ${className}`}
    >
      <RefreshCw className="w-7 h-7 text-amber-400 animate-spin" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-slate-200">{message}</p>
        {submessage && (
          <p className="text-xs text-slate-400 font-mono">{submessage}</p>
        )}
      </div>
    </div>
  );
};
