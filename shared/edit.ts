import type { CursorEvent } from './cursor.js'

/** Lightweight edit state for post-record review (trim + effects). */

export interface TrimRange {
  startMs: number
  endMs: number
}

export interface ReviewEditState {
  trimStartMs: number
  trimEndMs: number
  autoZoomEnabled: boolean
  cursorSmoothingEnabled: boolean
}

/** Clamp trim handles to a valid export window (≥100ms). */
export function normalizeTrim(trim: TrimRange, fullDurationMs: number): TrimRange {
  const duration = Math.max(0, fullDurationMs)
  const startMs = Math.max(0, Math.min(trim.startMs, duration))
  const endMs = Math.max(startMs + 100, Math.min(trim.endMs, duration))
  return { startMs, endMs }
}

export function trimDurationMs(trim: TrimRange): number {
  return Math.max(0, trim.endMs - trim.startMs)
}

/** Shift cursor events into trimmed timeline (0 = trim start). Drops events outside range. */
export function applyTrimToCursorEvents(events: CursorEvent[], trim: TrimRange): CursorEvent[] {
  return events
    .filter((e) => e.t >= trim.startMs && e.t <= trim.endMs)
    .map((e) => ({ ...e, t: e.t - trim.startMs }))
}

export function msToFfmpegSec(ms: number): string {
  return (ms / 1000).toFixed(3)
}

export function defaultReviewEdit(durationMs: number): ReviewEditState {
  return {
    trimStartMs: 0,
    trimEndMs: Math.max(0, durationMs),
    autoZoomEnabled: true,
    cursorSmoothingEnabled: true,
  }
}

export function formatTimeMs(ms: number): string {
  const totalSec = Math.max(0, ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  const frac = Math.floor((totalSec % 1) * 10)
  return `${min}:${sec.toString().padStart(2, '0')}.${frac}`
}
