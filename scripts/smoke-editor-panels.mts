/**
 * Smoke checks for collapsible editor panel state + prefs (no Electron / DOM).
 */
import {
  EDITOR_PANEL_IDS,
  EDITOR_PANEL_LABELS,
  DEFAULT_EDITOR_CHROME,
  DEFAULT_EDITOR_PANEL_OPEN,
  collapseAllEditorPanels,
  countOpenEditorPanels,
  expandAllEditorPanels,
  isEditorPanelId,
  normalizeEditorChrome,
  normalizeEditorPanelOpen,
  setEditorPanelOpen,
  toggleEditorPanel,
} from '../dist-electron/shared/editorPanels.js'
import {
  EDITOR_PANEL_PREFS_STORAGE_KEY,
  clearEditorPanelPrefs,
  loadEditorPanelPrefs,
  saveEditorPanelPrefs,
} from '../dist-electron/shared/editorPanelPrefs.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
    removeItem(key: string) {
      map.delete(key)
    },
  }
}

function testIdsAndLabels(): void {
  assert(EDITOR_PANEL_IDS.length === 6, 'six panels')
  for (const id of EDITOR_PANEL_IDS) {
    assert(isEditorPanelId(id), `id ${id}`)
    assert(EDITOR_PANEL_LABELS[id].trim().length > 0, `label ${id}`)
  }
  assert(!isEditorPanelId('audio'), 'unknown id rejected')
  console.log('ok ids/labels')
}

function testDefaults(): void {
  assert(DEFAULT_EDITOR_PANEL_OPEN.zoom === true, 'zoom open')
  assert(DEFAULT_EDITOR_PANEL_OPEN.cursor === false, 'cursor closed')
  assert(DEFAULT_EDITOR_PANEL_OPEN.timeline === true, 'timeline open')
  assert(DEFAULT_EDITOR_CHROME.sidebarCollapsed === false, 'sidebar visible')
  assert(countOpenEditorPanels(DEFAULT_EDITOR_PANEL_OPEN) === 3, '3 open by default')
  console.log('ok defaults')
}

function testToggleNormalize(): void {
  const toggled = toggleEditorPanel(DEFAULT_EDITOR_PANEL_OPEN, 'cursor')
  assert(toggled.cursor === true, 'cursor opened')
  assert(toggled.zoom === true, 'zoom unchanged')
  const closed = setEditorPanelOpen(toggled, 'zoom', false)
  assert(closed.zoom === false, 'zoom closed')
  const normalized = normalizeEditorPanelOpen({
    zoom: false,
    cursor: true,
  })
  assert(normalized.zoom === false, 'partial zoom')
  assert(normalized.cursor === true, 'partial cursor')
  assert(normalized.background === false, 'default background')
  assert(normalized.timeline === true, 'default timeline')
  const chrome = normalizeEditorChrome({
    sidebarCollapsed: true,
    panels: { export: true },
  })
  assert(chrome.sidebarCollapsed === true, 'sidebar collapsed')
  assert(chrome.panels.export === true, 'export open')
  assert(chrome.panels.zoom === true, 'zoom default')
  console.log('ok toggle/normalize')
}

function testExpandCollapseAll(): void {
  const all = expandAllEditorPanels()
  assert(countOpenEditorPanels(all) === EDITOR_PANEL_IDS.length, 'all open')
  const none = collapseAllEditorPanels()
  assert(countOpenEditorPanels(none) === 0, 'all closed')
  console.log('ok expand/collapse all')
}

function testPrefsRoundTrip(): void {
  const store = memoryStorage()
  const loaded = loadEditorPanelPrefs(store)
  assert(loaded.panels.zoom === true, 'empty → default zoom')
  assert(loaded.sidebarCollapsed === false, 'empty → sidebar')

  saveEditorPanelPrefs(
    {
      sidebarCollapsed: true,
      panels: expandAllEditorPanels(),
    },
    store,
  )
  assert(store.getItem(EDITOR_PANEL_PREFS_STORAGE_KEY) != null, 'key written')
  const again = loadEditorPanelPrefs(store)
  assert(again.sidebarCollapsed === true, 'sidebar restored')
  assert(countOpenEditorPanels(again.panels) === 6, 'all panels restored')

  clearEditorPanelPrefs(store)
  assert(store.getItem(EDITOR_PANEL_PREFS_STORAGE_KEY) == null, 'cleared')
  console.log('ok prefs round-trip')
}

function testCorruptPrefs(): void {
  const store = memoryStorage({ [EDITOR_PANEL_PREFS_STORAGE_KEY]: '{not-json' })
  const loaded = loadEditorPanelPrefs(store)
  assert(loaded.panels.zoom === DEFAULT_EDITOR_PANEL_OPEN.zoom, 'corrupt → default')
  assert(loaded.sidebarCollapsed === false, 'corrupt → sidebar')
  console.log('ok corrupt prefs')
}

testIdsAndLabels()
testDefaults()
testToggleNormalize()
testExpandCollapseAll()
testPrefsRoundTrip()
testCorruptPrefs()
console.log('smoke:editor-panels passed')
