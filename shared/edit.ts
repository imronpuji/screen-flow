import type { BackgroundStyle } from './background.js'
import { DEFAULT_BACKGROUND_STYLE, normalizeBackgroundStyle } from './background.js'
import type { CameraOverlayStyle } from './camera.js'
import { DEFAULT_CAMERA_OVERLAY, normalizeCameraOverlay } from './camera.js'
import type { CameraActiveRange } from './cameraSync.js'
import type { CursorAppearance } from './cursorAppearance.js'
import { DEFAULT_CURSOR_APPEARANCE, normalizeCursorAppearance } from './cursorAppearance.js'
import type { CursorEvent } from './cursor.js'
import type { ExportFormatId } from './exportFormat.js'
import { DEFAULT_EXPORT_FORMAT, normalizeExportFormat } from './exportFormat.js'
import type { ExportQualityId } from './exportQuality.js'
import { DEFAULT_EXPORT_QUALITY, normalizeExportQuality } from './exportQuality.js'
import type { ManualZoomPoint, ZoomPointOverride } from './zoomPoints.js'

/** Lightweight edit state for post-record review (trim + effects). */

export interface TrimRange {
  startMs: number
  endMs: number
}

export interface ReviewEditState {
  trimStartMs: number
  trimEndMs: number
  autoZoomEnabled: boolean
  /**
   * Per-click zoom edits (enable/disable + peak scale) keyed by auto-segment index.
   * Empty = all auto-zoom points keep defaults.
   */
  zoomPointOverrides: ZoomPointOverride[]
  /**
   * User-added zooms at the playhead (not tied to a click).
   * Merged with click segments for preview + export.
   */
  manualZoomPoints: ManualZoomPoint[]
  cursorSmoothingEnabled: boolean
  /** Size / style / hide / spotlight for composited cursor. */
  cursorAppearance: CursorAppearance
  background: BackgroundStyle
  /** FaceTime bubble layout for review preview + export bake. */
  cameraOverlay: CameraOverlayStyle
  /**
   * Review override for FaceTime active windows (wall ms from session start).
   * `null` = inherit recording `camera-sync.json` ranges (no edits yet).
   * Non-null = explicit windows for preview + export (`[]` = always-on).
   */
  cameraActiveRangesOverride: CameraActiveRange[] | null
  /** Encode quality (draft | good | high) — maps per format. */
  exportQuality: ExportQualityId
  /** Container format (mp4 | webm | gif). */
  exportFormat: ExportFormatId
}

/** Clamp trim handles to a valid export window (≥100ms). */
export function normalizeTrim(trim: TrimRange, fullDurationMs: number): TrimRange {
  const duration = Math.max(0, fullDurationMs)
  const startMs = Math.max(0, Math.min(trim.startMs, duration))
  const endMs = Math.max(startMs + 100, Math.min(trim.endMs, duration))
  return { startMs, endMs }
}

export function trimDurationMs(trim: TrimRange): number {
  return Math.max(0, trim.endMs - trim.startMs)
}

/** Shift cursor events into trimmed timeline (0 = trim start). Drops events outside range. */
export function applyTrimToCursorEvents(events: CursorEvent[], trim: TrimRange): CursorEvent[] {
  return events
    .filter((e) => e.t >= trim.startMs && e.t <= trim.endMs)
    .map((e) => ({ ...e, t: e.t - trim.startMs }))
}

export function msToFfmpegSec(ms: number): string {
  return (ms / 1000).toFixed(3)
}

export function defaultReviewEdit(
  durationMs: number,
  cameraOverlay?: Partial<CameraOverlayStyle> | null,
  exportQuality?: ExportQualityId | null,
  background?: BackgroundStyle | null,
  cursorAppearance?: CursorAppearance | null,
  exportFormat?: ExportFormatId | null,
): ReviewEditState {
  return {
    trimStartMs: 0,
    trimEndMs: Math.max(0, durationMs),
    autoZoomEnabled: true,
    zoomPointOverrides: [],
    manualZoomPoints: [],
    cursorSmoothingEnabled: true,
    cursorAppearance: normalizeCursorAppearance(
      cursorAppearance
        ? { ...DEFAULT_CURSOR_APPEARANCE, ...cursorAppearance }
        : { ...DEFAULT_CURSOR_APPEARANCE },
    ),
    background: normalizeBackgroundStyle(
      background ? { ...DEFAULT_BACKGROUND_STYLE, ...background } : { ...DEFAULT_BACKGROUND_STYLE },
    ),
    cameraOverlay: normalizeCameraOverlay(cameraOverlay ?? DEFAULT_CAMERA_OVERLAY),
    cameraActiveRangesOverride: null,
    exportQuality: normalizeExportQuality(exportQuality ?? DEFAULT_EXPORT_QUALITY),
    exportFormat: normalizeExportFormat(exportFormat ?? DEFAULT_EXPORT_FORMAT),
  }
}

export function formatTimeMs(ms: number): string {
  const totalSec = Math.max(0, ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = Math.floor(totalSec % 60)
  const frac = Math.floor((totalSec % 1) * 10)
  return `${min}:${sec.toString().padStart(2, '0')}.${frac}`
}
