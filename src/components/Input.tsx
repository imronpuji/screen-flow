import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s/g, '-');
  return (
    <div className={`field ${error ? 'field-error' : ''}`}>
      <label htmlFor={inputId}>{label}</label>
      <input id={inputId} className={`input ${className}`} aria-invalid={!!error} {...props} />
      {error && (
        <span className="field-msg" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
