/**
 * Plan ffmpeg filter graph for baking aesthetic background into export.
 * Matches preview padding + gradient presets from shared/background.ts.
 *
 * Gradient fidelity (preview ≡ export):
 * - Multi-stop linear via lavfi `gradients` (`nb_colors` + CSS angle → x0/y0/x1/y1).
 * - Soft radial accents (aurora/sunset) as 1-frame geq → loop → overlay.
 * - `speed` pinned to the lavfi minimum so the bake stays static (no rotation drift).
 *
 * Rounded corners + soft shadow use a ONE-FRAME alpha mask (color → geq → loop),
 * never geq/boxblur on every video frame. That keeps export ~realtime while
 * matching the CSS preview card look.
 */

import {
  getBackgroundPreset,
  normalizeBackgroundStyle,
  type BackgroundExportAccent,
  type BackgroundExportGradient,
  type BackgroundStyle,
} from './background.js'
import { evenDimension } from './ffmpegZoom.js'

export interface VideoSize {
  width: number
  height: number
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

export interface GradientLineEndpoints {
  x0: number
  y0: number
  x1: number
  y1: number
}

/**
 * Map CSS `linear-gradient` angle (0° = up, clockwise) to lavfi line endpoints
 * on the frame edges through the center. Endpoints stay in-bounds — lavfi
 * `gradients` rejects x/y < -1 ("Numerical result out of range").
 */
export function cssAngleToGradientLine(
  angleDeg: number,
  frameW: number,
  frameH: number,
): GradientLineEndpoints {
  const rad = (angleDeg * Math.PI) / 180
  // CSS: 0° points up (−Y); angles increase clockwise.
  const dx = Math.sin(rad)
  const dy = -Math.cos(rad)
  const cx = frameW / 2
  const cy = frameH / 2

  /** Distance from center to the frame edge along unit direction (sx, sy). */
  const tToEdge = (sx: number, sy: number): number => {
    let t = Number.POSITIVE_INFINITY
    if (sx > 1e-9) t = Math.min(t, (frameW - cx) / sx)
    if (sx < -1e-9) t = Math.min(t, (0 - cx) / sx)
    if (sy > 1e-9) t = Math.min(t, (frameH - cy) / sy)
    if (sy < -1e-9) t = Math.min(t, (0 - cy) / sy)
    return Number.isFinite(t) ? t : 0
  }

  const t1 = tToEdge(dx, dy)
  const t0 = tToEdge(-dx, -dy)
  const clampX = (v: number) => Math.max(0, Math.min(frameW, Math.round(v)))
  const clampY = (v: number) => Math.max(0, Math.min(frameH, Math.round(v)))
  return {
    x0: clampX(cx - dx * t0),
    y0: clampY(cy - dy * t0),
    x1: clampX(cx + dx * t1),
    y1: clampY(cy + dy * t1),
  }
}

/** Clamp stop count to lavfi `gradients` limits (2–8). */
export function clampGradientStopCount(count: number): number {
  return Math.max(2, Math.min(8, Math.round(count)))
}

/**
 * Build the lavfi `gradients=…` source string for a preset export spec.
 * Colors come from `BackgroundPreset.exportGradient` (same table as CSS).
 */
export function buildGradientsLavfi(
  spec: BackgroundExportGradient,
  frameW: number,
  frameH: number,
  /** Optional trim/setpts tail (e.g. `,trim=duration=1.5,setpts=PTS-STARTPTS`). */
  durationTail = '',
): string {
  const colors = spec.colors.slice(0, 8)
  const n = clampGradientStopCount(colors.length)
  const stops = colors.slice(0, n)
  while (stops.length < n) stops.push(stops[stops.length - 1] ?? '000000')
  const colorArgs = stops.map((hex, i) => `c${i}=0x${hex.replace(/^#/, '')}`).join(':')
  const { x0, y0, x1, y1 } = cssAngleToGradientLine(spec.angleDeg, frameW, frameH)
  // speed min keeps the pattern static across long encodes (default 0.01 rotates).
  return (
    `gradients=s=${frameW}x${frameH}:type=linear:nb_colors=${n}:${colorArgs}:` +
    `x0=${x0}:y0=${y0}:x1=${x1}:y1=${y1}:speed=0.00001${durationTail}`
  )
}

/** Soft radial accent alpha: peak at center, quadratic falloff to 0 at radius. */
export function radialAccentAlphaExpr(
  cxPx: number,
  cyPx: number,
  radiusPx: number,
  peakAlpha: number,
): string {
  const r = Math.max(1, Math.round(radiusPx))
  const a = Math.max(0, Math.min(255, Math.round(peakAlpha)))
  const cx = Math.round(cxPx)
  const cy = Math.round(cyPx)
  // Commas stay inside single quotes (caller wraps a='…') so filter_complex won't split.
  return (
    `if(gte(hypot(X-${cx},Y-${cy}),${r}),0,` +
    `${a}*pow(1-hypot(X-${cx},Y-${cy})/${r},2))`
  )
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace(/^#/, '').replace(/^0x/i, '')
  const n = Number.parseInt(h.length === 6 ? h : '000000', 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * Append 1-frame soft radial accent overlays onto `baseLabel`.
 * Returns the final label after all accents (or `baseLabel` when none).
 */
export function appendRadialAccentOverlays(
  lines: string[],
  accents: readonly BackgroundExportAccent[] | undefined,
  frameW: number,
  frameH: number,
  baseLabel: string,
  labelPrefix: string,
): string {
  if (!accents || accents.length === 0) return baseLabel
  const minSide = Math.min(frameW, frameH)
  let current = baseLabel
  accents.forEach((accent, index) => {
    const { r, g, b } = hexToRgb(accent.color)
    const cx = accent.cx * frameW
    const cy = accent.cy * frameH
    const radius = accent.radiusFrac * minSide
    const alpha = radialAccentAlphaExpr(cx, cy, radius, accent.alpha)
    const src = `${labelPrefix}_acc${index}src`
    const loop = `${labelPrefix}_acc${index}`
    const next = `${labelPrefix}_acc${index}out`
    lines.push(
      `color=c=black:s=${frameW}x${frameH}:r=1:d=1,format=rgba,` +
        `geq=r=${r}:g=${g}:b=${b}:a='${alpha}'[${src}]`,
    )
    lines.push(`[${src}]loop=loop=-1:size=1[${loop}]`)
    lines.push(
      `[${current}][${loop}]overlay=0:0:format=auto:shortest=1[${next}]`,
    )
    current = next
  })
  return current
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
  const { frameW, frameH, cardW, cardH, padX, padY, cornerRadiusPx, shadowEnabled } =
    layout

  const needsMask = cornerRadiusPx > 0
  const needsShadow = shadowEnabled
  const gradSrcLabel = `${outputLabel}_gradsrc`
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
    `${buildGradientsLavfi(preset.exportGradient, frameW, frameH, gradTail)}[${gradSrcLabel}]`,
  ]
  // Soft radial washes (aurora/sunset) — same 1-frame→loop pattern as shadow.
  const bgLabel = appendRadialAccentOverlays(
    lines,
    preset.exportGradient.accents,
    frameW,
    frameH,
    gradSrcLabel,
    outputLabel,
  )

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
