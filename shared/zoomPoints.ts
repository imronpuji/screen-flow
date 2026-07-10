/**
 * Per-click zoom points — manual enable/disable + peak-scale edits on auto-zoom segments,
 * plus user-added zooms at the playhead (not tied to a click).
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

/** User-added zoom (Add at playhead) — independent of click-derived segments. */
export interface ManualZoomPoint {
  id: string
  /** Peak time on the full recording timeline (ms). */
  peakMs: number
  /** Normalized focus 0–1 within the video frame. */
  focusX: number
  focusY: number
  peakScale: number
  enabled: boolean
}

export interface ManualZoomTiming {
  zoomInMs: number
  holdMs: number
  zoomOutMs: number
}

const MIN_PEAK_SCALE = 1.1
const MAX_PEAK_SCALE = 3

const DEFAULT_MANUAL_TIMING: ManualZoomTiming = {
  zoomInMs: 400,
  holdMs: 800,
  zoomOutMs: 500,
}

export function clampZoomPeakScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1.6
  return Math.max(MIN_PEAK_SCALE, Math.min(MAX_PEAK_SCALE, scale))
}

function clamp01(value: number, fallback = 0.5): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

/** Stable-enough id for a session (no crypto needed). */
export function createManualZoomId(): string {
  return `mz-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function createManualZoomPoint(input: {
  peakMs: number
  focusX?: number
  focusY?: number
  peakScale?: number
  id?: string
}): ManualZoomPoint {
  return {
    id: input.id ?? createManualZoomId(),
    peakMs: Math.max(0, Number.isFinite(input.peakMs) ? input.peakMs : 0),
    focusX: clamp01(input.focusX ?? 0.5),
    focusY: clamp01(input.focusY ?? 0.5),
    peakScale: clampZoomPeakScale(input.peakScale ?? 1.6),
    enabled: true,
  }
}

export function normalizeManualZoomPoint(
  point: ManualZoomPoint | null | undefined,
): ManualZoomPoint | null {
  if (!point || typeof point.id !== 'string' || !point.id) return null
  return {
    id: point.id,
    peakMs: Math.max(0, Number.isFinite(point.peakMs) ? point.peakMs : 0),
    focusX: clamp01(point.focusX),
    focusY: clamp01(point.focusY),
    peakScale: clampZoomPeakScale(point.peakScale ?? 1.6),
    enabled: point.enabled !== false,
  }
}

/** Map an enabled manual point → ZoomSegment (same timing as auto-zoom defaults). */
export function manualZoomToSegment(
  point: ManualZoomPoint,
  timing: Partial<ManualZoomTiming> = {},
): ZoomSegment | null {
  const normalized = normalizeManualZoomPoint(point)
  if (!normalized || !normalized.enabled) return null
  const zoomInMs = timing.zoomInMs ?? DEFAULT_MANUAL_TIMING.zoomInMs
  const holdMs = timing.holdMs ?? DEFAULT_MANUAL_TIMING.holdMs
  const zoomOutMs = timing.zoomOutMs ?? DEFAULT_MANUAL_TIMING.zoomOutMs
  const peakMs = normalized.peakMs
  const startMs = Math.max(0, peakMs - zoomInMs)
  const holdEndMs = peakMs + holdMs
  const endMs = holdEndMs + zoomOutMs
  return {
    startMs,
    peakMs,
    holdEndMs,
    endMs,
    focusX: normalized.focusX,
    focusY: normalized.focusY,
    peakScale: normalized.peakScale,
  }
}

/**
 * Merge click-derived segments with user-added playhead zooms.
 * Sorted by startMs; overlaps allowed (latest start wins in getZoomTransformAtTime).
 */
export function mergeZoomSegments(
  autoSegments: ZoomSegment[],
  manualPoints: ManualZoomPoint[] | null | undefined,
): ZoomSegment[] {
  const manuals: ZoomSegment[] = []
  if (manualPoints) {
    for (const point of manualPoints) {
      const seg = manualZoomToSegment(point)
      if (seg) manuals.push(seg)
    }
  }
  if (manuals.length === 0) return autoSegments
  return [...autoSegments, ...manuals].sort((a, b) => a.startMs - b.startMs)
}

export function upsertManualZoomPoint(
  points: ManualZoomPoint[],
  next: ManualZoomPoint,
): ManualZoomPoint[] {
  const cleaned = normalizeManualZoomPoint(next)
  if (!cleaned) return points
  const idx = points.findIndex((p) => p.id === cleaned.id)
  if (idx < 0) return [...points, cleaned]
  const copy = points.slice()
  copy[idx] = cleaned
  return copy
}

export function removeManualZoomPoint(
  points: ManualZoomPoint[],
  id: string,
): ManualZoomPoint[] {
  return points.filter((p) => p.id !== id)
}

export function countEnabledManualZoomPoints(
  points: ManualZoomPoint[] | null | undefined,
): number {
  if (!points) return 0
  let n = 0
  for (const p of points) {
    if (p.enabled !== false) n += 1
  }
  return n
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
