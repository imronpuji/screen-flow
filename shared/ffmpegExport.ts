/**
 * Orchestrate ffmpeg filter plans for export (auto-zoom + background + cursor + camera).
 */

import type { AutoZoomOptions } from './autozoom.js'
import type { BackgroundStyle } from './background.js'
import type { CameraOverlayStyle } from './camera.js'
import type { CameraDriftCompensation } from './cameraSync.js'
import type { CursorAppearance } from './cursorAppearance.js'
import type { CursorEvent } from './cursor.js'
import type { CursorSmoothingOptions } from './cursorSmoothing.js'
import { planBackgroundExport } from './ffmpegBackground.js'
import { planCameraExport } from './ffmpegCamera.js'
import { planCursorExport, type CursorSendCmdOptions } from './ffmpegCursor.js'
import { planAutoZoomExport } from './ffmpegZoom.js'
import type { ZoomPointOverride } from './zoomPoints.js'

export interface VideoSize {
  width: number
  height: number
}

export interface ExportEffectsRequest {
  autoZoom?: {
    events: CursorEvent[]
    options?: AutoZoomOptions
    /** Per-click enable/disable + peak scale (matches review editor). */
    zoomOverrides?: ZoomPointOverride[]
  }
  background?: BackgroundStyle
  cursorSmoothing?: {
    events: CursorEvent[]
    options?: CursorSmoothingOptions & CursorSendCmdOptions
    appearance?: CursorAppearance
  }
  /** FaceTime/webcam overlay — requires a second ffmpeg input (camera.webm). */
  camera?: {
    style: CameraOverlayStyle
    /** ffmpeg input index for camera (default 1). */
    inputIndex?: number
    /** Screen↔camera drift compensation (setpts on camera input). */
    drift?: Pick<CameraDriftCompensation, 'offsetMs' | 'ptsRate'> | null
    /** Mid-recording mute windows → overlay enable='…' on main timeline. */
    enableExpr?: string | null
  }
}

export interface ExportFilterPlan {
  /** Simple -vf graph (zoom only, no background/cursor/camera). */
  videoFilter?: string
  /** Multi-input graph when background/cursor/camera compositing is required. */
  filterComplex?: string
  outputLabel: string
  zoomSendCmd: string | null
  cursorSendCmd: string | null
  autoZoomApplied: boolean
  backgroundApplied: boolean
  cursorApplied: boolean
  cameraApplied: boolean
}

const ZOOM_PATH = '__ZOOM_SENDCMD_PATH__'
const CURSOR_PATH = '__CURSOR_SENDCMD_PATH__'

/**
 * Build the full ffmpeg filter plan for export effects.
 * Pure — smoke-tested without Electron.
 *
 * Order: zoom → background → cursor → camera (camera sits on top, Screen Studio-like).
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
  let cameraApplied = false
  let zoomSendCmd: string | null = null
  let cursorSendCmd: string | null = null

  const zoomPlan = effects.autoZoom
    ? planAutoZoomExport(
        effects.autoZoom.events,
        videoSize,
        durationMs,
        effects.autoZoom.options,
        {},
        effects.autoZoom.zoomOverrides,
      )
    : null

  if (zoomPlan?.hasZoom) {
    autoZoomApplied = true
    zoomSendCmd = zoomPlan.sendCmd
  }

  const backgroundStyle = effects.background
  const backgroundPlan =
    backgroundStyle != null
      ? planBackgroundExport(backgroundStyle, videoSize, 'vzoom', 'vbg', durationMs)
      : null

  if (backgroundPlan?.hasBackground) {
    backgroundApplied = true
  }

  const wantCamera = Boolean(effects.camera?.style && effects.camera.style.enabled)
  // Cursor writes to an intermediate label when camera follows; otherwise final vout.
  const cursorOutLabel = wantCamera ? 'vprecam' : 'vout'

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
          cursorOutLabel,
          CURSOR_PATH,
        )
      : null

  if (cursorPlan?.hasCursor) {
    cursorApplied = true
    cursorSendCmd = cursorPlan.sendCmd
  }

  const cameraInputIndex = effects.camera?.inputIndex ?? 1
  const preCameraLabel = cursorApplied
    ? cursorOutLabel
    : backgroundApplied
      ? 'vbg'
      : 'vzoom'

  const cameraPlan =
    wantCamera && effects.camera
      ? planCameraExport(
          effects.camera.style,
          videoSize,
          preCameraLabel,
          'vout',
          cameraInputIndex,
          effects.camera.drift,
          effects.camera.enableExpr,
        )
      : null

  if (cameraPlan?.hasCamera) {
    cameraApplied = true
  }

  const needsFilterComplex = backgroundApplied || cursorApplied || cameraApplied

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
      cameraApplied,
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
  } else if (!cameraApplied) {
    parts.push(`[${preCursorLabel}]null[vout]`)
  }

  if (cameraPlan?.hasCamera) {
    // When cursor was skipped, camera reads from preCameraLabel (vbg/vzoom).
    parts.push(cameraPlan.filterComplex)
  }

  return {
    filterComplex: parts.join(';'),
    outputLabel: 'vout',
    zoomSendCmd,
    cursorSendCmd,
    autoZoomApplied,
    backgroundApplied,
    cursorApplied,
    cameraApplied,
  }
}

export const EXPORT_SENDCMD_PLACEHOLDERS = {
  zoom: ZOOM_PATH,
  cursor: CURSOR_PATH,
} as const
