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
    primary: 'bg-orange-50 text-[#EE602C] border-orange-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    slate: 'bg-stone-100 text-stone-700 border-stone-200',
  }[badgeVariant];

  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-stone-200/80">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
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
        <p className="text-xs sm:text-sm text-stone-600 max-w-3xl leading-relaxed">
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
