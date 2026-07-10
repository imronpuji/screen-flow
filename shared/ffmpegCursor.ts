/**
 * Plan ffmpeg drawbox + sendcmd for baking cursor smoothing + click rings into export.
 */

import {
  appearanceToCursorDrawOptions,
  DEFAULT_CURSOR_APPEARANCE,
  type CursorAppearance,
  type CursorStyleId,
} from './cursorAppearance.js'
import type { CursorEvent } from './cursor.js'
import {
  buildClickRings,
  buildCursorKeyframes,
  getActiveClickHighlights,
  getActiveClickRings,
  getSmoothedCursorAtTime,
  type CursorSmoothingOptions,
  type VideoSize,
} from './cursorSmoothing.js'
import type { BackgroundCardLayout } from './ffmpegBackground.js'

export interface CursorSendCmdOptions {
  sampleMs?: number
  /** Cursor dot diameter in pixels (overrides appearance when set). */
  dotSizePx?: number
  /** Base click ring diameter before scale animation. */
  ringBasePx?: number
  /** Soft spotlight diameter (0 = off). */
  spotlightPx?: number
  /** Soft auto-highlight diameter before scale animation. */
  highlightPx?: number
  /** Cursor visual style for drawbox filters. */
  style?: CursorStyleId
  /** Full appearance — preferred over individual size/style fields. */
  appearance?: CursorAppearance
}

const DEFAULT_SAMPLE_MS = 33

export interface CursorFilterPlan {
  hasCursor: boolean
  sendCmd: string
  /** filter_complex tail: [inputLabel] → [outputLabel] */
  filterComplex: string
  inputLabel: string
  outputLabel: string
}

function resolveDrawOptions(options: CursorSmoothingOptions & CursorSendCmdOptions) {
  const fromAppearance = appearanceToCursorDrawOptions(
    options.appearance ?? DEFAULT_CURSOR_APPEARANCE,
  )
  return {
    visible: fromAppearance.visible,
    style: options.style ?? fromAppearance.style,
    dotSizePx: options.dotSizePx ?? fromAppearance.dotSizePx,
    ringBasePx: options.ringBasePx ?? fromAppearance.ringBasePx,
    spotlightPx: options.spotlightPx ?? fromAppearance.spotlightPx,
    spotlightEnabled:
      options.spotlightPx != null
        ? options.spotlightPx > 0
        : fromAppearance.spotlightEnabled,
    highlightPx: options.highlightPx ?? fromAppearance.highlightPx,
    clickHighlightEnabled:
      options.highlightPx != null
        ? options.highlightPx > 0
        : fromAppearance.clickHighlightEnabled,
  }
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
  const draw = resolveDrawOptions(options)
  if (!draw.visible) return ''

  const sampleMs = options.sampleMs ?? DEFAULT_SAMPLE_MS
  const dotSize = draw.dotSizePx
  const ringBase = draw.ringBasePx
  const spotlightSize = draw.spotlightEnabled ? draw.spotlightPx : 0
  const highlightBase = draw.clickHighlightEnabled ? draw.highlightPx : 0
  const duration = Math.max(sampleMs, durationMs)

  const keyframes = buildCursorKeyframes(events)
  const rings = buildClickRings(events, videoSize, options)
  if (keyframes.length === 0 && rings.length === 0) return ''

  const { width: frameW, height: frameH } = videoSize
  const lines: string[] = []
  let prevDotKey = ''
  let prevRingKey = ''
  let prevSpotKey = ''
  let prevHlKey = ''

  for (let t = 0; t <= duration; t += sampleMs) {
    const timeSec = (t / 1000).toFixed(3)
    const parts: string[] = []

    const pos = getSmoothedCursorAtTime(t, keyframes, videoSize, options)
    if (pos) {
      const { x, y } = mapCursorToFrame(pos.x, pos.y, frameW, frameH, layout)

      if (spotlightSize > 0) {
        const spotX = x - Math.floor(spotlightSize / 2)
        const spotY = y - Math.floor(spotlightSize / 2)
        const spotKey = `${spotX}:${spotY}:${spotlightSize}`
        if (spotKey !== prevSpotKey) {
          parts.push(
            `drawbox@spot x ${spotX}`,
            `drawbox@spot y ${spotY}`,
            `drawbox@spot w ${spotlightSize}`,
            `drawbox@spot h ${spotlightSize}`,
          )
          prevSpotKey = spotKey
        }
      }

      const dotX = x - Math.floor(dotSize / 2)
      const dotY = y - Math.floor(dotSize / 2)
      const crossArm = Math.max(2, Math.round(dotSize / 5))
      const crossLen = Math.max(dotSize, Math.round(dotSize * 1.4))

      if (draw.style === 'crosshair') {
        const hX = x - Math.floor(crossLen / 2)
        const hY = y - Math.floor(crossArm / 2)
        const vX = x - Math.floor(crossArm / 2)
        const vY = y - Math.floor(crossLen / 2)
        const crossKey = `${hX}:${hY}:${vX}:${vY}:${crossLen}:${crossArm}`
        if (crossKey !== prevDotKey) {
          parts.push(
            `drawbox@cursorh x ${hX}`,
            `drawbox@cursorh y ${hY}`,
            `drawbox@cursorh w ${crossLen}`,
            `drawbox@cursorh h ${crossArm}`,
            `drawbox@cursorv x ${vX}`,
            `drawbox@cursorv y ${vY}`,
            `drawbox@cursorv w ${crossArm}`,
            `drawbox@cursorv h ${crossLen}`,
          )
          prevDotKey = crossKey
        }
      } else {
        const dotKey = `${dotX}:${dotY}`
        if (dotKey !== prevDotKey) {
          parts.push(`drawbox@cursor x ${dotX}`, `drawbox@cursor y ${dotY}`)
          prevDotKey = dotKey
        }
      }
    }

    if (highlightBase > 0) {
      const activeHighlights = getActiveClickHighlights(t, rings, options)
      if (activeHighlights.length > 0) {
        const hl = activeHighlights[activeHighlights.length - 1]!
        const { x, y } = mapCursorToFrame(hl.x, hl.y, frameW, frameH, layout)
        const size = Math.round(highlightBase * hl.scale)
        const hlX = x - Math.floor(size / 2)
        const hlY = y - Math.floor(size / 2)
        const alpha = Math.max(0, Math.min(1, hl.opacity))
        const hlKey = `${hlX}:${hlY}:${size}:${alpha.toFixed(2)}`
        if (hlKey !== prevHlKey) {
          parts.push(
            `drawbox@hl x ${hlX}`,
            `drawbox@hl y ${hlY}`,
            `drawbox@hl w ${size}`,
            `drawbox@hl h ${size}`,
            `drawbox@hl color 0x3dd6c6@${alpha.toFixed(2)}`,
          )
          prevHlKey = hlKey
        }
      } else {
        // Hide highlight between clicks (alpha 0).
        if (prevHlKey !== 'off') {
          parts.push(`drawbox@hl color 0x3dd6c6@0`)
          prevHlKey = 'off'
        }
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
  const draw = resolveDrawOptions(options)
  if (!draw.visible) {
    return {
      hasCursor: false,
      sendCmd: '',
      filterComplex: `[${inputLabel}]null[${outputLabel}]`,
      inputLabel,
      outputLabel,
    }
  }

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

  const dotSize = draw.dotSizePx
  const ringBase = draw.ringBasePx
  const ringThickness = 3
  const spotlightSize = draw.spotlightEnabled ? draw.spotlightPx : 0
  const highlightBase = draw.clickHighlightEnabled ? draw.highlightPx : 0
  const crossArm = Math.max(2, Math.round(dotSize / 5))
  const crossLen = Math.max(dotSize, Math.round(dotSize * 1.4))

  const filters: string[] = [`sendcmd=f=${sendCmdPathPlaceholder}`]

  if (spotlightSize > 0) {
    filters.push(
      `drawbox@spot=x=0:y=0:w=${spotlightSize}:h=${spotlightSize}:color=0x3dd6c6@0.18:t=fill`,
    )
  }

  // Soft filled auto-highlight under the outline ring (preview ≡ export).
  if (highlightBase > 0) {
    filters.push(
      `drawbox@hl=x=0:y=0:w=${highlightBase}:h=${highlightBase}:color=0x3dd6c6@0:t=fill`,
    )
  }

  if (draw.style === 'crosshair') {
    filters.push(
      `drawbox@cursorh=x=0:y=0:w=${crossLen}:h=${crossArm}:color=0x3dd6c6@0.95:t=fill`,
      `drawbox@cursorv=x=0:y=0:w=${crossArm}:h=${crossLen}:color=0x3dd6c6@0.95:t=fill`,
    )
  } else {
    filters.push(
      `drawbox@cursor=x=0:y=0:w=${dotSize}:h=${dotSize}:color=0x3dd6c6@0.95:t=fill`,
    )
  }

  filters.push(
    `drawbox@ring=x=0:y=0:w=${ringBase}:h=${ringBase}:color=0xffffff@0:t=${ringThickness}`,
  )

  // Output pad label must attach to the last filter WITHOUT a comma —
  // a comma before [label] makes ffmpeg parse an empty filter name.
  const filterComplex = `[${inputLabel}]` + filters.join(',') + `[${outputLabel}]`

  return {
    hasCursor: true,
    sendCmd,
    filterComplex,
    inputLabel,
    outputLabel,
  }
}
