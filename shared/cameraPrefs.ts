/**
 * Persist FaceTime / webcam overlay prefs across sessions (renderer localStorage).
 * Layout + device + chrome are restored on launch so users don't reconfigure every time.
 * Opening the live stream remains best-effort when `enabled` was saved true.
 */

import {
  DEFAULT_CAMERA_OVERLAY,
  normalizeCameraOverlay,
  type CameraOverlayStyle,
} from './camera.js'

export const CAMERA_PREFS_STORAGE_KEY = 'screen-flow:camera-overlay'

export function loadCameraPrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): CameraOverlayStyle {
  try {
    const raw = storage.getItem(CAMERA_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_CAMERA_OVERLAY }
    const parsed = JSON.parse(raw) as Partial<CameraOverlayStyle>
    return normalizeCameraOverlay(parsed)
  } catch {
    return { ...DEFAULT_CAMERA_OVERLAY }
  }
}

export function saveCameraPrefs(
  style: CameraOverlayStyle,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    const normalized = normalizeCameraOverlay(style)
    storage.setItem(CAMERA_PREFS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Clear saved prefs (tests / reset). */
export function clearCameraPrefs(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  try {
    storage.removeItem(CAMERA_PREFS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
