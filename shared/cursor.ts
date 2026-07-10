/**
 * Cursor metadata captured during recording — foundation for auto-zoom & click effects.
 * Stored as JSONL alongside capture.webm in the session temp dir.
 */

export type CursorEventKind = 'move' | 'down' | 'up' | 'click'

/** Mouse button index: 0 = left, 1 = right, 2 = middle (matches uIOhook). */
export type CursorButton = 0 | 1 | 2

export interface CursorEvent {
  /** Milliseconds since recording start. */
  t: number
  x: number
  y: number
  kind: CursorEventKind
  button?: CursorButton
}

export const CURSOR_EVENTS_FILENAME = 'cursor-events.jsonl'
