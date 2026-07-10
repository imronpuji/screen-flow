/**
 * Persist review timeline chrome (ripple delete toggle) across sessions.
 */

export const TIMELINE_PREFS_STORAGE_KEY = 'screen-flow:timeline-prefs'

export interface TimelinePrefs {
  /** When true, Delete merges touching survivors after removing a keep-range. */
  rippleDeleteEnabled: boolean
}

export const DEFAULT_TIMELINE_PREFS: TimelinePrefs = {
  rippleDeleteEnabled: false,
}

export function normalizeTimelinePrefs(
  partial?: Partial<TimelinePrefs> | null,
): TimelinePrefs {
  return {
    rippleDeleteEnabled: partial?.rippleDeleteEnabled === true,
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
