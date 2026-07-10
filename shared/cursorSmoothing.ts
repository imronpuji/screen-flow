/**
 * Cursor smoothing + click ring effects for preview playback.
 * Pure functions — smoke-tested in CI without Electron.
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

export interface CursorKeyframe {
  t: number
  x: number
  y: number
}

export interface NormalizedPoint {
  x: number
  y: number
}

export interface ClickRing {
  tMs: number
  x: number
  y: number
}

export interface ActiveClickRing {
  x: number
  y: number
  scale: number
  opacity: number
}

/** Soft filled auto-highlight pulse (same fields as ring; longer / larger animation). */
export type ActiveClickHighlight = ActiveClickRing

export interface CursorSmoothingOptions {
  /** Time window (ms) for weighted averaging — reduces jitter. */
  smoothingWindowMs?: number
  /** Click ring animation length (ms). */
  ringDurationMs?: number
  /** Soft auto-highlight pulse length (ms). */
  highlightDurationMs?: number
  /**
   * Captured display geometry (DIP). When set, positions use screen→frame mapping.
   * When omitted, assumes cursor x/y are already video pixels.
   */
  geometry?: CaptureGeometry
}

const DEFAULT_OPTIONS: Required<Omit<CursorSmoothingOptions, 'geometry'>> & {
  geometry?: CaptureGeometry
} = {
  smoothingWindowMs: 48,
  ringDurationMs: 450,
  highlightDurationMs: 700,
  geometry: undefined,
}

/** Cubic ease-in-out — mirrors shared/autozoom.ts for standalone smoke tests. */
function easeCubicInOut(t: number): number {
  const x = Math.max(0, Math.min(1, t))
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}

function normalizePoint(
  x: number,
  y: number,
  videoSize: VideoSize,
  geometry?: CaptureGeometry,
): NormalizedPoint {
  if (geometry) {
    const focus = mapScreenToNormalized(x, y, geometry)
    return { x: focus.focusX, y: focus.focusY }
  }
  const w = Math.max(1, videoSize.width)
  const h = Math.max(1, videoSize.height)
  return {
    x: Math.max(0, Math.min(1, x / w)),
    y: Math.max(0, Math.min(1, y / h)),
  }
}

function isPositionEvent(event: CursorEvent): boolean {
  return event.kind === 'move' || event.kind === 'down' || event.kind === 'click'
}

function isClickTrigger(event: CursorEvent): boolean {
  if (event.kind === 'click') return true
  if (event.kind === 'down') {
    return event.button === undefined || event.button === 0
  }
  return false
}

/** Extract chronological position samples from cursor JSONL events. */
export function buildCursorKeyframes(events: CursorEvent[]): CursorKeyframe[] {
  return events
    .filter(isPositionEvent)
    .map((e) => ({ t: e.t, x: e.x, y: e.y }))
    .sort((a, b) => a.t - b.t)
}

/** Build normalized click ring triggers from click/down events. */
export function buildClickRings(
  events: CursorEvent[],
  videoSize: VideoSize,
  options: CursorSmoothingOptions = {},
): ClickRing[] {
  const geometry = options.geometry
  return events
    .filter(isClickTrigger)
    .map((e) => {
      const { x, y } = normalizePoint(e.x, e.y, videoSize, geometry)
      return { tMs: e.t, x, y }
    })
    .sort((a, b) => a.tMs - b.tMs)
}

function interpolateRaw(
  tMs: number,
  keyframes: CursorKeyframe[],
): CursorKeyframe | null {
  if (keyframes.length === 0) return null
  if (tMs <= keyframes[0]!.t) return keyframes[0]!
  const last = keyframes[keyframes.length - 1]!
  if (tMs >= last.t) return last

  for (let i = 0; i < keyframes.length - 1; i++) {
    const a = keyframes[i]!
    const b = keyframes[i + 1]!
    if (tMs >= a.t && tMs <= b.t) {
      const span = b.t - a.t
      const u = span > 0 ? (tMs - a.t) / span : 0
      const eased = easeCubicInOut(u)
      return {
        t: tMs,
        x: a.x + (b.x - a.x) * eased,
        y: a.y + (b.y - a.y) * eased,
      }
    }
  }

  return last
}

/**
 * Smoothed cursor position at playback time.
 * Weighted average of nearby keyframes reduces jitter while preserving motion.
 */
export function getSmoothedCursorAtTime(
  tMs: number,
  keyframes: CursorKeyframe[],
  videoSize: VideoSize,
  options: CursorSmoothingOptions = {},
): NormalizedPoint | null {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  if (keyframes.length === 0) return null

  const windowMs = opts.smoothingWindowMs
  const neighbors = keyframes.filter((k) => Math.abs(k.t - tMs) <= windowMs)

  let x: number
  let y: number

  if (neighbors.length >= 2) {
    let totalW = 0
    x = 0
    y = 0
    for (const k of neighbors) {
      const w = 1 / (1 + Math.abs(k.t - tMs))
      x += k.x * w
      y += k.y * w
      totalW += w
    }
    x /= totalW
    y /= totalW
  } else {
    const raw = interpolateRaw(tMs, keyframes)
    if (!raw) return null
    x = raw.x
    y = raw.y
  }

  return normalizePoint(x, y, videoSize, opts.geometry)
}

/** Active click rings at playback time (scale + fade). */
export function getActiveClickRings(
  tMs: number,
  rings: ClickRing[],
  options: CursorSmoothingOptions = {},
): ActiveClickRing[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const duration = opts.ringDurationMs

  return rings
    .filter((ring) => tMs >= ring.tMs && tMs < ring.tMs + duration)
    .map((ring) => {
      const u = (tMs - ring.tMs) / duration
      const eased = easeCubicInOut(u)
      return {
        x: ring.x,
        y: ring.y,
        scale: 0.45 + eased * 1.35,
        opacity: Math.max(0, 1 - eased * 1.1),
      }
    })
}

/**
 * Soft filled auto-highlight pulses at click points (Screen Studio cue).
 * Longer + larger than the outline ring; same trigger list from buildClickRings.
 */
export function getActiveClickHighlights(
  tMs: number,
  rings: ClickRing[],
  options: CursorSmoothingOptions = {},
): ActiveClickHighlight[] {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const duration = opts.highlightDurationMs

  return rings
    .filter((ring) => tMs >= ring.tMs && tMs < ring.tMs + duration)
    .map((ring) => {
      const u = (tMs - ring.tMs) / duration
      const eased = easeCubicInOut(u)
      return {
        x: ring.x,
        y: ring.y,
        // Expand from ~55% → ~160% of base highlight diameter.
        scale: 0.55 + eased * 1.05,
        // Soft fade — stays readable mid-pulse then dissolves.
        opacity: Math.max(0, 0.55 * (1 - eased * 1.05)),
      }
    })
}
