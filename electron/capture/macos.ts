/**
 * macOS-specific capture surface.
 * MVP: Electron desktopCapturer.
 * Later: ScreenCaptureKit via Swift helper / native addon.
 */

import { desktopCapturer, systemPreferences, type DesktopCapturerSource } from 'electron'
import type {
  CaptureSource,
  ListSourcesRequest,
  PermissionState,
  PermissionStatus,
} from '../../shared/ipc.js'

function mapScreenAccessStatus(raw: string): PermissionState {
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

function permissionMessage(screen: PermissionState): string {
  switch (screen) {
    case 'granted':
      return 'Screen Recording access is granted.'
    case 'denied':
      return 'Screen Recording was denied. Enable it in System Settings → Privacy & Security → Screen Recording.'
    case 'not-determined':
      return 'Screen Recording permission has not been requested yet. Listing sources may prompt the system dialog.'
    case 'restricted':
      return 'Screen Recording is restricted by system policy.'
    case 'unsupported':
      return 'Screen Recording permission APIs are only available on macOS.'
    default:
      return 'Screen Recording permission status is unknown.'
  }
}

/** Probe TCC Screen Recording status (macOS). Safe no-op semantics on other platforms. */
export function getMacScreenPermissionStatus(): PermissionStatus {
  if (process.platform !== 'darwin') {
    return {
      screen: 'unsupported',
      message: permissionMessage('unsupported'),
    }
  }

  // getMediaAccessStatus('screen') reflects TCC without forcing a prompt.
  const raw = systemPreferences.getMediaAccessStatus('screen')
  const screen = mapScreenAccessStatus(raw)
  return { screen, message: permissionMessage(screen) }
}

function toCaptureSource(source: DesktopCapturerSource): CaptureSource {
  const kind = source.id.startsWith('screen:') ? 'screen' : 'window'
  const thumbnailDataUrl =
    source.thumbnail && !source.thumbnail.isEmpty()
      ? source.thumbnail.toDataURL()
      : undefined

  return {
    id: source.id,
    name: source.name,
    kind,
    thumbnailDataUrl,
  }
}

/**
 * List screens/windows via desktopCapturer.
 * On macOS without Screen Recording permission, Electron may return an empty list.
 */
export async function listMacCaptureSources(
  request: ListSourcesRequest = {},
): Promise<CaptureSource[]> {
  const wantThumbs = request.thumbnails !== false
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: wantThumbs ? { width: 320, height: 180 } : { width: 0, height: 0 },
    fetchWindowIcons: false,
  })

  return sources.map(toCaptureSource)
}

export const MAC_CAPTURE_NOTES = {
  mvp: 'desktopCapturer',
  target: 'ScreenCaptureKit (macOS 12.3+)',
} as const
