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
    default: 'bg-white border-[#EBE7E1] shadow-[0_2px_12px_rgba(0,0,0,0.025)]',
    subtle: 'bg-[#FAF8F5] border-[#EBE7E1]/80',
    accent: 'bg-white border-orange-200 shadow-xs shadow-orange-500/5',
    danger: 'bg-rose-50/40 border-rose-200',
  }[variant];

  return (
    <div
      className={`rounded-2xl border transition-all ${variantClasses} ${className}`}
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
    className={`flex items-start justify-between gap-4 p-5 sm:p-6 border-b border-[#F2EFE9] ${className}`}
  >
    <div className="flex items-start gap-3">
      {Icon && (
        <div className="p-2 rounded-xl bg-stone-100 text-[#EE602C] border border-stone-200/60 shrink-0 mt-0.5 shadow-2xs">
          <Icon className="w-4 h-4" />
        </div>
      )}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm sm:text-base font-semibold text-stone-900 tracking-tight">
            {title}
          </h3>
          {badge}
        </div>
        {subtitle && (
          <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
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
    className={`p-4 sm:px-6 border-t border-[#F2EFE9] bg-[#FAF8F5] rounded-b-2xl flex items-center justify-between gap-3 text-xs text-stone-500 ${className}`}
  >
    {children}
  </div>
);

