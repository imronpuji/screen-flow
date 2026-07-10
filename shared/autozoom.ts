/**
 * Auto-zoom engine — reads cursor click events and produces smooth zoom keyframes.
 * Pure functions only; used by renderer preview and future ffmpeg composite.
 */

import type { CursorEvent } from './cursor.js'

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

const DEFAULT_OPTIONS: Required<AutoZoomOptions> = {
  peakScale: 1.6,
  zoomInMs: 400,
  holdMs: 800,
  zoomOutMs: 500,
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
): { focusX: number; focusY: number } {
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

/**
 * Build non-overlapping zoom segments from click/down events.
 * Segments that would overlap are shifted to start after the previous ends.
 */
export function buildZoomSegments(
  events: CursorEvent[],
  videoSize: VideoSize,
  options: AutoZoomOptions = {},
): ZoomSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const triggers = events.filter(isZoomTrigger).sort((a, b) => a.t - b.t)
  const segments: ZoomSegment[] = []
  let cursorEnd = 0

  for (const event of triggers) {
    const startMs = Math.max(event.t, cursorEnd)
    const peakMs = startMs + opts.zoomInMs
    const holdEndMs = peakMs + opts.holdMs
    const endMs = holdEndMs + opts.zoomOutMs
    const { focusX, focusY } = normalizeFocus(event.x, event.y, videoSize)

    segments.push({
      startMs,
      peakMs,
      holdEndMs,
      endMs,
      focusX,
      focusY,
      peakScale: opts.peakScale,
    })
    cursorEnd = endMs
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
