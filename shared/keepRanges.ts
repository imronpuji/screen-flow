/**
 * Multi-segment keep-ranges for the review editor (FOKUS 5).
 * Non-destructive: source stays intact; export concatenates kept windows.
 */

/** Minimum keep window (matches normalizeTrim / timelineCut). */
export const MIN_KEEP_MS = 100

export interface KeepRange {
  startMs: number
  endMs: number
}

function clampRange(range: KeepRange, fullDurationMs: number): KeepRange {
  const duration = Math.max(0, fullDurationMs)
  const startMs = Math.max(0, Math.min(range.startMs, duration))
  const endMs = Math.max(startMs + MIN_KEEP_MS, Math.min(range.endMs, duration))
  return { startMs, endMs }
}

/** Single full-clip keep window. */
export function defaultKeepRanges(fullDurationMs: number): KeepRange[] {
  const end = Math.max(0, fullDurationMs)
  if (end < MIN_KEEP_MS) return [{ startMs: 0, endMs: Math.max(end, MIN_KEEP_MS) }]
  return [{ startMs: 0, endMs: end }]
}

/** Sort, clamp, drop tiny/invalid, merge overlaps. Always ≥1 range when duration allows. */
export function normalizeKeepRanges(
  ranges: KeepRange[],
  fullDurationMs: number,
): KeepRange[] {
  const duration = Math.max(0, fullDurationMs)
  if (duration < MIN_KEEP_MS) {
    return [{ startMs: 0, endMs: Math.max(duration, MIN_KEEP_MS) }]
  }

  const cleaned = ranges
    .map((r) => clampRange(r, duration))
    .filter((r) => r.endMs - r.startMs >= MIN_KEEP_MS)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs)

  if (cleaned.length === 0) {
    return defaultKeepRanges(duration)
  }

  const merged: KeepRange[] = [{ ...cleaned[0]! }]
  for (let i = 1; i < cleaned.length; i++) {
    const cur = cleaned[i]!
    const prev = merged[merged.length - 1]!
    // Strict overlap only — touching ends (razor split) stay as edit points.
    if (cur.startMs < prev.endMs) {
      prev.endMs = Math.max(prev.endMs, cur.endMs)
    } else {
      merged.push({ ...cur })
    }
  }
  return merged
}

/** Collapse ranges that touch within `toleranceMs` (export optimization). */
export function mergeAdjacentKeepRanges(
  ranges: KeepRange[],
  fullDurationMs: number,
  toleranceMs = 1,
): KeepRange[] {
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  if (normalized.length <= 1) return normalized
  const out: KeepRange[] = [{ ...normalized[0]! }]
  for (let i = 1; i < normalized.length; i++) {
    const cur = normalized[i]!
    const prev = out[out.length - 1]!
    if (cur.startMs - prev.endMs <= toleranceMs) {
      prev.endMs = Math.max(prev.endMs, cur.endMs)
    } else {
      out.push({ ...cur })
    }
  }
  return out
}

export function totalKeepDurationMs(ranges: KeepRange[]): number {
  return ranges.reduce((sum, r) => sum + Math.max(0, r.endMs - r.startMs), 0)
}

/** Outer bounds (first start → last end) for scrubber / legacy trim fields. */
export function outerTrimFromKeepRanges(ranges: KeepRange[]): KeepRange {
  if (ranges.length === 0) return { startMs: 0, endMs: MIN_KEEP_MS }
  return {
    startMs: ranges[0]!.startMs,
    endMs: ranges[ranges.length - 1]!.endMs,
  }
}

/** Index of the keep range containing playhead, or -1. */
export function findKeepRangeIndex(ranges: KeepRange[], playheadMs: number): number {
  const ph = Math.max(0, playheadMs)
  return ranges.findIndex((r) => ph >= r.startMs && ph <= r.endMs)
}

/** True when playhead can razor-split the active keep range into two valid clips. */
export function canSplitKeepRangesAtPlayhead(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
): boolean {
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  const idx = findKeepRangeIndex(normalized, playheadMs)
  if (idx < 0) return false
  const r = normalized[idx]!
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  return ph >= r.startMs + MIN_KEEP_MS && ph <= r.endMs - MIN_KEEP_MS
}

/**
 * Razor split at playhead → two keep ranges (left / right of the cut).
 * Adjacent (no gap). Returns null when split is not possible.
 */
export function splitKeepRangesAtPlayhead(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
): KeepRange[] | null {
  if (!canSplitKeepRangesAtPlayhead(ranges, playheadMs, fullDurationMs)) return null
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  const idx = findKeepRangeIndex(normalized, playheadMs)
  if (idx < 0) return null
  const r = normalized[idx]!
  const ph = Math.max(0, Math.min(playheadMs, fullDurationMs))
  const left = clampRange({ startMs: r.startMs, endMs: ph }, fullDurationMs)
  const right = clampRange({ startMs: ph, endMs: r.endMs }, fullDurationMs)
  return [
    ...normalized.slice(0, idx),
    left,
    right,
    ...normalized.slice(idx + 1),
  ]
}

/**
 * Delete the keep range under the playhead.
 * Returns null when only one range remains (cannot delete the last clip).
 */
export function deleteKeepRangeAtPlayhead(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
): KeepRange[] | null {
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  if (normalized.length <= 1) return null
  const idx = findKeepRangeIndex(normalized, playheadMs)
  if (idx < 0) return null
  const next = [...normalized.slice(0, idx), ...normalized.slice(idx + 1)]
  return normalizeKeepRanges(next, fullDurationMs)
}

export interface DeleteKeepRangeResult {
  ranges: KeepRange[]
  /** When set, UI should move playhead here after delete (ripple / invalid snap). */
  playheadMs?: number
}

/**
 * Delete the keep range under the playhead.
 * When `rippleDelete` is true, merge touching survivors so the timeline closes up.
 */
export function deleteKeepRangeWithRipple(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
  rippleDelete: boolean,
): DeleteKeepRangeResult | null {
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  if (normalized.length <= 1) return null
  const idx = findKeepRangeIndex(normalized, playheadMs)
  if (idx < 0) return null
  const deleted = normalized[idx]!
  const without = [...normalized.slice(0, idx), ...normalized.slice(idx + 1)]
  const next = rippleDelete
    ? mergeAdjacentKeepRanges(without, fullDurationMs)
    : normalizeKeepRanges(without, fullDurationMs)
  const playheadSnap = snapPlayheadIntoKeepRanges(next, playheadMs, fullDurationMs)
  const playheadMsOut =
    rippleDelete || playheadSnap !== playheadMs
      ? rippleDelete
        ? snapPlayheadIntoKeepRanges(next, deleted.startMs, fullDurationMs)
        : playheadSnap
      : undefined
  return { ranges: next, playheadMs: playheadMsOut }
}

/**
 * Discard a middle window [fromMs, toMs] inside keep ranges,
 * leaving remnants with a gap — jump-cut on export concat.
 * Returns null when the cut would leave no valid clips.
 */
export function cutGapInKeepRanges(
  ranges: KeepRange[],
  fromMs: number,
  toMs: number,
  fullDurationMs: number,
): KeepRange[] | null {
  const a = Math.min(fromMs, toMs)
  const b = Math.max(fromMs, toMs)
  if (b - a < MIN_KEEP_MS) return null

  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  const next: KeepRange[] = []
  for (const r of normalized) {
    if (b <= r.startMs || a >= r.endMs) {
      next.push(r)
      continue
    }
    if (a >= r.startMs + MIN_KEEP_MS) {
      const left = clampRange({ startMs: r.startMs, endMs: a }, fullDurationMs)
      if (left.endMs - left.startMs >= MIN_KEEP_MS) next.push(left)
    }
    if (b <= r.endMs - MIN_KEEP_MS) {
      const right = clampRange({ startMs: b, endMs: r.endMs }, fullDurationMs)
      if (right.endMs - right.startMs >= MIN_KEEP_MS) next.push(right)
    }
  }
  if (next.length === 0) return null
  return normalizeKeepRanges(next, fullDurationMs)
}

/** True when playhead sits inside a keep window (inclusive ends). */
export function isInsideKeepRange(ranges: KeepRange[], playheadMs: number): boolean {
  return findKeepRangeIndex(ranges, playheadMs) >= 0
}

/**
 * Discarded source windows (gaps + leading/trailing trim) for timeline shading.
 * Preview skips these during playback so scrub ≡ export concat.
 */
export function discardedKeepWindows(
  ranges: KeepRange[],
  fullDurationMs: number,
): KeepRange[] {
  const duration = Math.max(0, fullDurationMs)
  const normalized = normalizeKeepRanges(ranges, duration)
  const gaps: KeepRange[] = []
  let cursor = 0
  for (const r of normalized) {
    if (r.startMs - cursor >= MIN_KEEP_MS) {
      gaps.push({ startMs: cursor, endMs: r.startMs })
    }
    cursor = Math.max(cursor, r.endMs)
  }
  if (duration - cursor >= MIN_KEEP_MS) {
    gaps.push({ startMs: cursor, endMs: duration })
  }
  return gaps
}

/**
 * Snap a scrub/seek into a keep window.
 * Prefer the next keep start when landing in a gap; clamp past-end to last end.
 */
export function snapPlayheadIntoKeepRanges(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
): number {
  const duration = Math.max(0, fullDurationMs)
  const normalized = normalizeKeepRanges(ranges, duration)
  const first = normalized[0]!
  const last = normalized[normalized.length - 1]!
  const ph = Math.max(0, Math.min(playheadMs, duration))
  if (ph < first.startMs) return first.startMs
  if (ph > last.endMs) return last.endMs
  if (findKeepRangeIndex(normalized, ph) >= 0) return ph
  for (const r of normalized) {
    if (r.startMs > ph) return r.startMs
  }
  return last.endMs
}

export interface KeepPlaybackResolve {
  /** Media timeline ms to show / seek. */
  ms: number
  /** Pause when playhead reached the end of the last keep window. */
  shouldPause: boolean
}

/**
 * During playback: skip discarded gaps so preview matches ffmpeg concat.
 * Returns the same ms when still inside a keep window.
 */
export function resolveKeepPlaybackMs(
  ranges: KeepRange[],
  playheadMs: number,
  fullDurationMs: number,
): KeepPlaybackResolve {
  const duration = Math.max(0, fullDurationMs)
  const normalized = normalizeKeepRanges(ranges, duration)
  const first = normalized[0]!
  const last = normalized[normalized.length - 1]!
  const ph = Math.max(0, Math.min(playheadMs, duration))

  if (ph < first.startMs) {
    return { ms: first.startMs, shouldPause: false }
  }
  if (ph >= last.endMs) {
    return { ms: last.endMs, shouldPause: true }
  }

  const idx = findKeepRangeIndex(normalized, ph)
  if (idx >= 0) {
    const r = normalized[idx]!
    // At the exclusive end of a non-final keep → jump to the next segment.
    if (ph >= r.endMs - 0.5 && idx < normalized.length - 1) {
      return { ms: normalized[idx + 1]!.startMs, shouldPause: false }
    }
    return { ms: ph, shouldPause: false }
  }

  // In a gap — skip forward to the next keep start.
  for (let i = 0; i < normalized.length; i++) {
    const r = normalized[i]!
    if (r.startMs > ph) {
      return { ms: r.startMs, shouldPause: false }
    }
  }
  return { ms: last.endMs, shouldPause: true }
}

/** Apply a single-window trim edit onto keep-ranges (replaces with one range). */
export function keepRangesFromTrim(trim: KeepRange, fullDurationMs: number): KeepRange[] {
  return normalizeKeepRanges([trim], fullDurationMs)
}

/**
 * Patch keep-ranges after a legacy trim-slider / mark-in-out edit.
 * Single range → replace; multi-range → adjust outer edges only.
 */
export function applyTrimToKeepRanges(
  ranges: KeepRange[],
  trim: KeepRange,
  fullDurationMs: number,
): KeepRange[] {
  const normalized = normalizeKeepRanges(ranges, fullDurationMs)
  const nextTrim = clampRange(trim, fullDurationMs)
  if (normalized.length <= 1) {
    return [nextTrim]
  }
  const first = { ...normalized[0]! }
  const last = { ...normalized[normalized.length - 1]! }
  first.startMs = nextTrim.startMs
  last.endMs = nextTrim.endMs
  if (first.endMs - first.startMs < MIN_KEEP_MS) {
    first.endMs = first.startMs + MIN_KEEP_MS
  }
  if (last.endMs - last.startMs < MIN_KEEP_MS) {
    last.startMs = last.endMs - MIN_KEEP_MS
  }
  const mid = normalized.slice(1, -1)
  return normalizeKeepRanges([first, ...mid, last], fullDurationMs)
}
