/**
 * Timeline clip markers — zoom spans + click ticks for the review scrubber.
 * Pure helpers; preview UI + smoke tests only (no Electron).
 */

import type { ZoomSegment } from './autozoom.js'
import type { CursorEvent } from './cursor.js'

export type TimelineMarkerKind = 'zoom' | 'click'

export interface TimelineMarker {
  id: string
  kind: TimelineMarkerKind
  /** Seek target (ms) — zoom peak for spans, click time for ticks. */
  tMs: number
  /** Visual span start for zoom markers; omitted for point markers. */
  startMs?: number
  /** Visual span end for zoom markers; omitted for point markers. */
  endMs?: number
  label: string
}

export interface BuildTimelineMarkersOptions {
  /** Include raw click/down ticks (default true). */
  includeClicks?: boolean
  /** Max click ticks to keep UI readable (default 48). */
  maxClicks?: number
}

function isClickTrigger(event: CursorEvent): boolean {
  return event.kind === 'click' || event.kind === 'down'
}

/** Percent 0–100 along a timeline of `durationMs` (clamped). */
export function markerPercent(tMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0
  return Math.max(0, Math.min(100, (tMs / durationMs) * 100))
}

/**
 * Build scrubber markers from auto-zoom segments + optional click ticks.
 * Zoom markers use segment start→end as a span; seek target = peakMs.
 */
export function buildTimelineMarkers(
  segments: ZoomSegment[],
  cursorEvents: CursorEvent[],
  options: BuildTimelineMarkersOptions = {},
): TimelineMarker[] {
  const includeClicks = options.includeClicks !== false
  const maxClicks = options.maxClicks ?? 48
  const markers: TimelineMarker[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!
    markers.push({
      id: `zoom-${i}-${seg.startMs}`,
      kind: 'zoom',
      tMs: seg.peakMs,
      startMs: seg.startMs,
      endMs: seg.endMs,
      label: `Zoom ${i + 1}`,
    })
  }

  if (includeClicks) {
    const clicks = cursorEvents.filter(isClickTrigger).sort((a, b) => a.t - b.t)
    const step = clicks.length > maxClicks ? Math.ceil(clicks.length / maxClicks) : 1
    let shown = 0
    for (let i = 0; i < clicks.length; i += step) {
      const event = clicks[i]!
      markers.push({
        id: `click-${event.t}-${i}`,
        kind: 'click',
        tMs: event.t,
        label: `Click ${shown + 1}`,
      })
      shown += 1
      if (shown >= maxClicks) break
    }
  }

  return markers.sort((a, b) => a.tMs - b.tMs || a.kind.localeCompare(b.kind))
}

/** Markers that overlap the trim window (inclusive). */
export function markersInTrimRange(
  markers: TimelineMarker[],
  trimStartMs: number,
  trimEndMs: number,
): TimelineMarker[] {
  const start = Math.min(trimStartMs, trimEndMs)
  const end = Math.max(trimStartMs, trimEndMs)
  return markers.filter((m) => {
    const spanStart = m.startMs ?? m.tMs
    const spanEnd = m.endMs ?? m.tMs
    return spanEnd >= start && spanStart <= end
  })
}
