/**
 * Smoke checks for aesthetic background preference persistence (no Electron / DOM Storage).
 */
import {
  BACKGROUND_PREFS_STORAGE_KEY,
  clearBackgroundPrefs,
  loadBackgroundPrefs,
  saveBackgroundPrefs,
} from '../dist-electron/shared/backgroundPrefs.js'
import {
  DEFAULT_BACKGROUND_STYLE,
  normalizeBackgroundStyle,
} from '../dist-electron/shared/background.js'

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
  const loaded = loadBackgroundPrefs(store)
  assert(loaded.enabled === DEFAULT_BACKGROUND_STYLE.enabled, 'default enabled')
  assert(loaded.presetId === DEFAULT_BACKGROUND_STYLE.presetId, 'default preset')
  assert(loaded.paddingPercent === DEFAULT_BACKGROUND_STYLE.paddingPercent, 'default padding')
  assert(loaded.cornerRadiusPx === DEFAULT_BACKGROUND_STYLE.cornerRadiusPx, 'default radius')
  assert(loaded.shadowEnabled === DEFAULT_BACKGROUND_STYLE.shadowEnabled, 'default shadow')
  console.log('ok defaults')
}

function testRoundTrip(): void {
  const store = memoryStorage()
  const style = normalizeBackgroundStyle({
    enabled: false,
    presetId: 'sunset',
    paddingPercent: 16,
    cornerRadiusPx: 20,
    shadowEnabled: false,
  })
  saveBackgroundPrefs(style, store)
  assert(store.getItem(BACKGROUND_PREFS_STORAGE_KEY) != null, 'key written')
  const loaded = loadBackgroundPrefs(store)
  assert(loaded.enabled === false, 'enabled restored')
  assert(loaded.presetId === 'sunset', 'preset restored')
  assert(loaded.paddingPercent === 16, 'padding restored')
  assert(loaded.cornerRadiusPx === 20, 'radius restored')
  assert(loaded.shadowEnabled === false, 'shadow restored')
  console.log('ok round-trip')
}

function testCorrupt(): void {
  const store = memoryStorage({ [BACKGROUND_PREFS_STORAGE_KEY]: '{not-json' })
  const loaded = loadBackgroundPrefs(store)
  assert(loaded.presetId === DEFAULT_BACKGROUND_STYLE.presetId, 'corrupt → default')
  console.log('ok corrupt')
}

function testClampOnLoad(): void {
  const store = memoryStorage()
  store.setItem(
    BACKGROUND_PREFS_STORAGE_KEY,
    JSON.stringify({
      enabled: true,
      presetId: 'unknown-gradient',
      paddingPercent: 99,
      cornerRadiusPx: 99,
      shadowEnabled: true,
    }),
  )
  const loaded = loadBackgroundPrefs(store)
  assert(loaded.paddingPercent === 24, 'padding clamped')
  assert(loaded.cornerRadiusPx === 32, 'radius clamped')
  assert(loaded.presetId === 'midnight', 'bad preset → first')
  console.log('ok clamp-on-load')
}

function testClear(): void {
  const store = memoryStorage()
  saveBackgroundPrefs(
    normalizeBackgroundStyle({
      ...DEFAULT_BACKGROUND_STYLE,
      presetId: 'slate',
      paddingPercent: 6,
    }),
    store,
  )
  clearBackgroundPrefs(store)
  assert(store.getItem(BACKGROUND_PREFS_STORAGE_KEY) == null, 'cleared')
  assert(loadBackgroundPrefs(store).presetId === DEFAULT_BACKGROUND_STYLE.presetId, 'after clear = default')
  console.log('ok clear')
}

testDefaults()
testRoundTrip()
testCorrupt()
testClampOnLoad()
testClear()
console.log('smoke-background-prefs: all ok')
