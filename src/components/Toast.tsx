import { useEffect, useId, useRef } from 'react'
import type { ActiveToast } from '../../shared/toast'

export type { ActiveToast }

export interface ToastHostProps {
  toast: ActiveToast | null
  onDismiss: (id: string) => void
  onAction?: (toast: ActiveToast) => void
}

/**
 * Single-slot toast host — calm, non-blocking feedback (FOKUS 4).
 * Auto-dismisses after durationMs; action button optional (e.g. Show in folder).
 */
export function ToastHost({ toast, onDismiss, onAction }: ToastHostProps) {
  const titleId = useId()
  const bodyId = useId()
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  const toastId = toast?.id
  const durationMs = toast?.durationMs ?? 0

  useEffect(() => {
    if (!toastId || durationMs <= 0) return
    const timer = window.setTimeout(() => {
      onDismissRef.current(toastId)
    }, durationMs)
    return () => window.clearTimeout(timer)
  }, [toastId, durationMs])

  if (!toast) return null

  const live = toast.tone === 'error' || toast.tone === 'warn' ? 'assertive' : 'polite'

  return (
    <div className="sf-toast-host" aria-live={live} aria-relevant="additions text">
      <div
        className={`sf-toast sf-toast--${toast.tone}`}
        role={toast.tone === 'error' ? 'alert' : 'status'}
        aria-labelledby={titleId}
        aria-describedby={toast.body ? bodyId : undefined}
      >
        <div className="sf-toast__text">
          <p className="sf-toast__title" id={titleId}>
            {toast.title}
          </p>
          {toast.body ? (
            <p className="sf-toast__body" id={bodyId}>
              {toast.body}
            </p>
          ) : null}
        </div>
        <div className="sf-toast__actions">
          {toast.action ? (
            <button
              type="button"
              className="btn btn--ghost sf-toast__action"
              onClick={() => onAction?.(toast)}
            >
              {toast.action.label}
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn--ghost sf-toast__dismiss"
            aria-label="Dismiss notification"
            onClick={() => onDismiss(toast.id)}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
