import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Spinner } from './Spinner';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
}

export function Button({
  loading,
  variant = 'primary',
  disabled,
  children,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading}
      {...props}
    >
      {loading ? <Spinner label="Loading" /> : children}
    </button>
  );
}
