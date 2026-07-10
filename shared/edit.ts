/** Lightweight edit state for post-record review (trim + effects). */

export interface ReviewEditState {
  trimStartMs: number
  trimEndMs: number
  autoZoomEnabled: boolean
}

export function defaultReviewEdit(durationMs: number): ReviewEditState {
  return {
    trimStartMs: 0,
    trimEndMs: Math.max(0, durationMs),
    autoZoomEnabled: true,
  }
}

export function formatTimeMs(ms: number): string {
  const totalSec = Math.max(0, ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  const frac = Math.floor((totalSec % 1) * 10)
  return `${min}:${sec.toString().padStart(2, '0')}.${frac}`
}
