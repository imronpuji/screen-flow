/**
 * Map global screen cursor coordinates → video frame space.
 *
 * Cursor JSONL stores screen DIP (points) from uIOhook / Electron
 * `screen.getCursorScreenPoint()`. Capture frames are physical pixels
 * (DIP × scaleFactor on Retina). Dividing DIP by video pixel width
 * shifts focus by 1/scaleFactor — this module fixes that.
 */

import type { CursorEvent } from './cursor.js'

export const CAPTURE_GEOMETRY_FILENAME = 'capture-geometry.json'

export interface VideoSize {
  width: number
  height: number
}

/**
 * Geometry of the captured display in the same DIP space as cursor events.
 * Persisted per session so preview/export share one mapping.
 */
export interface CaptureGeometry {
  /** Display origin in global screen DIP. */
  originX: number
  originY: number
  /** Display size in DIP (logical points). */
  widthDip: number
  heightDip: number
  /** Electron/CSS devicePixelRatio for this display. */
  scaleFactor: number
}

/** Identity geometry when video pixels already match cursor units (tests / legacy). */
export function identityCaptureGeometry(videoSize: VideoSize): CaptureGeometry {
  return {
    originX: 0,
    originY: 0,
    widthDip: Math.max(1, videoSize.width),
    heightDip: Math.max(1, videoSize.height),
    scaleFactor: 1,
  }
}

/**
 * Screen DIP → normalized focus 0–1 inside the captured display.
 * Clamped so off-display clicks still zoom to the nearest edge.
 */
export function mapScreenToNormalized(
  screenX: number,
  screenY: number,
  geometry: CaptureGeometry,
): { focusX: number; focusY: number } {
  const w = Math.max(1, geometry.widthDip)
  const h = Math.max(1, geometry.heightDip)
  return {
    focusX: Math.max(0, Math.min(1, (screenX - geometry.originX) / w)),
    focusY: Math.max(0, Math.min(1, (screenY - geometry.originY) / h)),
  }
}

/**
 * Screen DIP → pixel coordinates in the encoded video frame.
 * Uses display DIP size (not scaleFactor×DIP) so Retina stays centered:
 *   focus = (screen - origin) / sizeDip
 *   pixel = focus * videoSize
 */
export function mapScreenToVideoPixels(
  screenX: number,
  screenY: number,
  geometry: CaptureGeometry,
  videoSize: VideoSize,
): { x: number; y: number } {
  const { focusX, focusY } = mapScreenToNormalized(screenX, screenY, geometry)
  return {
    x: focusX * Math.max(1, videoSize.width),
    y: focusY * Math.max(1, videoSize.height),
  }
}

/**
 * Rewrite cursor events into video-pixel space so auto-zoom / cursor
 * helpers can keep using `x / videoWidth` normalization.
 */
export function remapCursorEventsToVideoPixels(
  events: CursorEvent[],
  geometry: CaptureGeometry,
  videoSize: VideoSize,
): CursorEvent[] {
  return events.map((event) => {
    const { x, y } = mapScreenToVideoPixels(event.x, event.y, geometry, videoSize)
    return {
      ...event,
      x: Math.round(x),
      y: Math.round(y),
    }
  })
}

export function isCaptureGeometry(value: unknown): value is CaptureGeometry {
  if (!value || typeof value !== 'object') return false
  const g = value as Record<string, unknown>
  return (
    typeof g.originX === 'number' &&
    typeof g.originY === 'number' &&
    typeof g.widthDip === 'number' &&
    typeof g.heightDip === 'number' &&
    typeof g.scaleFactor === 'number' &&
    g.widthDip > 0 &&
    g.heightDip > 0 &&
    g.scaleFactor > 0
  )
}
