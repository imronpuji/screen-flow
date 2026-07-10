/**
 * Timeline clip markers — zoom spans + click ticks + camera active ranges
 * for the review scrubber. Pure helpers; preview UI + smoke tests only (no Electron).
 */

import type { ZoomSegment } from './autozoom.js'
import type { CameraActiveRange } from './cameraSync.js'
import { closeOpenCameraActiveRanges, normalizeCameraActiveRanges } from './cameraSync.js'
import type { CursorEvent } from './cursor.js'
import {
  applyOneZoomOverride,
  isZoomPointEnabled,
  manualZoomToSegment,
  type ManualZoomPoint,
  type ZoomPointOverride,
} from './zoomPoints.js'

export type TimelineMarkerKind = 'zoom' | 'click' | 'camera'

export interface TimelineMarker {
  id: string
  kind: TimelineMarkerKind
  /** Seek target (ms) — zoom peak / click time / camera range start. */
  tMs: number
  /** Visual span start for zoom/camera markers; omitted for point markers. */
  startMs?: number
  /** Visual span end for zoom/camera markers; omitted for point markers. */
  endMs?: number
  /**
   * Hold→zoom-out boundary (ms) for zoom markers — scrubber hold-edge handle.
   * Omitted for camera/click markers.
   */
  holdEndMs?: number
  label: string
  /**
   * Index into materialized camera active ranges (camera markers only).
   * Used by scrubber edge-drag to resize the matching window.
   */
  rangeIndex?: number
  /**
   * Index into auto-built zoom segments (zoom markers only).
   * Used by scrubber drag to move the matching click zoom.
   */
  zoomIndex?: number
  /**
   * Manual zoom point id (zoom markers only).
   * Used by scrubber drag to move Add-at-playhead zooms.
   */
  manualZoomId?: string
}

export interface BuildTimelineMarkersOptions {
  /** Include raw click/down ticks (default true). */
  includeClicks?: boolean
  /** Max click ticks to keep UI readable (default 48). */
  maxClicks?: number
  /**
   * Mid-recording FaceTime active windows (wall ms from session start).
   * Empty / omitted → no camera markers (legacy always-on stays uncluttered).
   */
  cameraActiveRanges?: CameraActiveRange[] | null
  /** First screen chunk wall offset — maps wall ranges onto the screen timeline. */
  screenFirstChunkMs?: number | null
  /** Session wall duration; closes any still-open camera range. */
  wallDurationMs?: number
  /** Include camera active-range spans (default true when ranges provided). */
  includeCamera?: boolean
  /**
   * When set, zoom markers keep `zoomIndex` / `manualZoomId` for scrubber
   * drag (FOKUS 5). Falls back to anonymous `segments` argument when omitted.
   */
  autoZoomSegments?: ZoomSegment[] | null
  zoomPointOverrides?: ZoomPointOverride[] | null
  manualZoomPoints?: ManualZoomPoint[] | null
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
 * Map a wall-clock offset (ms from session startedAt) onto the screen timeline
 * (t=0 ≈ first screen chunk). Matches export `cameraOverlayEnableExpr` origin.
 */
export function wallMsToScreenTimelineMs(
  wallMs: number,
  screenFirstChunkMs: number | null | undefined,
): number {
  const origin = Math.max(0, screenFirstChunkMs ?? 0)
  return Math.max(0, wallMs - origin)
}

/**
 * Build camera active-range span markers (screen timeline).
 * Empty ranges → [] (always-on legacy recordings stay uncluttered).
 */
export function buildCameraActiveRangeMarkers(
  ranges: CameraActiveRange[] | null | undefined,
  options: {
    screenFirstChunkMs?: number | null
    wallDurationMs?: number
  } = {},
): TimelineMarker[] {
  const normalized = normalizeCameraActiveRanges(ranges ?? [])
  if (normalized.length === 0) return []

  const wall = Math.max(0, options.wallDurationMs ?? 0)
  const closed = closeOpenCameraActiveRanges(normalized, wall > 0 ? wall : Number.MAX_SAFE_INTEGER)
  const markers: TimelineMarker[] = []

  for (let i = 0; i < closed.length; i++) {
    const r = closed[i]!
    const endWall = r.endMs ?? wall
    if (endWall < r.startMs) continue
    const startMs = wallMsToScreenTimelineMs(r.startMs, options.screenFirstChunkMs)
    const endMs = wallMsToScreenTimelineMs(endWall, options.screenFirstChunkMs)
    if (endMs - startMs < 20) continue
    markers.push({
      id: `camera-${i}-${startMs}`,
      kind: 'camera',
      tMs: startMs,
      startMs,
      endMs: Math.max(startMs, endMs),
      label: `Camera ${i + 1}`,
      rangeIndex: i,
    })
  }

  return markers
}

/**
 * Resolve an auto zoom segment with overrides (peak / timing / focus / scale).
 * Matches preview + export apply path for a single index.
 */
export function resolveAutoZoomMarkerSegment(
  segment: ZoomSegment,
  index: number,
  overrides: ZoomPointOverride[] | null | undefined,
): ZoomSegment {
  const ov = overrides?.find((o) => o.index === index)
  return applyOneZoomOverride(segment, ov) ?? segment
}

/**
 * Build zoom-event markers with stable source ids for scrubber drag.
 * Disabled auto points are omitted; disabled manuals are omitted.
 */
export function buildZoomEventMarkers(
  autoSegments: ZoomSegment[],
  overrides: ZoomPointOverride[] | null | undefined,
  manualPoints: ManualZoomPoint[] | null | undefined,
): TimelineMarker[] {
  const markers: TimelineMarker[] = []
  let labelN = 0

  for (let i = 0; i < autoSegments.length; i++) {
    if (!isZoomPointEnabled(i, overrides)) continue
    const seg = resolveAutoZoomMarkerSegment(autoSegments[i]!, i, overrides)
    labelN += 1
    markers.push({
      id: `zoom-auto-${i}`,
      kind: 'zoom',
      tMs: seg.peakMs,
      startMs: seg.startMs,
      endMs: seg.endMs,
      holdEndMs: seg.holdEndMs,
      label: `Zoom ${labelN}`,
      zoomIndex: i,
    })
  }

  if (manualPoints) {
    for (const point of manualPoints) {
      const seg = manualZoomToSegment(point)
      if (!seg) continue
      labelN += 1
      markers.push({
        id: `zoom-manual-${point.id}`,
        kind: 'zoom',
        tMs: seg.peakMs,
        startMs: seg.startMs,
        endMs: seg.endMs,
        holdEndMs: seg.holdEndMs,
        label: `Zoom ${labelN}`,
        manualZoomId: point.id,
      })
    }
  }

  return markers
}

/**
 * Build scrubber markers from auto-zoom segments + optional click ticks +
 * optional camera active-range spans.
 * Zoom/camera markers use start→end as a span; zoom seek = peakMs, camera seek = start.
 */
export function buildTimelineMarkers(
  segments: ZoomSegment[],
  cursorEvents: CursorEvent[],
  options: BuildTimelineMarkersOptions = {},
): TimelineMarker[] {
  const includeClicks = options.includeClicks !== false
  const includeCamera = options.includeCamera !== false
  const maxClicks = options.maxClicks ?? 48
  const markers: TimelineMarker[] = []

  if (options.autoZoomSegments) {
    markers.push(
      ...buildZoomEventMarkers(
        options.autoZoomSegments,
        options.zoomPointOverrides,
        options.manualZoomPoints,
      ),
    )
  } else {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!
      markers.push({
        id: `zoom-${i}-${seg.startMs}`,
        kind: 'zoom',
        tMs: seg.peakMs,
        startMs: seg.startMs,
        endMs: seg.endMs,
        holdEndMs: seg.holdEndMs,
        label: `Zoom ${i + 1}`,
      })
    }
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

  if (includeCamera) {
    markers.push(
      ...buildCameraActiveRangeMarkers(options.cameraActiveRanges, {
        screenFirstChunkMs: options.screenFirstChunkMs,
        wallDurationMs: options.wallDurationMs,
      }),
    )
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
