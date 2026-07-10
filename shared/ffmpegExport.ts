/**
 * Orchestrate ffmpeg filter plans for export (auto-zoom + background + cursor).
 */

import type { AutoZoomOptions } from './autozoom.js'
import type { BackgroundStyle } from './background.js'
import type { CursorAppearance } from './cursorAppearance.js'
import type { CursorEvent } from './cursor.js'
import type { CursorSmoothingOptions } from './cursorSmoothing.js'
import { planBackgroundExport } from './ffmpegBackground.js'
import { planCursorExport, type CursorSendCmdOptions } from './ffmpegCursor.js'
import { planAutoZoomExport } from './ffmpegZoom.js'

export interface VideoSize {
  width: number
  height: number
}

export interface ExportEffectsRequest {
  autoZoom?: {
    events: CursorEvent[]
    options?: AutoZoomOptions
  }
  background?: BackgroundStyle
  cursorSmoothing?: {
    events: CursorEvent[]
    options?: CursorSmoothingOptions & CursorSendCmdOptions
    appearance?: CursorAppearance
  }
}

export interface ExportFilterPlan {
  /** Simple -vf graph (zoom only, no background/cursor). */
  videoFilter?: string
  /** Multi-input graph when background/cursor compositing is required. */
  filterComplex?: string
  outputLabel: string
  zoomSendCmd: string | null
  cursorSendCmd: string | null
  autoZoomApplied: boolean
  backgroundApplied: boolean
  cursorApplied: boolean
}

const ZOOM_PATH = '__ZOOM_SENDCMD_PATH__'
const CURSOR_PATH = '__CURSOR_SENDCMD_PATH__'

/**
 * Build the full ffmpeg filter plan for export effects.
 * Pure — smoke-tested without Electron.
 */
export function planExportFilters(
  videoSize: VideoSize,
  durationMs: number,
  effects: ExportEffectsRequest,
): ExportFilterPlan {
  const { width, height } = videoSize
  let autoZoomApplied = false
  let backgroundApplied = false
  let cursorApplied = false
  let zoomSendCmd: string | null = null
  let cursorSendCmd: string | null = null

  const zoomPlan = effects.autoZoom
    ? planAutoZoomExport(
        effects.autoZoom.events,
        videoSize,
        durationMs,
        effects.autoZoom.options,
      )
    : null

  if (zoomPlan?.hasZoom) {
    autoZoomApplied = true
    zoomSendCmd = zoomPlan.sendCmd
  }

  const backgroundStyle = effects.background
  const backgroundPlan =
    backgroundStyle != null
      ? planBackgroundExport(backgroundStyle, videoSize, 'vzoom', 'vbg')
      : null

  if (backgroundPlan?.hasBackground) {
    backgroundApplied = true
  }

  const cursorEvents = effects.cursorSmoothing?.events ?? []
  const cursorOptions = {
    ...effects.cursorSmoothing?.options,
    appearance:
      effects.cursorSmoothing?.appearance ??
      effects.cursorSmoothing?.options?.appearance,
  }
  const cursorPlan =
    effects.cursorSmoothing && cursorEvents.length > 0
      ? planCursorExport(
          cursorEvents,
          videoSize,
          durationMs,
          backgroundPlan?.layout ?? null,
          cursorOptions,
          backgroundApplied ? 'vbg' : 'vzoom',
          'vout',
          CURSOR_PATH,
        )
      : null

  if (cursorPlan?.hasCursor) {
    cursorApplied = true
    cursorSendCmd = cursorPlan.sendCmd
  }

  const needsFilterComplex = backgroundApplied || cursorApplied

  if (!needsFilterComplex) {
    const vf =
      zoomPlan?.hasZoom
        ? zoomPlan.videoFilter.replace('__SENDCMD_PATH__', ZOOM_PATH)
        : `scale=${width}:${height}`
    return {
      videoFilter: vf,
      outputLabel: '0:v',
      zoomSendCmd,
      cursorSendCmd,
      autoZoomApplied,
      backgroundApplied,
      cursorApplied,
    }
  }

  const parts: string[] = []

  if (zoomPlan?.hasZoom) {
    const zoomFilter = zoomPlan.videoFilter.replace('__SENDCMD_PATH__', ZOOM_PATH)
    parts.push(`[0:v]${zoomFilter}[vzoom]`)
  } else {
    parts.push(`[0:v]scale=${width}:${height}[vzoom]`)
  }

  if (backgroundPlan?.hasBackground) {
    parts.push(backgroundPlan.filterComplex)
  }

  const preCursorLabel = backgroundApplied ? 'vbg' : 'vzoom'

  if (cursorPlan?.hasCursor) {
    const cursorFilter = cursorPlan.filterComplex.replace(
      cursorPlan.inputLabel,
      preCursorLabel,
    )
    parts.push(cursorFilter)
  } else {
    parts.push(`[${preCursorLabel}]null[vout]`)
  }

  return {
    filterComplex: parts.join(';'),
    outputLabel: 'vout',
    zoomSendCmd,
    cursorSendCmd,
    autoZoomApplied,
    backgroundApplied,
    cursorApplied,
  }
}

export const EXPORT_SENDCMD_PLACEHOLDERS = {
  zoom: ZOOM_PATH,
  cursor: CURSOR_PATH,
} as const
