/**
 * Per-click zoom points — manual enable/disable + peak-scale edits on auto-zoom segments,
 * plus user-added zooms at the playhead (not tied to a click).
 * Pure helpers; preview UI + ffmpeg export bake share the same apply path.
 */

import type { ZoomSegment } from './autozoom.js'

/** Minimum zoom-in / zoom-out duration when resizing scrubber edges (ms). */
export const MIN_ZOOM_EDGE_MS = 80

export interface ZoomPointOverride {
  /** Index into auto-built zoom segments (stable for a recording session). */
  index: number
  /** When false, that click zoom is skipped in preview + export. */
  enabled: boolean
  /** Peak scale override; omit to keep the segment default (usually 1.6). */
  peakScale?: number
  /** Optional focus override (0–1); omit to keep click-derived focus. */
  focusX?: number
  focusY?: number
  /**
   * Optional peak-time override (ms on the full recording timeline).
   * When set alone, the whole segment (in/hold/out) shifts so relative timing stays.
   * Combined with zoomIn/hold/zoomOut, rebuilds absolute timing around the peak.
   */
  peakMs?: number
  /** Optional zoom-in duration (ms before peak). Set by scrubber start-edge drag. */
  zoomInMs?: number
  /** Optional hold duration (ms at peak scale). */
  holdMs?: number
  /** Optional zoom-out duration (ms after hold). Set by scrubber end-edge drag. */
  zoomOutMs?: number
}

/** Cardinal direction for focus nudge (frame coords, origin top-left). */
export type ZoomFocusNudgeDirection = 'left' | 'right' | 'up' | 'down'

/** Default focus nudge step as fraction of frame (2%). */
export const ZOOM_FOCUS_NUDGE_STEP = 0.02
/** Shift-held focus nudge step (8%). */
export const ZOOM_FOCUS_NUDGE_STEP_SHIFT = 0.08

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
  /** Optional timing overrides (omit → default manual timing). */
  zoomInMs?: number
  holdMs?: number
  zoomOutMs?: number
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

/** Extract in/hold/out timing from a segment (non-negative). */
export function zoomSegmentTiming(segment: ZoomSegment): {
  peakMs: number
  zoomInMs: number
  holdMs: number
  zoomOutMs: number
} {
  return {
    peakMs: Math.max(0, segment.peakMs),
    zoomInMs: Math.max(0, segment.peakMs - segment.startMs),
    holdMs: Math.max(0, segment.holdEndMs - segment.peakMs),
    zoomOutMs: Math.max(0, segment.endMs - segment.holdEndMs),
  }
}

/**
 * Rebuild a segment around a peak with explicit in/hold/out durations.
 * Omitting a timing field keeps the segment's current relative duration.
 */
export function rebuildZoomSegmentTiming(
  segment: ZoomSegment,
  timing: {
    peakMs?: number
    zoomInMs?: number
    holdMs?: number
    zoomOutMs?: number
  },
  durationMs = 0,
): ZoomSegment {
  const upper =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  const current = zoomSegmentTiming(segment)
  const peakMs = Math.max(
    0,
    Math.min(
      upper,
      timing.peakMs != null && Number.isFinite(timing.peakMs)
        ? timing.peakMs
        : current.peakMs,
    ),
  )
  const zoomInMs = Math.max(
    0,
    timing.zoomInMs != null && Number.isFinite(timing.zoomInMs)
      ? timing.zoomInMs
      : current.zoomInMs,
  )
  const holdMs = Math.max(
    0,
    timing.holdMs != null && Number.isFinite(timing.holdMs)
      ? timing.holdMs
      : current.holdMs,
  )
  const zoomOutMs = Math.max(
    0,
    timing.zoomOutMs != null && Number.isFinite(timing.zoomOutMs)
      ? timing.zoomOutMs
      : current.zoomOutMs,
  )
  const startMs = Math.max(0, peakMs - zoomInMs)
  const holdEndMs = peakMs + holdMs
  const endMs = Math.min(upper === Number.POSITIVE_INFINITY ? holdEndMs + zoomOutMs : upper, holdEndMs + zoomOutMs)
  return {
    ...segment,
    startMs,
    peakMs,
    holdEndMs: Math.max(peakMs, holdEndMs),
    endMs: Math.max(peakMs, endMs),
  }
}

/**
 * Shift a zoom segment so its peak lands at `newPeakMs`, keeping in/hold/out
 * durations. Clamps peak into [0, durationMs] (durationMs ≤ 0 → no upper clamp).
 */
export function shiftZoomSegmentToPeak(
  segment: ZoomSegment,
  newPeakMs: number,
  durationMs = 0,
): ZoomSegment {
  return rebuildZoomSegmentTiming(segment, { peakMs: newPeakMs }, durationMs)
}

/**
 * Resize zoom-in (start) or zoom-out (end) edge; peak + hold stay fixed.
 * Clamps so each edge keeps at least MIN_ZOOM_EDGE_MS.
 */
export function resizeZoomSegmentEdge(
  segment: ZoomSegment,
  edge: 'start' | 'end',
  tMs: number,
  durationMs = 0,
): ZoomSegment {
  const target = Number.isFinite(tMs) ? tMs : edge === 'start' ? segment.startMs : segment.endMs
  const upper =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  if (edge === 'start') {
    const maxStart = Math.max(0, segment.peakMs - MIN_ZOOM_EDGE_MS)
    const startMs = Math.max(0, Math.min(maxStart, target))
    return { ...segment, startMs }
  }
  const minEnd = segment.holdEndMs + MIN_ZOOM_EDGE_MS
  const endMs = Math.max(minEnd, Math.min(upper, target))
  return { ...segment, endMs: Math.max(segment.peakMs, endMs) }
}

/**
 * Apply one override onto a base auto segment. Returns null when disabled.
 * Timing fields rebuild absolute in/hold/out around the (optional) peak.
 */
export function applyOneZoomOverride(
  segment: ZoomSegment,
  ov: ZoomPointOverride | null | undefined,
  durationMs = 0,
): ZoomSegment | null {
  if (ov && ov.enabled === false) return null
  if (!ov) return segment
  let patched: ZoomSegment = {
    ...segment,
    ...(ov.peakScale != null ? { peakScale: clampZoomPeakScale(ov.peakScale) } : {}),
    ...(ov.focusX != null ? { focusX: clamp01(ov.focusX) } : {}),
    ...(ov.focusY != null ? { focusY: clamp01(ov.focusY) } : {}),
  }
  const hasTiming =
    ov.peakMs != null ||
    ov.zoomInMs != null ||
    ov.holdMs != null ||
    ov.zoomOutMs != null
  if (hasTiming) {
    patched = rebuildZoomSegmentTiming(
      patched,
      {
        ...(ov.peakMs != null ? { peakMs: ov.peakMs } : {}),
        ...(ov.zoomInMs != null ? { zoomInMs: ov.zoomInMs } : {}),
        ...(ov.holdMs != null ? { holdMs: ov.holdMs } : {}),
        ...(ov.zoomOutMs != null ? { zoomOutMs: ov.zoomOutMs } : {}),
      },
      durationMs,
    )
  }
  return patched
}

/**
 * Resize an auto zoom's start/end edge and upsert timing onto overrides
 * (non-destruktif; preview ≡ export via applyZoomPointOverrides).
 */
export function resizeAutoZoomEdge(
  baseSegments: ZoomSegment[],
  overrides: ZoomPointOverride[],
  index: number,
  edge: 'start' | 'end',
  tMs: number,
  durationMs = 0,
): ZoomPointOverride[] {
  if (!Number.isInteger(index) || index < 0 || index >= baseSegments.length) {
    return overrides
  }
  const existing = overrides.find((o) => o.index === index)
  const current = applyOneZoomOverride(baseSegments[index]!, existing, durationMs)
  if (!current) return overrides
  const resized = resizeZoomSegmentEdge(current, edge, tMs, durationMs)
  const timing = zoomSegmentTiming(resized)
  return upsertZoomPointOverride(overrides, {
    index,
    enabled: existing?.enabled !== false,
    ...(existing?.peakScale != null ? { peakScale: existing.peakScale } : {}),
    ...(existing?.focusX != null ? { focusX: existing.focusX } : {}),
    ...(existing?.focusY != null ? { focusY: existing.focusY } : {}),
    peakMs: timing.peakMs,
    zoomInMs: timing.zoomInMs,
    holdMs: timing.holdMs,
    zoomOutMs: timing.zoomOutMs,
  })
}

/**
 * Resize a manual zoom's start/end edge (stores timing on the point).
 */
export function resizeManualZoomEdge(
  points: ManualZoomPoint[],
  id: string,
  edge: 'start' | 'end',
  tMs: number,
  durationMs = 0,
): ManualZoomPoint[] {
  const idx = points.findIndex((p) => p.id === id)
  if (idx < 0) return points
  const currentPoint = points[idx]!
  const seg = manualZoomToSegment(currentPoint)
  if (!seg) return points
  const resized = resizeZoomSegmentEdge(seg, edge, tMs, durationMs)
  const timing = zoomSegmentTiming(resized)
  const copy = points.slice()
  copy[idx] = {
    ...currentPoint,
    peakMs: timing.peakMs,
    zoomInMs: timing.zoomInMs,
    holdMs: timing.holdMs,
    zoomOutMs: timing.zoomOutMs,
  }
  return copy
}

/** Move a manual zoom's peak (rebuilds timing via manualZoomToSegment). */
export function moveManualZoomPeak(
  points: ManualZoomPoint[],
  id: string,
  newPeakMs: number,
  durationMs = 0,
): ManualZoomPoint[] {
  const idx = points.findIndex((p) => p.id === id)
  if (idx < 0) return points
  const current = points[idx]!
  const upper =
    Number.isFinite(durationMs) && durationMs > 0 ? durationMs : Number.POSITIVE_INFINITY
  const peakMs = Math.max(0, Math.min(upper, Number.isFinite(newPeakMs) ? newPeakMs : 0))
  if (peakMs === current.peakMs) return points
  const copy = points.slice()
  copy[idx] = { ...current, peakMs }
  return copy
}

/**
 * Nudge a zoom focus point within the frame (0–1), clamped.
 * Matches camera-style fine control: small step, Shift = larger.
 */
export function nudgeZoomFocus(
  focusX: number,
  focusY: number,
  direction: ZoomFocusNudgeDirection,
  options: { shift?: boolean } = {},
): { focusX: number; focusY: number } {
  const step = options.shift
    ? ZOOM_FOCUS_NUDGE_STEP_SHIFT
    : ZOOM_FOCUS_NUDGE_STEP
  let x = clamp01(focusX)
  let y = clamp01(focusY)
  switch (direction) {
    case 'left':
      x = clamp01(x - step)
      break
    case 'right':
      x = clamp01(x + step)
      break
    case 'up':
      y = clamp01(y - step)
      break
    case 'down':
      y = clamp01(y + step)
      break
  }
  return { focusX: x, focusY: y }
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
  const cleaned: ManualZoomPoint = {
    id: point.id,
    peakMs: Math.max(0, Number.isFinite(point.peakMs) ? point.peakMs : 0),
    focusX: clamp01(point.focusX),
    focusY: clamp01(point.focusY),
    peakScale: clampZoomPeakScale(point.peakScale ?? 1.6),
    enabled: point.enabled !== false,
  }
  if (point.zoomInMs != null && Number.isFinite(point.zoomInMs)) {
    cleaned.zoomInMs = Math.max(0, point.zoomInMs)
  }
  if (point.holdMs != null && Number.isFinite(point.holdMs)) {
    cleaned.holdMs = Math.max(0, point.holdMs)
  }
  if (point.zoomOutMs != null && Number.isFinite(point.zoomOutMs)) {
    cleaned.zoomOutMs = Math.max(0, point.zoomOutMs)
  }
  return cleaned
}

/** Map an enabled manual point → ZoomSegment (same timing as auto-zoom defaults). */
export function manualZoomToSegment(
  point: ManualZoomPoint,
  timing: Partial<ManualZoomTiming> = {},
): ZoomSegment | null {
  const normalized = normalizeManualZoomPoint(point)
  if (!normalized || !normalized.enabled) return null
  const zoomInMs =
    timing.zoomInMs ??
    normalized.zoomInMs ??
    DEFAULT_MANUAL_TIMING.zoomInMs
  const holdMs =
    timing.holdMs ?? normalized.holdMs ?? DEFAULT_MANUAL_TIMING.holdMs
  const zoomOutMs =
    timing.zoomOutMs ??
    normalized.zoomOutMs ??
    DEFAULT_MANUAL_TIMING.zoomOutMs
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

function cleanOverride(item: ZoomPointOverride): ZoomPointOverride {
  const cleaned: ZoomPointOverride = {
    index: item.index,
    enabled: item.enabled !== false,
  }
  if (item.peakScale != null) {
    cleaned.peakScale = clampZoomPeakScale(item.peakScale)
  }
  if (item.focusX != null) cleaned.focusX = clamp01(item.focusX)
  if (item.focusY != null) cleaned.focusY = clamp01(item.focusY)
  if (item.peakMs != null && Number.isFinite(item.peakMs)) {
    cleaned.peakMs = Math.max(0, item.peakMs)
  }
  if (item.zoomInMs != null && Number.isFinite(item.zoomInMs)) {
    cleaned.zoomInMs = Math.max(0, item.zoomInMs)
  }
  if (item.holdMs != null && Number.isFinite(item.holdMs)) {
    cleaned.holdMs = Math.max(0, item.holdMs)
  }
  if (item.zoomOutMs != null && Number.isFinite(item.zoomOutMs)) {
    cleaned.zoomOutMs = Math.max(0, item.zoomOutMs)
  }
  return cleaned
}

function overrideMap(
  overrides: ZoomPointOverride[] | null | undefined,
): Map<number, ZoomPointOverride> {
  const map = new Map<number, ZoomPointOverride>()
  if (!overrides) return map
  for (const item of overrides) {
    if (!Number.isInteger(item.index) || item.index < 0) continue
    map.set(item.index, cleanOverride(item))
  }
  return map
}

/**
 * Apply per-point edits onto auto-built segments.
 * Disabled points are dropped; enabled points may get custom peakScale / focus / timing.
 */
export function applyZoomPointOverrides(
  segments: ZoomSegment[],
  overrides: ZoomPointOverride[] | null | undefined,
  durationMs = 0,
): ZoomSegment[] {
  if (!overrides || overrides.length === 0) return segments
  const map = overrideMap(overrides)
  const next: ZoomSegment[] = []
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    const ov = map.get(i)
    const patched = applyOneZoomOverride(seg, ov, durationMs)
    if (patched) next.push(patched)
  }
  return next
}

/** Upsert one override by segment index (immutable). */
export function upsertZoomPointOverride(
  overrides: ZoomPointOverride[],
  next: ZoomPointOverride,
): ZoomPointOverride[] {
  const cleaned = cleanOverride(next)
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

/** Resolve focus for a segment (override or click-derived default). */
export function resolveZoomPointFocus(
  segment: ZoomSegment,
  index: number,
  overrides: ZoomPointOverride[] | null | undefined,
): { focusX: number; focusY: number } {
  const ov = overrides?.find((o) => o.index === index)
  return {
    focusX: ov?.focusX != null ? clamp01(ov.focusX) : clamp01(segment.focusX),
    focusY: ov?.focusY != null ? clamp01(ov.focusY) : clamp01(segment.focusY),
  }
}

/** Resolve peak time for a segment (override or click-derived default). */
export function resolveZoomPointPeakMs(
  segment: ZoomSegment,
  index: number,
  overrides: ZoomPointOverride[] | null | undefined,
): number {
  const ov = overrides?.find((o) => o.index === index)
  if (ov?.peakMs != null && Number.isFinite(ov.peakMs)) {
    return Math.max(0, ov.peakMs)
  }
  return Math.max(0, segment.peakMs)
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
