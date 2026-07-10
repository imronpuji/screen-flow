/**
 * Camera (FaceTime) + microphone TCC + Chromium media permission helpers.
 */

import { session, systemPreferences } from 'electron'
import type { CameraAccessResult, PermissionState } from '../../shared/ipc.js'

const MEDIA_PERMISSIONS = new Set([
  'media',
  'mediaKeySystem',
  'display-capture',
])

/**
 * Allow renderer getUserMedia (camera + mic + display-capture) without a blocking prompt
 * from Chromium's permission UI — macOS TCC still applies separately.
 */
export function installMediaPermissionHandlers(): void {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(MEDIA_PERMISSIONS.has(permission))
  })
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return MEDIA_PERMISSIONS.has(permission)
  })
}

function mapMediaStatus(raw: string): PermissionState {
  switch (raw) {
    case 'granted':
    case 'denied':
    case 'not-determined':
    case 'restricted':
    case 'unknown':
      return raw
    default:
      return 'unknown'
  }
}

/**
 * Prompt macOS Camera privacy access (FaceTime HD / external cams).
 * Returns granted=true on non-darwin so renderer can proceed to getUserMedia.
 */
export async function requestCameraAccess(): Promise<CameraAccessResult> {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
      status: 'unsupported',
      message: 'Camera TCC prompt is macOS-only; using getUserMedia directly.',
    }
  }

  try {
    const allowed = await systemPreferences.askForMediaAccess('camera')
    const raw = systemPreferences.getMediaAccessStatus('camera')
    const status = mapMediaStatus(raw)
    if (allowed || status === 'granted') {
      return {
        ok: true,
        status: 'granted',
        message: 'Camera access is granted.',
      }
    }
    return {
      ok: false,
      status,
      message:
        'Camera access was denied. Enable it in System Settings → Privacy & Security → Camera.',
    }
  } catch (err) {
    return {
      ok: false,
      status: 'unknown',
      message: err instanceof Error ? err.message : 'Failed to request camera access',
    }
  }
}

/**
 * Prompt macOS Microphone privacy access (voice with FaceTime track).
 * Non-fatal for the app — renderer may still fall back to video-only.
 */
export async function requestMicrophoneAccess(): Promise<CameraAccessResult> {
  if (process.platform !== 'darwin') {
    return {
      ok: true,
      status: 'unsupported',
      message: 'Microphone TCC prompt is macOS-only; using getUserMedia directly.',
    }
  }

  try {
    const allowed = await systemPreferences.askForMediaAccess('microphone')
    const raw = systemPreferences.getMediaAccessStatus('microphone')
    const status = mapMediaStatus(raw)
    if (allowed || status === 'granted') {
      return {
        ok: true,
        status: 'granted',
        message: 'Microphone access is granted.',
      }
    }
    return {
      ok: false,
      status,
      message:
        'Microphone access was denied. Enable it in System Settings → Privacy & Security → Microphone, or continue without mic.',
    }
  } catch (err) {
    return {
      ok: false,
      status: 'unknown',
      message: err instanceof Error ? err.message : 'Failed to request microphone access',
    }
  }
}
