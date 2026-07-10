/**
 * Plan ffmpeg filter graph for baking aesthetic background into export.
 * Matches preview padding + gradient presets from shared/background.ts.
 */

import {
  getBackgroundPreset,
  normalizeBackgroundStyle,
  type BackgroundStyle,
} from './background.js'
import { evenDimension } from './ffmpegZoom.js'

export interface VideoSize {
  width: number
  height: number
}

/** ffmpeg gradients filter stops per preset (linear approx of CSS preview). */
const PRESET_GRADIENT_STOPS: Record<string, { c0: string; c1: string }> = {
  midnight: { c0: '0x0f1c2e', c1: '0x243b55' },
  aurora: { c0: '0x0b1620', c1: '0x122433' },
  sunset: { c0: '0x1a1020', c1: '0x2a1838' },
  slate: { c0: '0x1c2128', c1: '0x2a313c' },
  minimal: { c0: '0x12161c', c1: '0x0c0f14' },
}

export interface BackgroundCardLayout {
  frameW: number
  frameH: number
  cardW: number
  cardH: number
  padX: number
  padY: number
  cornerRadiusPx: number
  shadowEnabled: boolean
}

export interface BackgroundFilterPlan {
  hasBackground: boolean
  layout: BackgroundCardLayout | null
  /** filter_complex fragment: [inputLabel] → [outputLabel] */
  filterComplex: string
  inputLabel: string
  outputLabel: string
}

function gradientColors(presetId: string): { c0: string; c1: string } {
  return PRESET_GRADIENT_STOPS[presetId] ?? PRESET_GRADIENT_STOPS.aurora!
}

/** Map padding % (preview) → centered card dimensions inside the frame. */
export function computeBackgroundCardLayout(
  style: BackgroundStyle,
  videoSize: VideoSize,
): BackgroundCardLayout {
  const normalized = normalizeBackgroundStyle(style)
  const { width: frameW, height: frameH } = videoSize
  const padFrac = normalized.paddingPercent / 100
  const cardW = evenDimension(frameW * Math.max(0.2, 1 - 2 * padFrac))
  const cardH = evenDimension(frameH * Math.max(0.2, 1 - 2 * padFrac))
  const padX = evenDimension((frameW - cardW) / 2)
  const padY = evenDimension((frameH - cardH) / 2)
  return {
    frameW,
    frameH,
    cardW,
    cardH,
    padX,
    padY,
    cornerRadiusPx: normalized.cornerRadiusPx,
    shadowEnabled: normalized.shadowEnabled,
  }
}

function roundedAlphaExpr(radius: number): string {
  const r = Math.max(0, Math.min(64, Math.round(radius)))
  if (r <= 0) return '255'
  // Rounded-rect alpha mask (corners use circular arcs).
  return (
    `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),255,` +
    `if(lte(hypot(X-${r},${r}-Y),${r}),255,` +
    `if(lte(hypot(W-${r}-X,${r}-Y),${r}),255,` +
    `if(lte(hypot(X-${r},H-${r}-Y),${r}),255,` +
    `if(lte(hypot(W-${r}-X,H-${r}-Y),${r}),255,0)))))`
  )
}

/**
 * Build filter_complex that composites [inputLabel] video onto a gradient frame.
 * Input is expected at full frame resolution (post auto-zoom scale).
 */
export function planBackgroundExport(
  style: BackgroundStyle,
  videoSize: VideoSize,
  inputLabel = 'vsrc',
  outputLabel = 'vbg',
): BackgroundFilterPlan {
  const normalized = normalizeBackgroundStyle(style)
  if (!normalized.enabled) {
    return {
      hasBackground: false,
      layout: null,
      filterComplex: `[${inputLabel}]null[${outputLabel}]`,
      inputLabel,
      outputLabel,
    }
  }

  const layout = computeBackgroundCardLayout(normalized, videoSize)
  const preset = getBackgroundPreset(normalized.presetId)
  const { c0, c1 } = gradientColors(preset.id)
  const { frameW, frameH, cardW, cardH, padX, padY, cornerRadiusPx, shadowEnabled } = layout

  const bgLabel = `${outputLabel}_grad`
  const cardLabel = `${outputLabel}_card`
  const cardRoundedLabel = `${outputLabel}_cardr`
  const shadowLabel = `${outputLabel}_shadow`
  const bgShadowLabel = `${outputLabel}_bgsh`

  const lines: string[] = [
    `gradients=s=${frameW}x${frameH}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${frameW}:y1=${frameH}[${bgLabel}]`,
    `[${inputLabel}]scale=${cardW}:${cardH}[${cardLabel}]`,
  ]

  let cardOut = cardLabel
  if (cornerRadiusPx > 0) {
    const alpha = roundedAlphaExpr(cornerRadiusPx)
    lines.push(
      `[${cardLabel}]format=rgba,geq=lum='p(X,Y)':cb='p(X,Y)':cr='p(X,Y)':a='${alpha}'[${cardRoundedLabel}]`,
    )
    cardOut = cardRoundedLabel
  }

  if (shadowEnabled) {
    const cardFgLabel = `${outputLabel}_cardfg`
    lines.push(`[${cardOut}]split=2[${cardFgLabel}][${shadowLabel}]`)
    lines.push(
      `[${shadowLabel}]boxblur=12:5,colorchannelmixer=aa=0.35[${shadowLabel}b]`,
    )
    lines.push(
      `[${bgLabel}][${shadowLabel}b]overlay=${padX + 6}:${padY + 10}:format=auto[${bgShadowLabel}]`,
    )
    lines.push(
      `[${bgShadowLabel}][${cardFgLabel}]overlay=${padX}:${padY}:format=auto[${outputLabel}]`,
    )
  } else {
    lines.push(
      `[${bgLabel}][${cardOut}]overlay=${padX}:${padY}:format=auto[${outputLabel}]`,
    )
  }

  return {
    hasBackground: true,
    layout,
    filterComplex: lines.join(';'),
    inputLabel,
    outputLabel,
  }
}
