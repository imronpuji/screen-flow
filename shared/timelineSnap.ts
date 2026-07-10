/**
 * Magnetic timeline snapping (FOKUS 5) — playhead sticks to nearby edit points
 * while scrubbing (keep edges, trim, zoom/click/camera markers).
 * Pure helpers; preview UI + smoke tests only (no Electron).
 */

import type { KeepRange } from './keepRanges.js'
import type { TimelineMarker } from './timelineMarkers.js'

export type TimelineSnapKind =
  | 'start'
  | 'end'
  | 'trim-in'
  | 'trim-out'
  | 'keep-edge'
  | 'zoom'
  | 'click'
  | 'camera-edge'
  | 'marker'

export interface TimelineSnapTarget {
  tMs: number
  kind: TimelineSnapKind
  id?: string
}

export interface CollectTimelineSnapTargetsOptions {
  durationMs: number
  trimStartMs?: number
  trimEndMs?: number
  keepRanges?: KeepRange[] | null
  markers?: TimelineMarker[] | null
}

/** Default sticky radius when duration is unknown. */
export const DEFAULT_MAGNETIC_SNAP_THRESHOLD_MS = 120

/**
 * Scale snap radius with clip length so short clips stay precise and long
 * clips still feel magnetic (~1.2% of duration, clamped 80–250ms).
 */
export function magneticSnapThresholdMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return DEFAULT_MAGNETIC_SNAP_THRESHOLD_MS
  }
  return Math.max(80, Math.min(250, Math.round(durationMs * 0.012)))
}

function pushTarget(
  out: TimelineSnapTarget[],
  tMs: number,
  kind: TimelineSnapKind,
  id?: string,
): void {
  if (!Number.isFinite(tMs)) return
  out.push(id ? { tMs, kind, id } : { tMs, kind })
}

/** Deduplicate targets within 1ms (keep first kind). */
export function dedupeTimelineSnapTargets(
  targets: TimelineSnapTarget[],
): TimelineSnapTarget[] {
  const sorted = [...targets].sort(
    (a, b) => a.tMs - b.tMs || a.kind.localeCompare(b.kind),
  )
  const out: TimelineSnapTarget[] = []
  for (const t of sorted) {
    const prev = out[out.length - 1]
    if (prev && Math.abs(prev.tMs - t.tMs) <= 1) continue
    out.push(t)
  }
  return out
}

/**
 * Collect snap points from trim / keep-ranges / timeline markers.
 * Always includes clip start (0) and end when duration is known.
 */
export function collectTimelineSnapTargets(
  options: CollectTimelineSnapTargetsOptions,
): TimelineSnapTarget[] {
  const durationMs = Math.max(0, options.durationMs)
  const raw: TimelineSnapTarget[] = []

  pushTarget(raw, 0, 'start', 'clip-start')
  if (durationMs > 0) {
    pushTarget(raw, durationMs, 'end', 'clip-end')
  }

  if (options.trimStartMs != null && Number.isFinite(options.trimStartMs)) {
    pushTarget(raw, Math.max(0, options.trimStartMs), 'trim-in', 'trim-in')
  }
  if (options.trimEndMs != null && Number.isFinite(options.trimEndMs)) {
    pushTarget(
      raw,
      Math.max(0, options.trimEndMs),
      'trim-out',
      'trim-out',
    )
  }

  const ranges = options.keepRanges
  if (ranges) {
    for (let i = 0; i < ranges.length; i++) {
      const r = ranges[i]!
      pushTarget(raw, r.startMs, 'keep-edge', `keep-${i}-start`)
      pushTarget(raw, r.endMs, 'keep-edge', `keep-${i}-end`)
    }
  }

  const markers = options.markers
  if (markers) {
    for (const m of markers) {
      if (m.kind === 'zoom') {
        pushTarget(raw, m.tMs, 'zoom', m.id)
        if (m.startMs != null) pushTarget(raw, m.startMs, 'zoom', `${m.id}-start`)
        if (m.endMs != null) pushTarget(raw, m.endMs, 'zoom', `${m.id}-end`)
      } else if (m.kind === 'click') {
        pushTarget(raw, m.tMs, 'click', m.id)
      } else if (m.kind === 'camera') {
        pushTarget(raw, m.tMs, 'camera-edge', m.id)
        if (m.startMs != null) {
          pushTarget(raw, m.startMs, 'camera-edge', `${m.id}-start`)
        }
        if (m.endMs != null) {
          pushTarget(raw, m.endMs, 'camera-edge', `${m.id}-end`)
        }
      } else {
        pushTarget(raw, m.tMs, 'marker', m.id)
      }
    }
  }

  // Clamp into [0, duration] when duration known.
  const clamped =
    durationMs > 0
      ? raw.map((t) => ({
          ...t,
          tMs: Math.max(0, Math.min(durationMs, t.tMs)),
        }))
      : raw

  return dedupeTimelineSnapTargets(clamped)
}

export interface MagneticSnapResult {
  ms: number
  snapped: boolean
  target: TimelineSnapTarget | null
  /** Absolute distance to the chosen target (ms), or Infinity when none. */
  distanceMs: number
}

/**
 * Snap playhead to the nearest target within `thresholdMs`.
 * When several targets tie, prefer the earlier one (stable scrub left→right).
 */
export function snapPlayheadMagnetically(
  playheadMs: number,
  targets: TimelineSnapTarget[],
  thresholdMs: number = DEFAULT_MAGNETIC_SNAP_THRESHOLD_MS,
): MagneticSnapResult {
  const ph = Number.isFinite(playheadMs) ? playheadMs : 0
  const thr = Math.max(0, thresholdMs)
  if (targets.length === 0 || thr <= 0) {
    return { ms: ph, snapped: false, target: null, distanceMs: Infinity }
  }

  let best: TimelineSnapTarget | null = null
  let bestDist = Infinity
  for (const t of targets) {
    const dist = Math.abs(t.tMs - ph)
    if (dist > thr) continue
    if (
      dist < bestDist ||
      (dist === bestDist && best != null && t.tMs < best.tMs)
    ) {
      best = t
      bestDist = dist
    }
  }

  if (!best) {
    return { ms: ph, snapped: false, target: null, distanceMs: Infinity }
  }
  return {
    ms: best.tMs,
    snapped: Math.abs(best.tMs - ph) > 0.5,
    target: best,
    distanceMs: bestDist,
  }
}
