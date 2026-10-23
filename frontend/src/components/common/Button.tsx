import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ElementType;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon: Icon,
  disabled,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium transition-colors focus:outline-hidden focus:ring-2 focus:ring-amber-400/50 focus:ring-offset-1 focus:ring-offset-slate-950 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none rounded-lg';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-xs sm:text-sm px-3.5 py-2',
    lg: 'text-sm px-4 py-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold shadow-xs shadow-amber-500/20 active:bg-amber-600',
    secondary:
      'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 active:bg-slate-800',
    outline:
      'bg-transparent hover:bg-slate-800/60 text-slate-300 border border-slate-700 hover:text-white',
    ghost:
      'bg-transparent hover:bg-slate-800/40 text-slate-400 hover:text-slate-200',
    danger:
      'bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60',
  }[variant];

  return (
    <button
      disabled={disabled || loading}
      className={`${baseClasses} ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {loading ? (
        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
      ) : Icon ? (
        <Icon className="w-3.5 h-3.5 shrink-0" />
      ) : null}
      <span>{children}</span>
    </button>
  );
};
