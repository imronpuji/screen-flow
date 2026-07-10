/**
 * Smoke checks for FaceTime overlay preference persistence (no Electron / DOM Storage).
 */
import {
  CAMERA_PREFS_STORAGE_KEY,
  clearCameraPrefs,
  loadCameraPrefs,
  saveCameraPrefs,
} from '../src/lib/cameraPrefs.ts'
import { DEFAULT_CAMERA_OVERLAY, normalizeCameraOverlay } from '../shared/camera.ts'

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
  const loaded = loadCameraPrefs(store)
  assert(loaded.enabled === DEFAULT_CAMERA_OVERLAY.enabled, 'default enabled')
  assert(loaded.sizePercent === DEFAULT_CAMERA_OVERLAY.sizePercent, 'default size')
  assert(loaded.shape === DEFAULT_CAMERA_OVERLAY.shape, 'default shape')
  assert(loaded.micEnabled === DEFAULT_CAMERA_OVERLAY.micEnabled, 'default mic')
  console.log('ok defaults')
}

function testRoundTrip(): void {
  const store = memoryStorage()
  const style = normalizeCameraOverlay({
    enabled: true,
    deviceId: 'facetime-hd',
    corner: 'top-left',
    sizePercent: 28,
    shape: 'rectangle',
    shadowEnabled: false,
    borderEnabled: true,
    borderWidthPx: 4,
    borderColor: '#3DD6C6',
    mirrored: false,
    opacity: 0.85,
    micEnabled: false,
  })
  saveCameraPrefs(style, store)
  assert(store.getItem(CAMERA_PREFS_STORAGE_KEY) != null, 'key written')
  const loaded = loadCameraPrefs(store)
  assert(loaded.enabled === true, 'enabled restored')
  assert(loaded.deviceId === 'facetime-hd', 'device restored')
  assert(loaded.corner === 'top-left', 'corner restored')
  assert(loaded.sizePercent === 28, 'size restored')
  assert(loaded.shape === 'rectangle', 'shape restored')
  assert(loaded.shadowEnabled === false, 'shadow restored')
  assert(loaded.borderWidthPx === 4, 'border width restored')
  assert(loaded.borderColor === '#3DD6C6', 'border color restored')
  assert(loaded.mirrored === false, 'mirror restored')
  assert(Math.abs(loaded.opacity - 0.85) < 1e-6, 'opacity restored')
  assert(loaded.micEnabled === false, 'mic restored')
  assert(Number.isFinite(loaded.x) && Number.isFinite(loaded.y), 'x/y filled')
  console.log('ok round-trip')
}

function testCorrupt(): void {
  const store = memoryStorage({ [CAMERA_PREFS_STORAGE_KEY]: '{not-json' })
  const loaded = loadCameraPrefs(store)
  assert(loaded.sizePercent === DEFAULT_CAMERA_OVERLAY.sizePercent, 'corrupt → default')
  console.log('ok corrupt')
}

function testClampOnLoad(): void {
  const store = memoryStorage()
  store.setItem(
    CAMERA_PREFS_STORAGE_KEY,
    JSON.stringify({ sizePercent: 99, shape: 'hexagon', opacity: 0.1 }),
  )
  const loaded = loadCameraPrefs(store)
  assert(loaded.sizePercent === 40, 'size clamped')
  assert(loaded.shape === DEFAULT_CAMERA_OVERLAY.shape, 'bad shape fallback')
  assert(loaded.opacity === 0.35, 'opacity clamped low')
  console.log('ok clamp-on-load')
}

function testClear(): void {
  const store = memoryStorage()
  saveCameraPrefs(normalizeCameraOverlay({ enabled: true, sizePercent: 30 }), store)
  clearCameraPrefs(store)
  assert(store.getItem(CAMERA_PREFS_STORAGE_KEY) == null, 'cleared')
  assert(loadCameraPrefs(store).enabled === false, 'after clear = default')
  console.log('ok clear')
}

testDefaults()
testRoundTrip()
testCorrupt()
testClampOnLoad()
testClear()
console.log('smoke-camera-prefs: all ok')
