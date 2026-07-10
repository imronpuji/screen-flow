/**
 * Timeline zoom viewport (FOKUS 5) — magnify the scrubber around the playhead
 * so fine trim / zoom / camera edits stay precise on long clips.
 * Pure helpers; preview UI + smoke tests only (no Electron).
 */

export const TIMELINE_ZOOM_MIN = 1
export const TIMELINE_ZOOM_MAX = 8

/** Discrete steps for +/- buttons and keyboard (= / -). */
export const TIMELINE_ZOOM_STEPS = [1, 1.5, 2, 3, 4, 6, 8] as const

export type TimelineZoomStep = (typeof TIMELINE_ZOOM_STEPS)[number]

export interface TimelineViewport {
  startMs: number
  endMs: number
}

export function clampTimelineZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return TIMELINE_ZOOM_MIN
  return Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, zoom))
}

/** Snap to nearest discrete step (prefs + UI). */
export function normalizeTimelineZoom(zoom: number): TimelineZoomStep {
  const clamped = clampTimelineZoom(zoom)
  let best: TimelineZoomStep = TIMELINE_ZOOM_STEPS[0]
  let bestDist = Math.abs(best - clamped)
  for (const step of TIMELINE_ZOOM_STEPS) {
    const dist = Math.abs(step - clamped)
    if (dist < bestDist) {
      best = step
      bestDist = dist
    }
  }
  return best
}

export function stepTimelineZoom(
  zoom: number,
  direction: 1 | -1,
): TimelineZoomStep {
  const current = normalizeTimelineZoom(zoom)
  const idx = TIMELINE_ZOOM_STEPS.indexOf(current)
  const next = Math.max(0, Math.min(TIMELINE_ZOOM_STEPS.length - 1, idx + direction))
  return TIMELINE_ZOOM_STEPS[next]!
}

export function formatTimelineZoom(zoom: number): string {
  const z = normalizeTimelineZoom(zoom)
  return Number.isInteger(z) ? `${z}×` : `${z}×`
}

/** Visible window length at the given zoom (full duration when zoom=1). */
export function visibleDurationMs(durationMs: number, zoom: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
  const z = clampTimelineZoom(zoom)
  return durationMs / z
}

/**
 * Build a viewport of length duration/zoom centered on anchorMs.
 * Clamped so the window stays inside [0, durationMs].
 */
export function resolveTimelineViewport(
  durationMs: number,
  zoom: number,
  anchorMs: number,
): TimelineViewport {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return { startMs: 0, endMs: 0 }
  }
  const windowMs = visibleDurationMs(durationMs, zoom)
  if (windowMs >= durationMs - 0.5) {
    return { startMs: 0, endMs: durationMs }
  }
  const anchor = Number.isFinite(anchorMs)
    ? Math.max(0, Math.min(durationMs, anchorMs))
    : durationMs / 2
  let start = anchor - windowMs / 2
  let end = start + windowMs
  if (start < 0) {
    start = 0
    end = windowMs
  }
  if (end > durationMs) {
    end = durationMs
    start = durationMs - windowMs
  }
  return { startMs: start, endMs: end }
}

/**
 * Pan viewport so playhead stays inside with a soft margin (default 15%).
 * No-op when already visible or zoom=1 (full clip).
 */
export function followPlayheadInViewport(
  viewport: TimelineViewport,
  playheadMs: number,
  durationMs: number,
  marginRatio = 0.15,
): TimelineViewport {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return viewport
  const windowMs = Math.max(0, viewport.endMs - viewport.startMs)
  if (windowMs <= 0 || windowMs >= durationMs - 0.5) {
    return { startMs: 0, endMs: durationMs }
  }
  const ph = Math.max(0, Math.min(durationMs, playheadMs))
  const margin = Math.max(0, Math.min(0.45, marginRatio)) * windowMs
  let start = viewport.startMs
  let end = viewport.endMs

  if (ph < start + margin) {
    start = Math.max(0, ph - margin)
    end = start + windowMs
  } else if (ph > end - margin) {
    end = Math.min(durationMs, ph + margin)
    start = end - windowMs
  } else {
    return viewport
  }

  if (start < 0) {
    start = 0
    end = windowMs
  }
  if (end > durationMs) {
    end = durationMs
    start = durationMs - windowMs
  }
  return { startMs: start, endMs: end }
}

/** Pan by a delta in ms (Shift+wheel). Keeps window length. */
export function panTimelineViewport(
  viewport: TimelineViewport,
  deltaMs: number,
  durationMs: number,
): TimelineViewport {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return viewport
  const windowMs = Math.max(0, viewport.endMs - viewport.startMs)
  if (windowMs <= 0 || windowMs >= durationMs - 0.5) {
    return { startMs: 0, endMs: durationMs }
  }
  const delta = Number.isFinite(deltaMs) ? deltaMs : 0
  let start = viewport.startMs + delta
  let end = start + windowMs
  if (start < 0) {
    start = 0
    end = windowMs
  }
  if (end > durationMs) {
    end = durationMs
    start = durationMs - windowMs
  }
  return { startMs: start, endMs: end }
}

/** Percent 0–100 along the visible viewport (clamped). */
export function viewportPercent(tMs: number, viewport: TimelineViewport): number {
  const span = viewport.endMs - viewport.startMs
  if (span <= 0) return 0
  return Math.max(0, Math.min(100, ((tMs - viewport.startMs) / span) * 100))
}

/**
 * Map a pointer X on the track to timeline ms via the current viewport.
 */
export function clientXToTimelineMs(
  clientX: number,
  trackLeft: number,
  trackWidth: number,
  viewport: TimelineViewport,
): number {
  if (trackWidth <= 0) return viewport.startMs
  const ratio = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth))
  const span = Math.max(0, viewport.endMs - viewport.startMs)
  return viewport.startMs + ratio * span
}

/**
 * Left/width % for a span inside the viewport. Returns null when fully outside.
 */
export function viewportSpanPercent(
  startMs: number,
  endMs: number,
  viewport: TimelineViewport,
): { left: number; width: number } | null {
  const span = viewport.endMs - viewport.startMs
  if (span <= 0) return null
  const clippedStart = Math.max(startMs, viewport.startMs)
  const clippedEnd = Math.min(endMs, viewport.endMs)
  if (clippedEnd <= clippedStart) return null
  const left = ((clippedStart - viewport.startMs) / span) * 100
  const width = ((clippedEnd - clippedStart) / span) * 100
  return { left, width: Math.max(0.2, width) }
}
