import React from 'react';

interface PageHeaderProps {
  title: string;
  description: string;
  badge?: string;
  badgeVariant?: 'primary' | 'amber' | 'emerald' | 'slate';
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  badge,
  badgeVariant = 'amber',
  actions,
}) => {
  const badgeClasses = {
    primary: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    amber: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    emerald: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    slate: 'bg-slate-800 text-slate-300 border-slate-700',
  }[badgeVariant];

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 font-mono">
            {title}
          </h1>
          {badge && (
            <span
              className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border font-medium ${badgeClasses}`}
            >
              {badge}
            </span>
          )}
        </div>
        <p className="text-xs sm:text-sm text-slate-400 max-w-3xl leading-relaxed">
          {description}
        </p>
      </div>

      {actions && (
        <div className="flex items-center gap-2.5 shrink-0 self-start md:self-auto">
          {actions}
        </div>
      )}
    </div>
  );
};
