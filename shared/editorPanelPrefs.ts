/**
 * Persist review editor chrome (collapsible panels + sidebar) across sessions.
 */

import {
  DEFAULT_EDITOR_CHROME,
  normalizeEditorChrome,
  type EditorChromeState,
} from './editorPanels.js'

export const EDITOR_PANEL_PREFS_STORAGE_KEY = 'screen-flow:editor-panels'

export function loadEditorPanelPrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): EditorChromeState {
  try {
    const raw = storage.getItem(EDITOR_PANEL_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EDITOR_CHROME, panels: { ...DEFAULT_EDITOR_CHROME.panels } }
    const parsed = JSON.parse(raw) as Partial<EditorChromeState>
    return normalizeEditorChrome(parsed)
  } catch {
    return { ...DEFAULT_EDITOR_CHROME, panels: { ...DEFAULT_EDITOR_CHROME.panels } }
  }
}

export function saveEditorPanelPrefs(
  chrome: EditorChromeState,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    const normalized = normalizeEditorChrome(chrome)
    storage.setItem(EDITOR_PANEL_PREFS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode / quota — ignore */
  }
}

export function clearEditorPanelPrefs(
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  try {
    storage.removeItem(EDITOR_PANEL_PREFS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
