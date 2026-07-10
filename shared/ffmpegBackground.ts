/**
 * Plan ffmpeg filter graph for baking aesthetic background into export.
 * Matches preview padding + gradient presets from shared/background.ts.
 *
 * Rounded corners + soft shadow use a ONE-FRAME alpha mask (color → geq → loop),
 * never geq/boxblur on every video frame. That keeps export ~realtime while
 * matching the CSS preview card look.
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

/**
 * Rounded-rect alpha expression for geq.
 * Outside the corner circles → transparent; inside → `opaque` (0–255).
 * Commas stay inside single quotes so filter_complex does not split them.
 */
export function roundedRectAlphaExpr(radiusPx: number, opaque = 255): string {
  const r = Math.max(0, Math.round(radiusPx))
  const a = Math.max(0, Math.min(255, Math.round(opaque)))
  if (r <= 0) return String(a)
  return (
    `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),` +
    `if(lte(hypot(abs(W/2-X)-(W/2-${r}),abs(H/2-Y)-(H/2-${r})),${r}),${a},0),${a})`
  )
}

/** Soft-shadow blur radius in px (applied once on a still, then looped). */
const SHADOW_BLUR_PX = 12
/** Extra canvas around the card so the blur has room to fall off. */
const SHADOW_PAD_PX = 16
/** Shadow alpha before blur (0–255). */
const SHADOW_ALPHA = 160
/** Visual offset so the shadow sits slightly below-right of the card. */
const SHADOW_OFFSET_X = 0
const SHADOW_OFFSET_Y = 4

/**
 * Build filter_complex that composites [inputLabel] video onto a gradient frame.
 * Input is expected at full frame resolution (post auto-zoom scale).
 *
 * Paths:
 * - plain: gradient + scale + overlay (no radius/shadow)
 * - rounded/shadow: 1-frame geq mask → loop → alphamerge; optional still boxblur shadow
 *
 * Critical: `gradients` and `loop=-1` are infinite sources. Overlays that use them
 * as the main input MUST pass `shortest=1` (and ideally a duration trim) or ffmpeg
 * never EOFs — UI hits 100% while encode spins forever and cooks the laptop.
 */
export function planBackgroundExport(
  style: BackgroundStyle,
  videoSize: VideoSize,
  inputLabel = 'vsrc',
  outputLabel = 'vbg',
  /** Export duration — trims infinite lavfi sources so the graph can end. */
  durationMs?: number,
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
  const { frameW, frameH, cardW, cardH, padX, padY, cornerRadiusPx, shadowEnabled } =
    layout

  const needsMask = cornerRadiusPx > 0
  const needsShadow = shadowEnabled
  const bgLabel = `${outputLabel}_grad`
  const cardLabel = `${outputLabel}_card`
  const durationSec =
    durationMs != null && Number.isFinite(durationMs) && durationMs > 0
      ? Math.max(0.1, durationMs / 1000)
      : null
  // Cap infinite lavfi generators; shortest=1 on overlays is the hard stop.
  const gradTail = durationSec
    ? `,trim=duration=${durationSec.toFixed(3)},setpts=PTS-STARTPTS`
    : ''

  const lines: string[] = [
    `gradients=s=${frameW}x${frameH}:c0=${c0}:c1=${c1}:x0=0:y0=0:x1=${frameW}:y1=${frameH}${gradTail}[${bgLabel}]`,
  ]

  if (!needsMask && !needsShadow) {
    lines.push(`[${inputLabel}]scale=${cardW}:${cardH}[${cardLabel}]`)
    lines.push(
      `[${bgLabel}][${cardLabel}]overlay=${padX}:${padY}:format=auto:shortest=1[${outputLabel}]`,
    )
    return {
      hasBackground: true,
      layout,
      filterComplex: lines.join(';'),
      inputLabel,
      outputLabel,
    }
  }

  // Scale card to rgba so alphamerge can attach a rounded alpha channel.
  lines.push(`[${inputLabel}]scale=${cardW}:${cardH},format=rgba[${cardLabel}]`)

  let cardForOverlay = cardLabel
  if (needsMask) {
    const maskSrc = `${outputLabel}_masksrc`
    const maskLoop = `${outputLabel}_mask`
    const cardRounded = `${outputLabel}_round`
    const alpha = roundedRectAlphaExpr(cornerRadiusPx)
    // r=1:d=1 → one frame; geq runs once; loop repeats the still for the encode.
    lines.push(
      `color=c=white:s=${cardW}x${cardH}:r=1:d=1,format=rgba,` +
        `geq=r=255:g=255:b=255:a='${alpha}'[${maskSrc}]`,
    )
    lines.push(`[${maskSrc}]loop=loop=-1:size=1[${maskLoop}]`)
    lines.push(`[${cardLabel}][${maskLoop}]alphamerge[${cardRounded}]`)
    cardForOverlay = cardRounded
  }

  let baseForCard = bgLabel
  if (needsShadow) {
    const shadowW = evenDimension(cardW + SHADOW_PAD_PX * 2)
    const shadowH = evenDimension(cardH + SHADOW_PAD_PX * 2)
    const shadowRadius = needsMask ? cornerRadiusPx : 0
    const shadowA = roundedRectAlphaExpr(shadowRadius, SHADOW_ALPHA)
    const shadowSrc = `${outputLabel}_shsrc`
    const shadowLoop = `${outputLabel}_shadow`
    const withShadow = `${outputLabel}_bgs`
    const shadowX = padX - SHADOW_PAD_PX + SHADOW_OFFSET_X
    const shadowY = padY - SHADOW_PAD_PX + SHADOW_OFFSET_Y

    lines.push(
      `color=c=black:s=${shadowW}x${shadowH}:r=1:d=1,format=rgba,` +
        `geq=r=0:g=0:b=0:a='${shadowA}',` +
        `boxblur=${SHADOW_BLUR_PX}:${Math.max(1, Math.floor(SHADOW_BLUR_PX / 2))}[${shadowSrc}]`,
    )
    lines.push(`[${shadowSrc}]loop=loop=-1:size=1[${shadowLoop}]`)
    lines.push(
      `[${bgLabel}][${shadowLoop}]overlay=${shadowX}:${shadowY}:format=auto:shortest=1[${withShadow}]`,
    )
    baseForCard = withShadow
  }

  lines.push(
    `[${baseForCard}][${cardForOverlay}]overlay=${padX}:${padY}:format=auto:shortest=1[${outputLabel}]`,
  )

  return {
    hasBackground: true,
    layout,
    filterComplex: lines.join(';'),
    inputLabel,
    outputLabel,
  }
}
