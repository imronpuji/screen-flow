/**
 * Persist modifiable cursor appearance prefs across sessions (renderer localStorage).
 * Style / size / spotlight restore on the next review so users don't reconfigure every recording.
 */

import {
  DEFAULT_CURSOR_APPEARANCE,
  normalizeCursorAppearance,
  type CursorAppearance,
} from './cursorAppearance.js'

export const CURSOR_PREFS_STORAGE_KEY = 'screen-flow:cursor-appearance'

export function loadCursorPrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): CursorAppearance {
  try {
    const raw = storage.getItem(CURSOR_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CURSOR_APPEARANCE }
    const parsed = JSON.parse(raw) as Partial<CursorAppearance>
    return normalizeCursorAppearance({
      ...DEFAULT_CURSOR_APPEARANCE,
      ...parsed,
    })
  } catch {
    return { ...DEFAULT_CURSOR_APPEARANCE }
  }
}

export function saveCursorPrefs(
  appearance: CursorAppearance,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    const normalized = normalizeCursorAppearance(appearance)
    storage.setItem(CURSOR_PREFS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Clear saved prefs (tests / reset). */
export function clearCursorPrefs(
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  try {
    storage.removeItem(CURSOR_PREFS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
