import type { ReactNode } from 'react'
import type { TooltipCopy } from '../../shared/tooltips'

export interface TooltipProps {
  copy: TooltipCopy
  children: ReactNode
  /** Prefer wrapping interactive controls; empty states can use `block`. */
  block?: boolean
  className?: string
}

/**
 * Accessible hover/focus tip. Uses native `title` as fallback and a visible
 * tip panel for empty states / disabled controls (native title alone is weak UX).
 */
export function Tooltip({ copy, children, block = false, className }: TooltipProps) {
  const classes = [
    'sf-tooltip',
    block ? 'sf-tooltip--block' : 'sf-tooltip--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} data-tooltip-id={copy.id}>
      <span className="sf-tooltip__anchor" title={copy.title}>
        {children}
      </span>
      <span className="sf-tooltip__panel" role="tooltip">
        <span className="sf-tooltip__title">{copy.title}</span>
        {copy.body ? <span className="sf-tooltip__body">{copy.body}</span> : null}
      </span>
    </span>
  )
}

export interface EmptyHintAction {
  label: string
  onClick: () => void
  disabled?: boolean
  /** Native title / aria hint for the CTA. */
  title?: string
}

/** Inline empty-state callout (always visible, not hover-only) with optional CTA. */
export function EmptyHint({
  copy,
  className,
  action,
}: {
  copy: TooltipCopy
  className?: string
  action?: EmptyHintAction
}) {
  return (
    <div
      className={['sf-empty-hint', className].filter(Boolean).join(' ')}
      data-tooltip-id={copy.id}
      role="status"
    >
      <span className="sf-empty-hint__title">{copy.title}</span>
      {copy.body ? <span className="sf-empty-hint__body">{copy.body}</span> : null}
      {action ? (
        <button
          type="button"
          className="btn btn--ghost sf-empty-hint__action"
          disabled={action.disabled}
          title={action.title ?? action.label}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      ) : null}
    </div>
  )
}
