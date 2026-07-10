/**
 * macOS-specific capture surface.
 * MVP: Electron desktopCapturer (wired in a later run).
 * Later: ScreenCaptureKit via Swift helper / native addon.
 */

export interface MacCaptureSource {
  id: string
  name: string
  thumbnailDataUrl?: string
}

export async function listMacCaptureSources(): Promise<MacCaptureSource[]> {
  // Stub — real listing requires Electron app runtime + desktopCapturer.
  return []
}

export const MAC_CAPTURE_NOTES = {
  mvp: 'desktopCapturer',
  target: 'ScreenCaptureKit (macOS 12.3+)',
} as const
