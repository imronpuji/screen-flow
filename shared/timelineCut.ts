/**
 * Playhead trim / cut helpers for the review editor (FOKUS 5).
 * Single contiguous keep-range (trimStart/trimEnd) — multi-segment concat later.
 */
import { normalizeTrim, type TrimRange } from './edit.js'

/** Minimum keep window after any cut (matches normalizeTrim). */
export const MIN_CLIP_MS = 100

/** True when playhead sits inside the keep range with room to cut on both sides. */
export function canSplitAtPlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): boolean {
  const t = normalizeTrim(trim, fullDurationMs)
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  return ph >= t.startMs + MIN_CLIP_MS && ph <= t.endMs - MIN_CLIP_MS
}

/** `[` — Mark In: set trim start to playhead (keep from here). */
export function markInAtPlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): TrimRange {
  const t = normalizeTrim(trim, fullDurationMs)
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  return normalizeTrim({ startMs: ph, endMs: t.endMs }, fullDurationMs)
}

/** `]` — Mark Out: set trim end to playhead (keep until here). */
export function markOutAtPlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): TrimRange {
  const t = normalizeTrim(trim, fullDurationMs)
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  return normalizeTrim({ startMs: t.startMs, endMs: ph }, fullDurationMs)
}

/**
 * `S` — Cut after playhead: discard everything after the playhead
 * (trim end → playhead). No-op when the remaining window would be &lt; MIN_CLIP_MS.
 */
export function cutAfterPlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): TrimRange {
  return markOutAtPlayhead(trim, playheadMs, fullDurationMs)
}

/**
 * `Shift+S` — Cut before playhead: discard everything before the playhead
 * (trim start → playhead).
 */
export function cutBeforePlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): TrimRange {
  return markInAtPlayhead(trim, playheadMs, fullDurationMs)
}

/**
 * Razor split at playhead → two candidate keep ranges (left / right).
 * Returns null when playhead is too close to either edge.
 */
export function splitTrimAtPlayhead(
  trim: TrimRange,
  playheadMs: number,
  fullDurationMs: number,
): { left: TrimRange; right: TrimRange } | null {
  if (!canSplitAtPlayhead(trim, playheadMs, fullDurationMs)) return null
  const t = normalizeTrim(trim, fullDurationMs)
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  return {
    left: normalizeTrim({ startMs: t.startMs, endMs: ph }, fullDurationMs),
    right: normalizeTrim({ startMs: ph, endMs: t.endMs }, fullDurationMs),
  }
}
