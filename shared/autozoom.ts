/**
 * Auto-zoom engine — reads cursor click events and produces smooth zoom keyframes.
 * Pure functions only; used by renderer preview and ffmpeg export bake.
 */

import type { CursorEvent } from './cursor.js'
import {
  mapScreenToNormalized,
  type CaptureGeometry,
} from './cursorCoords.js'

export interface VideoSize {
  width: number
  height: number
}

export interface AutoZoomOptions {
  /** Magnification at peak (1.6 = 60% closer). */
  peakScale?: number
  zoomInMs?: number
  holdMs?: number
  zoomOutMs?: number
  /**
   * Clicks closer than this (ms) merge into one segment (latest focus wins).
   * Prevents jittery zoom-hopping from double-clicks / rapid UI taps.
   */
  mergeWindowMs?: number
  /**
   * When true, a click during zoom-in/hold retargets that segment's focus
   * instead of queueing another zoom after it ends.
   */
  retargetActive?: boolean
  /**
   * Captured display geometry (DIP). When set, focus uses screen→frame mapping
   * (Retina / multi-monitor). When omitted, assumes cursor x/y are already
   * video pixels (legacy / remapped events).
   */
  geometry?: CaptureGeometry
}

export interface ZoomSegment {
  startMs: number
  peakMs: number
  holdEndMs: number
  endMs: number
  /** Normalized focus point 0–1 within the video frame. */
  focusX: number
  focusY: number
  peakScale: number
}

export interface ZoomTransform {
  scale: number
  focusX: number
  focusY: number
}

const DEFAULT_OPTIONS: Required<Omit<AutoZoomOptions, 'geometry'>> & {
  geometry?: CaptureGeometry
} = {
  peakScale: 1.6,
  zoomInMs: 400,
  holdMs: 800,
  zoomOutMs: 500,
  mergeWindowMs: 320,
  retargetActive: true,
  geometry: undefined,
}

export function parseCursorJsonl(text: string): CursorEvent[] {
  const events: CursorEvent[] = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parsed = JSON.parse(trimmed) as CursorEvent
    if (
      typeof parsed.t !== 'number' ||
      typeof parsed.x !== 'number' ||
      typeof parsed.y !== 'number' ||
      typeof parsed.kind !== 'string'
    ) {
      throw new Error('Invalid cursor event line')
    }
    events.push(parsed)
  }
  return events
}

/** Cubic ease-in-out for smooth Screen Studio–style zoom ramps. */
export function easeCubicInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function normalizeFocus(
  x: number,
  y: number,
  videoSize: VideoSize,
  geometry?: CaptureGeometry,
): { focusX: number; focusY: number } {
  if (geometry) {
    return mapScreenToNormalized(x, y, geometry)
  }
  const w = Math.max(1, videoSize.width)
  const h = Math.max(1, videoSize.height)
  return {
    focusX: Math.max(0, Math.min(1, x / w)),
    focusY: Math.max(0, Math.min(1, y / h)),
  }
}

function isZoomTrigger(event: CursorEvent): boolean {
  if (event.kind === 'click') return true
  if (event.kind === 'down') {
    // Prefer explicit clicks; down covers platforms that skip click events.
    return event.button === undefined || event.button === 0
  }
  return false
}

function makeSegment(
  startMs: number,
  focusX: number,
  focusY: number,
  opts: Required<Omit<AutoZoomOptions, 'geometry'>>,
): ZoomSegment {
  const peakMs = startMs + opts.zoomInMs
  const holdEndMs = peakMs + opts.holdMs
  const endMs = holdEndMs + opts.zoomOutMs
  return {
    startMs,
    peakMs,
    holdEndMs,
    endMs,
    focusX,
    focusY,
    peakScale: opts.peakScale,
  }
}

/**
 * Build non-overlapping zoom segments from click/down events.
 * Rapid clicks merge / retarget (anti-jitter). Overlapping leftovers shift after previous end.
 */
export function buildZoomSegments(
  events: CursorEvent[],
  videoSize: VideoSize,
  options: AutoZoomOptions = {},
): ZoomSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const triggers = events.filter(isZoomTrigger).sort((a, b) => a.t - b.t)
  const segments: ZoomSegment[] = []
  let lastTriggerT = -Infinity

  for (const event of triggers) {
    const { focusX, focusY } = normalizeFocus(
      event.x,
      event.y,
      videoSize,
      opts.geometry,
    )

    // Anti-jitter: merge into previous segment when clicks are too close in time.
    if (segments.length > 0 && event.t - lastTriggerT < opts.mergeWindowMs) {
      const prev = segments[segments.length - 1]!
      prev.focusX = focusX
      prev.focusY = focusY
      lastTriggerT = event.t
      continue
    }

    // Retarget active zoom-in/hold instead of queueing a delayed hop.
    if (opts.retargetActive && segments.length > 0) {
      const active = segments[segments.length - 1]!
      if (event.t >= active.startMs && event.t < active.holdEndMs) {
        active.focusX = focusX
        active.focusY = focusY
        lastTriggerT = event.t
        continue
      }
    }

    const startMs =
      segments.length > 0
        ? Math.max(event.t, segments[segments.length - 1]!.endMs)
        : event.t

    segments.push(makeSegment(startMs, focusX, focusY, opts))
    lastTriggerT = event.t
  }

  return segments
}

function scaleInSegment(tMs: number, segment: ZoomSegment): number {
  if (tMs < segment.startMs || tMs >= segment.endMs) return 1

  if (tMs < segment.peakMs) {
    const u = (tMs - segment.startMs) / (segment.peakMs - segment.startMs)
    return 1 + (segment.peakScale - 1) * easeCubicInOut(u)
  }
  if (tMs < segment.holdEndMs) {
    return segment.peakScale
  }
  const u = (tMs - segment.holdEndMs) / (segment.endMs - segment.holdEndMs)
  return segment.peakScale - (segment.peakScale - 1) * easeCubicInOut(u)
}

/**
 * Sample zoom transform at playback time (ms).
 * When multiple segments overlap (shouldn't after build), latest segment wins.
 */
export function getZoomTransformAtTime(
  tMs: number,
  segments: ZoomSegment[],
): ZoomTransform {
  let active: ZoomSegment | null = null
  for (const segment of segments) {
    if (tMs >= segment.startMs && tMs < segment.endMs) {
      if (!active || segment.startMs >= active.startMs) {
        active = segment
      }
    }
  }

  if (!active) {
    return { scale: 1, focusX: 0.5, focusY: 0.5 }
  }

  return {
    scale: scaleInSegment(tMs, active),
    focusX: active.focusX,
    focusY: active.focusY,
  }
}
