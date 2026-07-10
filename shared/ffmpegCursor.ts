/**
 * Plan ffmpeg drawbox + sendcmd for baking cursor smoothing + click rings into export.
 */

import type { CursorEvent } from './cursor.js'
import {
  buildClickRings,
  buildCursorKeyframes,
  getActiveClickRings,
  getSmoothedCursorAtTime,
  type CursorSmoothingOptions,
  type VideoSize,
} from './cursorSmoothing.js'
import type { BackgroundCardLayout } from './ffmpegBackground.js'

export interface CursorSendCmdOptions {
  sampleMs?: number
  /** Cursor dot diameter in pixels. */
  dotSizePx?: number
  /** Base click ring diameter before scale animation. */
  ringBasePx?: number
}

const DEFAULT_SAMPLE_MS = 33
const DEFAULT_DOT_PX = 14
const DEFAULT_RING_BASE_PX = 44

export interface CursorFilterPlan {
  hasCursor: boolean
  sendCmd: string
  /** filter_complex tail: [inputLabel] → [outputLabel] */
  filterComplex: string
  inputLabel: string
  outputLabel: string
}

function mapCursorToFrame(
  normX: number,
  normY: number,
  frameW: number,
  frameH: number,
  layout: BackgroundCardLayout | null,
): { x: number; y: number } {
  if (!layout) {
    return {
      x: Math.round(normX * frameW),
      y: Math.round(normY * frameH),
    }
  }
  return {
    x: Math.round(layout.padX + normX * layout.cardW),
    y: Math.round(layout.padY + normY * layout.cardH),
  }
}

/**
 * Sample smoothed cursor + click rings and emit sendcmd lines for named drawbox filters.
 */
export function buildCursorSendCmd(
  events: CursorEvent[],
  videoSize: VideoSize,
  durationMs: number,
  layout: BackgroundCardLayout | null,
  options: CursorSmoothingOptions & CursorSendCmdOptions = {},
): string {
  const sampleMs = options.sampleMs ?? DEFAULT_SAMPLE_MS
  const dotSize = options.dotSizePx ?? DEFAULT_DOT_PX
  const ringBase = options.ringBasePx ?? DEFAULT_RING_BASE_PX
  const duration = Math.max(sampleMs, durationMs)

  const keyframes = buildCursorKeyframes(events)
  const rings = buildClickRings(events, videoSize)
  if (keyframes.length === 0 && rings.length === 0) return ''

  const { width: frameW, height: frameH } = videoSize
  const lines: string[] = []
  let prevDotKey = ''
  let prevRingKey = ''

  for (let t = 0; t <= duration; t += sampleMs) {
    const timeSec = (t / 1000).toFixed(3)
    const parts: string[] = []

    const pos = getSmoothedCursorAtTime(t, keyframes, videoSize, options)
    if (pos) {
      const { x, y } = mapCursorToFrame(pos.x, pos.y, frameW, frameH, layout)
      const dotX = x - Math.floor(dotSize / 2)
      const dotY = y - Math.floor(dotSize / 2)
      const dotKey = `${dotX}:${dotY}`
      if (dotKey !== prevDotKey) {
        parts.push(`drawbox@cursor x ${dotX}`, `drawbox@cursor y ${dotY}`)
        prevDotKey = dotKey
      }
    }

    const activeRings = getActiveClickRings(t, rings, options)
    if (activeRings.length > 0) {
      const ring = activeRings[activeRings.length - 1]!
      const { x, y } = mapCursorToFrame(ring.x, ring.y, frameW, frameH, layout)
      const size = Math.round(ringBase * ring.scale)
      const ringX = x - Math.floor(size / 2)
      const ringY = y - Math.floor(size / 2)
      const alpha = Math.max(0, Math.min(1, ring.opacity))
      const ringKey = `${ringX}:${ringY}:${size}:${alpha.toFixed(2)}`
      if (ringKey !== prevRingKey) {
        parts.push(
          `drawbox@ring x ${ringX}`,
          `drawbox@ring y ${ringY}`,
          `drawbox@ring w ${size}`,
          `drawbox@ring h ${size}`,
          `drawbox@ring color 0xffffff@${alpha.toFixed(2)}`,
        )
        prevRingKey = ringKey
      }
    } else {
      prevRingKey = ''
    }

    if (parts.length > 0) {
      lines.push(`${timeSec} ${parts.join(', ')};`)
    }
  }

  if (lines.length === 0) return ''
  return lines.join('\n') + '\n'
}

/**
 * Plan ffmpeg filters for cursor overlay on the final composited frame.
 */
export function planCursorExport(
  events: CursorEvent[],
  videoSize: VideoSize,
  durationMs: number,
  layout: BackgroundCardLayout | null,
  options: CursorSmoothingOptions & CursorSendCmdOptions = {},
  inputLabel = 'vframe',
  outputLabel = 'vout',
  sendCmdPathPlaceholder = '__CURSOR_SENDCMD_PATH__',
): CursorFilterPlan {
  const sendCmd = buildCursorSendCmd(events, videoSize, durationMs, layout, options)
  if (!sendCmd) {
    return {
      hasCursor: false,
      sendCmd: '',
      filterComplex: `[${inputLabel}]null[${outputLabel}]`,
      inputLabel,
      outputLabel,
    }
  }

  const dotSize = options.dotSizePx ?? DEFAULT_DOT_PX
  const ringBase = options.ringBasePx ?? DEFAULT_RING_BASE_PX
  const ringThickness = 3

  const filterComplex = [
    `[${inputLabel}]sendcmd=f=${sendCmdPathPlaceholder}`,
    `drawbox@cursor=x=0:y=0:w=${dotSize}:h=${dotSize}:color=0x3dd6c6@0.95:t=fill`,
    `drawbox@ring=x=0:y=0:w=${ringBase}:h=${ringBase}:color=0xffffff@0:t=${ringThickness}`,
    `[${outputLabel}]`,
  ].join(',')

  return {
    hasCursor: true,
    sendCmd,
    filterComplex,
    inputLabel,
    outputLabel,
  }
}
