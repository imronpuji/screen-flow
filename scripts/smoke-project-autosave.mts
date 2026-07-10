/**
 * Smoke checks for project auto-save (FOKUS 5) — no Electron / DOM Storage.
 */
import { defaultReviewEdit } from '../dist-electron/shared/edit.js'
import {
  PROJECT_AUTOSAVE_DEBOUNCE_MS,
  PROJECT_AUTOSAVE_STORAGE_KEY,
  PROJECT_AUTOSAVE_VERSION,
  clearProjectAutosave,
  formatAutosaveLabel,
  loadProjectAutosave,
  normalizeProjectAutosaveSnapshot,
  normalizeReviewEditState,
  saveProjectAutosave,
} from '../dist-electron/shared/projectAutosave.js'

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

function testConstants(): void {
  assert(PROJECT_AUTOSAVE_VERSION === 1, 'version 1')
  assert(PROJECT_AUTOSAVE_DEBOUNCE_MS === 800, 'debounce 800ms')
  assert(
    PROJECT_AUTOSAVE_STORAGE_KEY === 'screen-flow:project-autosave',
    'storage key',
  )
  console.log('ok constants')
}

function testRoundTrip(): void {
  const store = memoryStorage()
  const path = '/tmp/sf-session/capture.webm'
  const durationMs = 12_000
  const edit = defaultReviewEdit(durationMs)
  edit.autoZoomEnabled = true
  edit.manualZoomPoints = [
    {
      id: 'mz-1',
      peakMs: 4000,
      focusX: 0.3,
      focusY: 0.7,
      peakScale: 1.8,
      enabled: true,
    },
  ]
  edit.keepRanges = [
    { startMs: 500, endMs: 4000 },
    { startMs: 5000, endMs: 11000 },
  ]
  edit.trimStartMs = 500
  edit.trimEndMs = 11000

  const snap = saveProjectAutosave(path, durationMs, edit, store, 1_700_000_000_000)
  assert(snap != null, 'save returns snapshot')
  assert(snap!.webmPath === path, 'path stored')
  assert(store.getItem(PROJECT_AUTOSAVE_STORAGE_KEY) != null, 'key written')

  const loaded = loadProjectAutosave(path, durationMs, store)
  assert(loaded != null, 'load hit')
  assert(loaded!.manualZoomPoints.length === 1, 'manual zoom restored')
  assert(loaded!.manualZoomPoints[0]!.id === 'mz-1', 'manual id')
  assert(loaded!.keepRanges.length === 2, 'keep ranges restored')
  assert(loaded!.trimStartMs === 500, 'trim start envelope')
  assert(loaded!.trimEndMs === 11000, 'trim end envelope')
  console.log('ok round-trip')
}

function testWrongPathMiss(): void {
  const store = memoryStorage()
  const edit = defaultReviewEdit(5000)
  saveProjectAutosave('/tmp/a/capture.webm', 5000, edit, store)
  const miss = loadProjectAutosave('/tmp/b/capture.webm', 5000, store)
  assert(miss == null, 'different path → miss')
  console.log('ok wrong-path-miss')
}

function testCorrupt(): void {
  const store = memoryStorage({
    [PROJECT_AUTOSAVE_STORAGE_KEY]: '{not-json',
  })
  const loaded = loadProjectAutosave('/tmp/x.webm', 1000, store)
  assert(loaded == null, 'corrupt → null')
  console.log('ok corrupt')
}

function testNormalizePartial(): void {
  const normalized = normalizeReviewEditState(
    {
      autoZoomEnabled: false,
      exportFormat: 'webm',
      exportQuality: 'draft',
      keepRanges: [{ startMs: 0, endMs: 2000 }],
    },
    5000,
  )
  assert(normalized.autoZoomEnabled === false, 'autoZoom false kept')
  assert(normalized.exportFormat === 'webm', 'format')
  assert(normalized.exportQuality === 'draft', 'quality')
  assert(normalized.keepRanges.length === 1, 'keep')
  assert(normalized.cursorSmoothingEnabled === true, 'cursor default on')
  console.log('ok normalize-partial')
}

function testNormalizeBadZoom(): void {
  const normalized = normalizeReviewEditState(
    {
      zoomPointOverrides: [
        { index: 0, enabled: true, peakScale: 99, focusX: 2, focusY: -1 },
        { index: -3, enabled: true },
        { index: 1.5, enabled: true },
      ],
      manualZoomPoints: [
        { id: '', peakMs: 100, focusX: 0.5, focusY: 0.5, peakScale: 1.6, enabled: true },
        {
          id: 'ok',
          peakMs: 200,
          focusX: 0.5,
          focusY: 0.5,
          peakScale: 1.6,
          enabled: true,
        },
      ],
    } as never,
    3000,
  )
  assert(normalized.zoomPointOverrides.length === 1, 'only valid override')
  assert(normalized.zoomPointOverrides[0]!.peakScale === 3, 'peak clamped')
  assert(normalized.zoomPointOverrides[0]!.focusX === 1, 'focusX clamp')
  assert(normalized.zoomPointOverrides[0]!.focusY === 0, 'focusY clamp')
  assert(normalized.manualZoomPoints.length === 1, 'empty id dropped')
  assert(normalized.manualZoomPoints[0]!.id === 'ok', 'manual kept')
  console.log('ok normalize-bad-zoom')
}

function testSnapshotVersion(): void {
  const bad = normalizeProjectAutosaveSnapshot({
    version: 99,
    webmPath: '/tmp/x.webm',
    savedAt: 1,
    durationMs: 1000,
    edit: {},
  })
  assert(bad == null, 'bad version → null')
  console.log('ok snapshot-version')
}

function testClearMatching(): void {
  const store = memoryStorage()
  const path = '/tmp/sf/capture.webm'
  saveProjectAutosave(path, 2000, defaultReviewEdit(2000), store)
  clearProjectAutosave('/tmp/other.webm', store)
  assert(store.getItem(PROJECT_AUTOSAVE_STORAGE_KEY) != null, 'other path keeps slot')
  clearProjectAutosave(path, store)
  assert(store.getItem(PROJECT_AUTOSAVE_STORAGE_KEY) == null, 'matching clear')
  console.log('ok clear-matching')
}

function testClearAll(): void {
  const store = memoryStorage()
  saveProjectAutosave('/tmp/a.webm', 1000, defaultReviewEdit(1000), store)
  clearProjectAutosave(undefined, store)
  assert(store.getItem(PROJECT_AUTOSAVE_STORAGE_KEY) == null, 'clear all')
  console.log('ok clear-all')
}

function testFormatLabel(): void {
  const now = 1_000_000
  assert(formatAutosaveLabel(now - 500, now) === 'Saved just now', 'just now')
  assert(formatAutosaveLabel(now - 12_000, now) === 'Saved 12s ago', 'seconds')
  assert(formatAutosaveLabel(now - 120_000, now) === 'Saved 2m ago', 'minutes')
  assert(formatAutosaveLabel(0, now) === 'Saved', 'zero')
  console.log('ok format-label')
}

function testOverwriteSingleSlot(): void {
  const store = memoryStorage()
  saveProjectAutosave('/tmp/old.webm', 1000, defaultReviewEdit(1000), store)
  saveProjectAutosave('/tmp/new.webm', 2000, defaultReviewEdit(2000), store)
  assert(loadProjectAutosave('/tmp/old.webm', 1000, store) == null, 'old overwritten')
  assert(loadProjectAutosave('/tmp/new.webm', 2000, store) != null, 'new present')
  console.log('ok overwrite-single-slot')
}

testConstants()
testRoundTrip()
testWrongPathMiss()
testCorrupt()
testNormalizePartial()
testNormalizeBadZoom()
testSnapshotVersion()
testClearMatching()
testClearAll()
testFormatLabel()
testOverwriteSingleSlot()
console.log('smoke-project-autosave: all ok')
