import type { ReactNode } from 'react'
import {
  EDITOR_PANEL_LABELS,
  type EditorPanelId,
} from '../../shared/editorPanels'

export interface EditorPanelProps {
  id: EditorPanelId
  open: boolean
  onToggle: (id: EditorPanelId) => void
  /** Optional one-line status shown when collapsed (e.g. "On · 3 zooms"). */
  summary?: string
  children: ReactNode
}

/** Collapsible property section for the review editor sidebar. */
export function EditorPanel({ id, open, onToggle, summary, children }: EditorPanelProps) {
  const label = EDITOR_PANEL_LABELS[id]
  const panelId = `review-panel-${id}`
  const bodyId = `${panelId}-body`

  return (
    <section
      className={`review__panel${open ? ' review__panel--open' : ''}`}
      aria-labelledby={panelId}
    >
      <button
        type="button"
        id={panelId}
        className="review__panel-toggle"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => onToggle(id)}
      >
        <span className="review__panel-toggle-label">{label}</span>
        {!open && summary ? (
          <span className="review__panel-summary">{summary}</span>
        ) : null}
        <span className="review__panel-chevron" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="review__panel-body" role="region" aria-labelledby={panelId}>
          {children}
        </div>
      ) : null}
    </section>
  )
}
