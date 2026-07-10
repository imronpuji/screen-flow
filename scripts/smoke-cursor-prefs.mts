/**
 * Smoke checks for cursor appearance preference persistence (no Electron / DOM Storage).
 */
import {
  CURSOR_PREFS_STORAGE_KEY,
  clearCursorPrefs,
  loadCursorPrefs,
  saveCursorPrefs,
} from '../dist-electron/shared/cursorPrefs.js'
import {
  DEFAULT_CURSOR_APPEARANCE,
  normalizeCursorAppearance,
} from '../dist-electron/shared/cursorAppearance.js'

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

function testDefaults(): void {
  const store = memoryStorage()
  const loaded = loadCursorPrefs(store)
  assert(loaded.style === DEFAULT_CURSOR_APPEARANCE.style, 'default style')
  assert(loaded.sizeScale === DEFAULT_CURSOR_APPEARANCE.sizeScale, 'default size')
  assert(
    loaded.spotlightEnabled === DEFAULT_CURSOR_APPEARANCE.spotlightEnabled,
    'default spotlight',
  )
  console.log('ok defaults')
}

function testRoundTrip(): void {
  const store = memoryStorage()
  const appearance = normalizeCursorAppearance({
    style: 'crosshair',
    sizeScale: 1.5,
    spotlightEnabled: true,
  })
  saveCursorPrefs(appearance, store)
  assert(store.getItem(CURSOR_PREFS_STORAGE_KEY) != null, 'key written')
  const loaded = loadCursorPrefs(store)
  assert(loaded.style === 'crosshair', 'style restored')
  assert(loaded.sizeScale === 1.5, 'size restored')
  assert(loaded.spotlightEnabled === true, 'spotlight restored')
  console.log('ok round-trip')
}

function testCorrupt(): void {
  const store = memoryStorage({ [CURSOR_PREFS_STORAGE_KEY]: '{not-json' })
  const loaded = loadCursorPrefs(store)
  assert(loaded.style === DEFAULT_CURSOR_APPEARANCE.style, 'corrupt → default')
  console.log('ok corrupt')
}

function testClampOnLoad(): void {
  const store = memoryStorage()
  store.setItem(
    CURSOR_PREFS_STORAGE_KEY,
    JSON.stringify({
      style: 'unknown-style',
      sizeScale: 99,
      spotlightEnabled: true,
    }),
  )
  const loaded = loadCursorPrefs(store)
  assert(loaded.style === 'dot', 'bad style → dot')
  assert(loaded.sizeScale === 3, 'size clamped to max')
  assert(loaded.spotlightEnabled === true, 'spotlight kept')
  console.log('ok clamp-on-load')
}

function testHiddenRoundTrip(): void {
  const store = memoryStorage()
  saveCursorPrefs(
    normalizeCursorAppearance({
      style: 'hidden',
      sizeScale: 0.5,
      spotlightEnabled: false,
    }),
    store,
  )
  const loaded = loadCursorPrefs(store)
  assert(loaded.style === 'hidden', 'hidden restored')
  assert(loaded.sizeScale === 0.5, 'min size restored')
  console.log('ok hidden')
}

function testClear(): void {
  const store = memoryStorage()
  saveCursorPrefs(
    normalizeCursorAppearance({
      ...DEFAULT_CURSOR_APPEARANCE,
      style: 'crosshair',
      sizeScale: 2,
    }),
    store,
  )
  clearCursorPrefs(store)
  assert(store.getItem(CURSOR_PREFS_STORAGE_KEY) == null, 'cleared')
  assert(loadCursorPrefs(store).style === DEFAULT_CURSOR_APPEARANCE.style, 'after clear = default')
  console.log('ok clear')
}

testDefaults()
testRoundTrip()
testCorrupt()
testClampOnLoad()
testHiddenRoundTrip()
testClear()
console.log('smoke-cursor-prefs: all ok')
