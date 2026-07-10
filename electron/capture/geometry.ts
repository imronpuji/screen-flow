/**
 * Resolve Electron display geometry for a desktopCapturer source id.
 * Used so cursor DIP coords map correctly onto Retina / multi-monitor captures.
 */

import { desktopCapturer, screen } from 'electron'
import type { CaptureGeometry } from '../../shared/cursorCoords.js'

function geometryFromDisplay(display: Electron.Display): CaptureGeometry {
  return {
    originX: display.bounds.x,
    originY: display.bounds.y,
    widthDip: Math.max(1, display.bounds.width),
    heightDip: Math.max(1, display.bounds.height),
    scaleFactor: Math.max(0.5, display.scaleFactor || 1),
  }
}

/**
 * Match desktopCapturer screen source → Electron Display.
 * Falls back to primary display (window captures / unknown ids).
 */
export async function resolveCaptureGeometry(
  sourceId: string,
): Promise<CaptureGeometry> {
  const primary = screen.getPrimaryDisplay()
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 0, height: 0 },
    })
    const match = sources.find((s) => s.id === sourceId)
    const displayId = match?.display_id
    if (displayId) {
      const displays = screen.getAllDisplays()
      const found = displays.find((d) => String(d.id) === String(displayId))
      if (found) return geometryFromDisplay(found)
    }
  } catch {
    /* headless / permission — use primary */
  }

  // screen:N:… heuristic — N often indexes getAllDisplays() order on some Electron builds.
  const screenMatch = /^screen:(\d+)/.exec(sourceId)
  if (screenMatch) {
    const displays = screen.getAllDisplays()
    const idx = Number(screenMatch[1])
    if (Number.isFinite(idx) && displays[idx]) {
      return geometryFromDisplay(displays[idx]!)
    }
  }

  return geometryFromDisplay(primary)
}
