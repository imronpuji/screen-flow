import { useEffect, useState } from 'react';
import { Spinner } from './Spinner';

type BiometricState = 'scanning' | 'success' | 'failed';

interface BiometricPromptProps {
  open: boolean;
  onSuccess: () => void;
  onCancel: () => void;
  onScan: () => Promise<void>;
}

export function BiometricPrompt({ open, onSuccess, onCancel, onScan }: BiometricPromptProps) {
  const [state, setState] = useState<BiometricState>('scanning');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setState('scanning');
      setError('');
      return;
    }

    let cancelled = false;
    const run = async () => {
      setState('scanning');
      setError('');
      try {
        await onScan();
        if (cancelled) return;
        setState('success');
        setTimeout(() => {
          if (!cancelled) onSuccess();
        }, 600);
      } catch (err) {
        if (cancelled) return;
        setState('failed');
        setError(err instanceof Error ? err.message : 'Biometric verification failed');
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [open, onScan, onSuccess]);

  if (!open) return null;

  return (
    <div className="biometric-overlay" role="dialog" aria-modal="true" aria-label="Biometric login">
      <div className="biometric-sheet">
        <button type="button" className="biometric-close" onClick={onCancel} aria-label="Cancel">
          ✕
        </button>

        <div className={`biometric-icon ${state === 'scanning' ? 'scanning' : ''} ${state === 'success' ? 'success' : ''}`}>
          {state === 'success' ? (
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          ) : (
            <svg viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path
                d="M32 8c-8 0-14 6-14 14v4M18 30v6M22 22v12M26 18v20M30 14v28M34 14v28M38 18v20M42 22v12M46 30v6M32 50c8 0 14-6 14-14v-4"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </svg>
          )}
        </div>

        <h2 className="biometric-title">
          {state === 'scanning' && 'Verifikasi biometrik'}
          {state === 'success' && 'Berhasil!'}
          {state === 'failed' && 'Gagal'}
        </h2>
        <p className="biometric-subtitle">
          {state === 'scanning' && 'Sentuh sensor sidik jari atau lihat ke kamera'}
          {state === 'success' && 'Identitas terverifikasi'}
          {state === 'failed' && error}
        </p>

        {state === 'scanning' && <Spinner label="Scanning biometric" />}

        {state === 'failed' && (
          <button type="button" className="btn btn-primary btn-block" onClick={onCancel}>
            Coba lagi
          </button>
        )}
      </div>
    </div>
  );
}
