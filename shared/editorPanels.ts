/**
 * Collapsible property panels for the review editor (FOKUS 5 layout).
 * Open/closed state is UI chrome only — does not affect edit metadata or export.
 */

export const EDITOR_PANEL_IDS = [
  'zoom',
  'cursor',
  'background',
  'camera',
  'timeline',
  'export',
] as const

export type EditorPanelId = (typeof EDITOR_PANEL_IDS)[number]

export type EditorPanelOpenState = Record<EditorPanelId, boolean>

export interface EditorChromeState {
  /** Per-section accordion open flags. */
  panels: EditorPanelOpenState
  /** When true, the whole right editor column is hidden (preview-first). */
  sidebarCollapsed: boolean
}

export const EDITOR_PANEL_LABELS: Record<EditorPanelId, string> = {
  zoom: 'Zoom',
  cursor: 'Cursor',
  background: 'Background',
  camera: 'Camera',
  timeline: 'Timeline',
  export: 'Export',
}

/** Defaults: keep the most-used sections open; collapse the rest for calm chrome. */
export const DEFAULT_EDITOR_PANEL_OPEN: EditorPanelOpenState = {
  zoom: true,
  cursor: false,
  background: false,
  camera: true,
  timeline: true,
  export: false,
}

export const DEFAULT_EDITOR_CHROME: EditorChromeState = {
  panels: { ...DEFAULT_EDITOR_PANEL_OPEN },
  sidebarCollapsed: false,
}

export function isEditorPanelId(value: unknown): value is EditorPanelId {
  return typeof value === 'string' && (EDITOR_PANEL_IDS as readonly string[]).includes(value)
}

export function normalizeEditorPanelOpen(
  partial?: Partial<EditorPanelOpenState> | null,
): EditorPanelOpenState {
  const next = { ...DEFAULT_EDITOR_PANEL_OPEN }
  if (!partial || typeof partial !== 'object') return next
  for (const id of EDITOR_PANEL_IDS) {
    if (typeof partial[id] === 'boolean') next[id] = partial[id]!
  }
  return next
}

export function normalizeEditorChrome(
  partial?: Partial<EditorChromeState> & { panels?: Partial<EditorPanelOpenState> } | null,
): EditorChromeState {
  if (!partial || typeof partial !== 'object') {
    return {
      panels: { ...DEFAULT_EDITOR_PANEL_OPEN },
      sidebarCollapsed: false,
    }
  }
  return {
    panels: normalizeEditorPanelOpen(partial.panels),
    sidebarCollapsed: Boolean(partial.sidebarCollapsed),
  }
}

export function toggleEditorPanel(
  panels: EditorPanelOpenState,
  id: EditorPanelId,
): EditorPanelOpenState {
  return { ...panels, [id]: !panels[id] }
}

export function setEditorPanelOpen(
  panels: EditorPanelOpenState,
  id: EditorPanelId,
  open: boolean,
): EditorPanelOpenState {
  return { ...panels, [id]: open }
}

export function expandAllEditorPanels(): EditorPanelOpenState {
  const next = { ...DEFAULT_EDITOR_PANEL_OPEN }
  for (const id of EDITOR_PANEL_IDS) next[id] = true
  return next
}

export function collapseAllEditorPanels(): EditorPanelOpenState {
  const next = { ...DEFAULT_EDITOR_PANEL_OPEN }
  for (const id of EDITOR_PANEL_IDS) next[id] = false
  return next
}

/** Count how many panels are currently expanded. */
export function countOpenEditorPanels(panels: EditorPanelOpenState): number {
  let n = 0
  for (const id of EDITOR_PANEL_IDS) {
    if (panels[id]) n += 1
  }
  return n
}
