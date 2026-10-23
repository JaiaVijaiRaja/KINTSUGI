import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'default' | 'subtle' | 'accent' | 'danger';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  variant = 'default',
}) => {
  const variantClasses = {
    default: 'bg-slate-900/60 border-slate-800/80 shadow-md',
    subtle: 'bg-slate-950/40 border-slate-800/50',
    accent: 'bg-slate-900/70 border-amber-500/30 shadow-md shadow-amber-500/5',
    danger: 'bg-rose-950/20 border-rose-900/40',
  }[variant];

  return (
    <div
      className={`rounded-xl border backdrop-blur-xs transition-all ${variantClasses} ${className}`}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<{
  title: string;
  subtitle?: string;
  icon?: React.ElementType;
  badge?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon: Icon, badge, action, className = '' }) => (
  <div
    className={`flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-slate-800/70 ${className}`}
  >
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="p-2 rounded-lg bg-slate-800/80 text-amber-400 border border-slate-700/60 shrink-0 mt-0.5">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm sm:text-base font-semibold text-slate-100">
            {title}
          </h3>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
            {subtitle}
          </p>
        )}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);

export const CardContent: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div className={`p-5 sm:p-6 ${className}`}>{children}</div>
);

export const CardFooter: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`p-4 sm:px-6 border-t border-slate-800/60 bg-slate-950/40 rounded-b-xl flex items-center justify-between gap-3 text-xs text-slate-400 ${className}`}
  >
    {children}
  </div>
);
