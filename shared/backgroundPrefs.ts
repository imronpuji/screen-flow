/**
 * Persist aesthetic background frame prefs across sessions (renderer localStorage).
 * Color preset + framing (padding/radius/shadow) restore on the next review so users
 * don't reconfigure every recording.
 */

import {
  DEFAULT_BACKGROUND_STYLE,
  normalizeBackgroundStyle,
  type BackgroundStyle,
} from './background.js'

export const BACKGROUND_PREFS_STORAGE_KEY = 'screen-flow:background-style'

export function loadBackgroundPrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): BackgroundStyle {
  try {
    const raw = storage.getItem(BACKGROUND_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_BACKGROUND_STYLE }
    const parsed = JSON.parse(raw) as Partial<BackgroundStyle>
    return normalizeBackgroundStyle({
      ...DEFAULT_BACKGROUND_STYLE,
      ...parsed,
    })
  } catch {
    return { ...DEFAULT_BACKGROUND_STYLE }
  }
}

export function saveBackgroundPrefs(
  style: BackgroundStyle,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    const normalized = normalizeBackgroundStyle(style)
    storage.setItem(BACKGROUND_PREFS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Clear saved prefs (tests / reset). */
export function clearBackgroundPrefs(
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  try {
    storage.removeItem(BACKGROUND_PREFS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
