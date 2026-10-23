import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'An error occurred',
  message,
  onRetry,
  className = '',
}) => {
  return (
    <div
      className={`rounded-xl border border-rose-900/50 bg-rose-950/20 p-6 flex flex-col sm:flex-row items-start gap-4 ${className}`}
    >
      <div className="p-2.5 rounded-lg bg-rose-900/30 text-rose-400 border border-rose-800/50 shrink-0">
        <AlertCircle className="w-5 h-5" />
      </div>

      <div className="flex-1 space-y-1.5">
        <h4 className="text-sm font-semibold text-rose-300">{title}</h4>
        <p className="text-xs text-rose-300/80 leading-relaxed font-mono">
          {message}
        </p>
      </div>

      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          icon={RefreshCw}
          className="border-rose-800 text-rose-300 hover:bg-rose-900/40 hover:text-white shrink-0"
        >
          Retry
        </Button>
      )}
    </div>
  );
};
