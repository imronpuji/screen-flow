/**
 * Undo/redo stack for non-destructive review edits (FOKUS 5).
 * Pure helpers — no DOM / React. Coalesce rapid pushes (sliders) into one step.
 */

export const EDIT_HISTORY_LIMIT = 50
/** Slider / drag updates within this window collapse into one undo step. */
export const EDIT_HISTORY_COALESCE_MS = 400

export interface EditHistory<T> {
  past: T[]
  present: T
  future: T[]
  /** Wall ms of last discrete push (or last coalesce tick). */
  lastPushAt: number
}

export function createEditHistory<T>(present: T, now = 0): EditHistory<T> {
  return { past: [], present, future: [], lastPushAt: now }
}

export function canUndo<T>(history: EditHistory<T>): boolean {
  return history.past.length > 0
}

export function canRedo<T>(history: EditHistory<T>): boolean {
  return history.future.length > 0
}

function trimPast<T>(past: T[]): T[] {
  if (past.length <= EDIT_HISTORY_LIMIT) return past
  return past.slice(past.length - EDIT_HISTORY_LIMIT)
}

/**
 * Commit a new present state.
 * When `coalesceMs` > 0 and the previous push was recent, replace `present`
 * without growing `past` (one undo step for a continuous slider drag).
 */
export function pushEdit<T>(
  history: EditHistory<T>,
  next: T,
  opts?: { coalesceMs?: number; now?: number },
): EditHistory<T> {
  if (Object.is(next, history.present)) return history

  const now = opts?.now ?? Date.now()
  const coalesceMs = opts?.coalesceMs ?? 0

  if (
    coalesceMs > 0 &&
    history.past.length > 0 &&
    now - history.lastPushAt < coalesceMs
  ) {
    return {
      ...history,
      present: next,
      future: [],
      lastPushAt: now,
    }
  }

  return {
    past: trimPast([...history.past, history.present]),
    present: next,
    future: [],
    lastPushAt: now,
  }
}

export function undoEdit<T>(history: EditHistory<T>, now = Date.now()): EditHistory<T> {
  if (history.past.length === 0) return history
  const previous = history.past[history.past.length - 1]!
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastPushAt: now,
  }
}

export function redoEdit<T>(history: EditHistory<T>, now = Date.now()): EditHistory<T> {
  if (history.future.length === 0) return history
  const [next, ...rest] = history.future
  return {
    past: trimPast([...history.past, history.present]),
    present: next!,
    future: rest,
    lastPushAt: now,
  }
}
