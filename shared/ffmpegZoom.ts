/**
 * Build ffmpeg sendcmd keyframes from the shared auto-zoom engine.
 * Samples cubic-eased transforms so export matches CSS preview.
 */

import {
  buildZoomSegments,
  getZoomTransformAtTime,
  type AutoZoomOptions,
  type VideoSize,
  type ZoomSegment,
} from './autozoom.js'
import type { CursorEvent } from './cursor.js'
import {
  applyZoomPointOverrides,
  mergeZoomSegments,
  type ManualZoomPoint,
  type ZoomPointOverride,
} from './zoomPoints.js'

export interface CropRect {
  w: number
  h: number
  x: number
  y: number
}

export interface ZoomSendCmdOptions {
  /** Sample interval for keyframes (default 33 ≈ 30fps). */
  sampleMs?: number
  /** ffmpeg crop filter instance name (default "z"). */
  filterName?: string
}

const DEFAULT_SAMPLE_MS = 33

/** yuv420p encoders require even crop dimensions. */
export function evenDimension(value: number): number {
  const rounded = Math.max(2, Math.round(value))
  return rounded % 2 === 0 ? rounded : rounded - 1
}

/**
 * Map zoom transform → pixel crop rect, clamped inside the frame.
 * Matches CSS transform-origin + scale on the preview video.
 */
export function computeCropRect(
  scale: number,
  focusX: number,
  focusY: number,
  width: number,
  height: number,
): CropRect {
  const z = Math.max(1, scale)
  const w = evenDimension(width / z)
  const h = evenDimension(height / z)
  const cx = focusX * width
  const cy = focusY * height
  let x = Math.round(cx - w / 2)
  let y = Math.round(cy - h / 2)
  x = Math.max(0, Math.min(width - w, x))
  y = Math.max(0, Math.min(height - h, y))
  x = evenDimension(x)
  y = evenDimension(y)
  return { w, h, x, y }
}

function cropKey(rect: CropRect): string {
  return `${rect.w}:${rect.h}:${rect.x}:${rect.y}`
}

/**
 * Sample zoom transforms and emit ffmpeg sendcmd lines for a named crop filter.
 * Skips redundant lines when crop rect is unchanged between samples.
 */
export function buildZoomSendCmd(
  segments: ZoomSegment[],
  videoSize: VideoSize,
  durationMs: number,
  options: ZoomSendCmdOptions = {},
): string {
  const sampleMs = options.sampleMs ?? DEFAULT_SAMPLE_MS
  const duration = Math.max(sampleMs, durationMs)
  const lines: string[] = []

  let prevKey = ''
  for (let t = 0; t <= duration; t += sampleMs) {
    const transform = getZoomTransformAtTime(t, segments)
    const rect = computeCropRect(
      transform.scale,
      transform.focusX,
      transform.focusY,
      videoSize.width,
      videoSize.height,
    )
    const key = cropKey(rect)
    if (key === prevKey) continue
    prevKey = key
    const timeSec = (t / 1000).toFixed(3)
    lines.push(
      `${timeSec} crop w ${rect.w}, crop h ${rect.h}, crop x ${rect.x}, crop y ${rect.y};`,
    )
  }

  if (lines.length === 0) {
    const rect = computeCropRect(1, 0.5, 0.5, videoSize.width, videoSize.height)
    lines.push(
      `0.0 crop w ${rect.w}, crop h ${rect.h}, crop x ${rect.x}, crop y ${rect.y};`,
    )
  }

  return lines.join('\n') + '\n'
}

export interface AutoZoomFilterPlan {
  segments: ZoomSegment[]
  sendCmd: string
  /** ffmpeg -vf graph (sendcmd + crop + scale back to source size). */
  videoFilter: string
  hasZoom: boolean
}

/**
 * Plan ffmpeg filters for baking auto-zoom into export.
 * Returns identity filter when there are no click / manual segments.
 */
export function planAutoZoomExport(
  events: CursorEvent[],
  videoSize: VideoSize,
  durationMs: number,
  autoZoomOptions: AutoZoomOptions = {},
  sendCmdOptions: ZoomSendCmdOptions = {},
  zoomOverrides?: ZoomPointOverride[] | null,
  manualZoomPoints?: ManualZoomPoint[] | null,
): AutoZoomFilterPlan {
  const segments = mergeZoomSegments(
    applyZoomPointOverrides(
      buildZoomSegments(events, videoSize, autoZoomOptions),
      zoomOverrides,
    ),
    manualZoomPoints,
  )
  const filterName = sendCmdOptions.filterName ?? 'z'
  const { width, height } = videoSize

  if (segments.length === 0) {
    return {
      segments,
      sendCmd: '',
      videoFilter: `scale=${width}:${height}`,
      hasZoom: false,
    }
  }

  const sendCmd = buildZoomSendCmd(segments, videoSize, durationMs, sendCmdOptions)
  const initial = computeCropRect(1, 0.5, 0.5, width, height)
  const videoFilter = [
    `sendcmd=f=__SENDCMD_PATH__`,
    `crop@${filterName}=${initial.w}:${initial.h}:${initial.x}:${initial.y}`,
    `scale=${width}:${height}`,
  ].join(',')

  return {
    segments,
    sendCmd,
    videoFilter,
    hasZoom: true,
  }
}
