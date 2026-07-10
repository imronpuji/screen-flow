/**
 * Smoke checks for export format/quality preference persistence (no Electron / DOM Storage).
 */
import {
  DEFAULT_EXPORT_PREFS,
  EXPORT_PREFS_STORAGE_KEY,
  clearExportPrefs,
  loadExportPrefs,
  normalizeExportPrefs,
  saveExportPrefs,
} from '../dist-electron/shared/exportPrefs.js'
import { DEFAULT_EXPORT_FORMAT } from '../dist-electron/shared/exportFormat.js'
import { DEFAULT_EXPORT_QUALITY } from '../dist-electron/shared/exportQuality.js'

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
  const loaded = loadExportPrefs(store)
  assert(loaded.format === DEFAULT_EXPORT_FORMAT, 'default format')
  assert(loaded.quality === DEFAULT_EXPORT_QUALITY, 'default quality')
  assert(loaded.format === DEFAULT_EXPORT_PREFS.format, 'matches DEFAULT_EXPORT_PREFS format')
  assert(loaded.quality === DEFAULT_EXPORT_PREFS.quality, 'matches DEFAULT_EXPORT_PREFS quality')
  console.log('ok defaults')
}

function testRoundTrip(): void {
  const store = memoryStorage()
  const prefs = normalizeExportPrefs({ format: 'webm', quality: 'draft' })
  saveExportPrefs(prefs, store)
  assert(store.getItem(EXPORT_PREFS_STORAGE_KEY) != null, 'key written')
  const loaded = loadExportPrefs(store)
  assert(loaded.format === 'webm', 'format restored')
  assert(loaded.quality === 'draft', 'quality restored')
  console.log('ok round-trip')
}

function testGifHigh(): void {
  const store = memoryStorage()
  saveExportPrefs(normalizeExportPrefs({ format: 'gif', quality: 'high' }), store)
  const loaded = loadExportPrefs(store)
  assert(loaded.format === 'gif', 'gif restored')
  assert(loaded.quality === 'high', 'high restored')
  console.log('ok gif-high')
}

function testCorrupt(): void {
  const store = memoryStorage({ [EXPORT_PREFS_STORAGE_KEY]: '{not-json' })
  const loaded = loadExportPrefs(store)
  assert(loaded.format === DEFAULT_EXPORT_FORMAT, 'corrupt → default format')
  assert(loaded.quality === DEFAULT_EXPORT_QUALITY, 'corrupt → default quality')
  console.log('ok corrupt')
}

function testNormalizeOnLoad(): void {
  const store = memoryStorage()
  store.setItem(
    EXPORT_PREFS_STORAGE_KEY,
    JSON.stringify({
      format: 'unknown-format',
      quality: 'ultra',
    }),
  )
  const loaded = loadExportPrefs(store)
  assert(loaded.format === DEFAULT_EXPORT_FORMAT, 'bad format → mp4')
  assert(loaded.quality === DEFAULT_EXPORT_QUALITY, 'bad quality → good')
  console.log('ok normalize-on-load')
}

function testPartial(): void {
  const store = memoryStorage()
  store.setItem(EXPORT_PREFS_STORAGE_KEY, JSON.stringify({ format: 'webm' }))
  const loaded = loadExportPrefs(store)
  assert(loaded.format === 'webm', 'partial format kept')
  assert(loaded.quality === DEFAULT_EXPORT_QUALITY, 'missing quality → default')
  console.log('ok partial')
}

function testClear(): void {
  const store = memoryStorage()
  saveExportPrefs(normalizeExportPrefs({ format: 'gif', quality: 'draft' }), store)
  clearExportPrefs(store)
  assert(store.getItem(EXPORT_PREFS_STORAGE_KEY) == null, 'cleared')
  assert(loadExportPrefs(store).format === DEFAULT_EXPORT_FORMAT, 'after clear = default format')
  assert(loadExportPrefs(store).quality === DEFAULT_EXPORT_QUALITY, 'after clear = default quality')
  console.log('ok clear')
}

testDefaults()
testRoundTrip()
testGifHigh()
testCorrupt()
testNormalizeOnLoad()
testPartial()
testClear()
console.log('smoke-export-prefs: all ok')
