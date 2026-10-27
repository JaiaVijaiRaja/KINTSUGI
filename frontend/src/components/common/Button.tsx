import React from 'react';
import { RefreshCw } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'dark';
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
    'inline-flex items-center justify-center gap-2 font-medium transition-all focus:outline-hidden focus:ring-2 focus:ring-[#EE602C]/40 focus:ring-offset-1 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer select-none rounded-xl';

  const sizeClasses = {
    sm: 'text-xs px-2.5 py-1.5',
    md: 'text-xs sm:text-sm px-3.5 py-2',
    lg: 'text-sm px-4.5 py-2.5',
  }[size];

  const variantClasses = {
    primary:
      'bg-[#EE602C] hover:bg-[#D95322] text-white font-semibold shadow-xs shadow-[#EE602C]/25 active:bg-[#C44617]',
    secondary:
      'bg-white hover:bg-stone-50 text-stone-800 border border-stone-200 shadow-2xs active:bg-stone-100',
    outline:
      'bg-transparent hover:bg-stone-100 text-stone-700 border border-stone-300 active:bg-stone-200',
    ghost:
      'bg-transparent hover:bg-stone-100/80 text-stone-600 hover:text-stone-900',
    danger:
      'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 active:bg-rose-200',
    dark:
      'bg-stone-900 hover:bg-black text-white font-semibold shadow-xs active:bg-stone-950',
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

