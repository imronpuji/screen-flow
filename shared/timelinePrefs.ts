/**
 * Persist review timeline chrome (ripple delete + magnetic snap + zoom)
 * across sessions.
 */

import {
  normalizeTimelineZoom,
  type TimelineZoomStep,
  TIMELINE_ZOOM_MIN,
} from './timelineZoom.js'

export const TIMELINE_PREFS_STORAGE_KEY = 'screen-flow:timeline-prefs'

export interface TimelinePrefs {
  /** When true, Delete merges touching survivors after removing a keep-range. */
  rippleDeleteEnabled: boolean
  /**
   * When true, scrubbing the playhead sticks to nearby edit points
   * (keep edges, trim, zoom/click/camera markers).
   */
  magneticSnapEnabled: boolean
  /**
   * Scrubber magnification (1× = full clip). Discrete steps 1…8.
   * Higher zoom = shorter visible window around the playhead.
   */
  timelineZoom: TimelineZoomStep
}

export const DEFAULT_TIMELINE_PREFS: TimelinePrefs = {
  rippleDeleteEnabled: false,
  /** Default on — Screen Studio-like sticky scrub for orang awam. */
  magneticSnapEnabled: true,
  timelineZoom: TIMELINE_ZOOM_MIN as TimelineZoomStep,
}

export function normalizeTimelinePrefs(
  partial?: Partial<TimelinePrefs> | null,
): TimelinePrefs {
  return {
    rippleDeleteEnabled: partial?.rippleDeleteEnabled === true,
    // Legacy prefs without the key → on (match DEFAULT).
    magneticSnapEnabled: partial?.magneticSnapEnabled !== false,
    timelineZoom: normalizeTimelineZoom(
      partial?.timelineZoom ?? TIMELINE_ZOOM_MIN,
    ),
  }
}

export function loadTimelinePrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): TimelinePrefs {
  try {
    const raw = storage.getItem(TIMELINE_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_TIMELINE_PREFS }
    const parsed = JSON.parse(raw) as Partial<TimelinePrefs>
    return normalizeTimelinePrefs(parsed)
  } catch {
    return { ...DEFAULT_TIMELINE_PREFS }
  }
}

export function saveTimelinePrefs(
  prefs: TimelinePrefs,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(
      TIMELINE_PREFS_STORAGE_KEY,
      JSON.stringify(normalizeTimelinePrefs(prefs)),
    )
  } catch {
    /* private mode / quota — ignore */
  }
}
