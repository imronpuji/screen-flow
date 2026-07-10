/**
 * OS-routed capture helpers. Keep platform details behind this facade.
 */

import type { CaptureSource, ListSourcesRequest, PermissionStatus } from '../../shared/ipc.js'
import { getMacScreenPermissionStatus, listMacCaptureSources } from './macos.js'

export function getScreenPermissionStatus(): PermissionStatus {
  if (process.platform === 'darwin') {
    return getMacScreenPermissionStatus()
  }

  // Linux/Windows: desktopCapturer often works without a macOS-style TCC gate.
  // We still surface a clear status so the UI can explain platform differences.
  return {
    screen: 'granted',
    message:
      process.platform === 'win32'
        ? 'Windows capture uses desktopCapturer (no macOS TCC). ScreenCaptureKit path is macOS-only.'
        : 'Non-macOS runtime: treating capture permission as available for desktopCapturer MVP.',
  }
}

export async function listCaptureSources(
  request: ListSourcesRequest = {},
): Promise<CaptureSource[]> {
  // MVP: same Electron API on all platforms; macOS module owns the implementation detail.
  return listMacCaptureSources(request)
}
