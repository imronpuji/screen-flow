/**
 * Per-click zoom points — manual enable/disable + peak-scale edits on auto-zoom segments.
 * Pure helpers; preview UI + ffmpeg export bake share the same apply path.
 */

import type { ZoomSegment } from './autozoom.js'

export interface ZoomPointOverride {
  /** Index into auto-built zoom segments (stable for a recording session). */
  index: number
  /** When false, that click zoom is skipped in preview + export. */
  enabled: boolean
  /** Peak scale override; omit to keep the segment default (usually 1.6). */
  peakScale?: number
}

const MIN_PEAK_SCALE = 1.1
const MAX_PEAK_SCALE = 3

export function clampZoomPeakScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1.6
  return Math.max(MIN_PEAK_SCALE, Math.min(MAX_PEAK_SCALE, scale))
}

function overrideMap(
  overrides: ZoomPointOverride[] | null | undefined,
): Map<number, ZoomPointOverride> {
  const map = new Map<number, ZoomPointOverride>()
  if (!overrides) return map
  for (const item of overrides) {
    if (!Number.isInteger(item.index) || item.index < 0) continue
    map.set(item.index, {
      index: item.index,
      enabled: item.enabled !== false,
      ...(item.peakScale != null
        ? { peakScale: clampZoomPeakScale(item.peakScale) }
        : {}),
    })
  }
  return map
}

/**
 * Apply per-point edits onto auto-built segments.
 * Disabled points are dropped; enabled points may get a custom peakScale.
 */
export function applyZoomPointOverrides(
  segments: ZoomSegment[],
  overrides: ZoomPointOverride[] | null | undefined,
): ZoomSegment[] {
  if (!overrides || overrides.length === 0) return segments
  const map = overrideMap(overrides)
  const next: ZoomSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const ov = map.get(i)
    if (ov && !ov.enabled) continue
    if (ov?.peakScale != null) {
      next.push({ ...seg, peakScale: ov.peakScale })
    } else {
      next.push(seg)
    }
  }
  return next
}

/** Upsert one override by segment index (immutable). */
export function upsertZoomPointOverride(
  overrides: ZoomPointOverride[],
  next: ZoomPointOverride,
): ZoomPointOverride[] {
  const cleaned: ZoomPointOverride = {
    index: next.index,
    enabled: next.enabled !== false,
    ...(next.peakScale != null
      ? { peakScale: clampZoomPeakScale(next.peakScale) }
      : {}),
  }
  const idx = overrides.findIndex((o) => o.index === cleaned.index)
  if (idx < 0) return [...overrides, cleaned]
  const copy = overrides.slice()
  copy[idx] = cleaned
  return copy
}

/** Resolve enabled flag for a segment index (default true). */
export function isZoomPointEnabled(
  index: number,
  overrides: ZoomPointOverride[] | null | undefined,
): boolean {
  const ov = overrides?.find((o) => o.index === index)
  return ov ? ov.enabled !== false : true
}

/** Resolve peak scale for a segment (override or segment default). */
export function resolveZoomPointPeakScale(
  segment: ZoomSegment,
  index: number,
  overrides: ZoomPointOverride[] | null | undefined,
): number {
  const ov = overrides?.find((o) => o.index === index)
  if (ov?.peakScale != null) return clampZoomPeakScale(ov.peakScale)
  return segment.peakScale
}

export function countEnabledZoomPoints(
  segmentCount: number,
  overrides: ZoomPointOverride[] | null | undefined,
): number {
  let n = 0
  for (let i = 0; i < segmentCount; i++) {
    if (isZoomPointEnabled(i, overrides)) n += 1
  }
  return n
}
