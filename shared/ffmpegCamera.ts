/**
 * Plan ffmpeg overlay for FaceTime/webcam bubble bake into export.
 * Matches shared/camera.ts layout (relative x/y + size%, circle/rounded/rectangle)
 * plus optional outline + soft drop shadow, mirror (hflip), and opacity
 * (preview ≡ export).
 *
 * Circle/rounded: ONE-FRAME geq alpha → loop → alphamerge (same pattern as
 * background rounded corners) so we never run geq per video frame.
 * Rectangle: skip mask — opaque square overlay (preview border-radius: 0);
 * when opacity < 1, rectangle also goes through rgba + colorchannelmixer.
 *
 * Chrome order on the base frame: shadow (under) → border plate → camera video.
 * Border = solid shape plate at full bubble size; camera is inset by borderWidthPx
 * so the visible ring matches CSS `border: Npx solid …`.
 */

import {
  cameraBubbleNormRect,
  normalizeCameraOverlay,
  type CameraOverlayStyle,
  type CameraShape,
} from './camera.js'
import {
  cameraDriftSetptsExpr,
  type CameraDriftCompensation,
} from './cameraSync.js'
import { evenDimension } from './ffmpegZoom.js'

export interface VideoSize {
  width: number
  height: number
}

export interface CameraFilterPlan {
  hasCamera: boolean
  /** filter_complex fragment: scales/masks [cameraInput] and overlays onto [baseInputLabel]. */
  filterComplex: string
  baseInputLabel: string
  outputLabel: string
  /** Pixel rect used for the outer bubble (border plate / full size). */
  overlay: { x: number; y: number; w: number; h: number }
  /** True when a soft shadow still is composited under the bubble. */
  shadowApplied: boolean
  /** True when a border plate is composited under the inset camera. */
  borderApplied: boolean
  /** True when setpts drift compensation was injected. */
  driftApplied: boolean
  /** True when camera stream is horizontally flipped (FaceTime selfie). */
  mirroredApplied: boolean
  /** True when opacity < 1 was baked into camera/chrome alpha. */
  opacityApplied: boolean
}

/** Soft-shadow blur radius in px (applied once on a still, then looped). */
const CAMERA_SHADOW_BLUR_PX = 14
/** Extra canvas around the bubble so the blur has room to fall off. */
const CAMERA_SHADOW_PAD_PX = 18
/** Shadow alpha before blur (0–255). */
const CAMERA_SHADOW_ALPHA = 150
/** Visual offset so the shadow sits slightly below the bubble. */
const CAMERA_SHADOW_OFFSET_X = 0
const CAMERA_SHADOW_OFFSET_Y = 8

/** Circle alpha: opaque inside radius, else transparent (bubble is square → W/2). */
export function circleAlphaExpr(opaque = 255): string {
  const a = Math.max(0, Math.min(255, Math.round(opaque)))
  return `if(lte(hypot(X-W/2,Y-H/2),W/2),${a},0)`
}

/**
 * Rounded-square / rounded-rect alpha (~22% CSS border-radius on min side).
 * Commas stay inside single quotes so filter_complex does not split them.
 * Works for non-square bubbles (free aspect) via W/H independently.
 */
export function roundedBubbleAlphaExpr(
  widthPx: number,
  heightPx: number = widthPx,
  opaque = 255,
): string {
  const a = Math.max(0, Math.min(255, Math.round(opaque)))
  const r = Math.max(2, Math.round(Math.min(widthPx, heightPx) * 0.22))
  return (
    `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),` +
    `if(lte(hypot(abs(W/2-X)-(W/2-${r}),abs(H/2-Y)-(H/2-${r})),${r}),${a},0),${a})`
  )
}

function shapeAlphaExpr(
  shape: CameraShape,
  widthPx: number,
  heightPx: number,
  opaque = 255,
): string | null {
  if (shape === 'rectangle') return null
  if (shape === 'circle') return circleAlphaExpr(opaque)
  return roundedBubbleAlphaExpr(widthPx, heightPx, opaque)
}

/** ffmpeg color=c= expects 0xRRGGBB (no #). */
export function cameraBorderFfmpegColor(hex: string): string {
  const normalized = hex.trim().replace(/^#/, '').toUpperCase()
  if (/^[0-9A-F]{6}$/.test(normalized)) return `0x${normalized}`
  return '0xE8EEF4'
}

/**
 * Build filter_complex that composites camera input onto the base video label.
 * `cameraInputIndex` is the ffmpeg input index (usually 1 when screen is 0).
 * Optional `drift` injects setpts before scale so start lag / duration skew match screen.
 */
export function planCameraExport(
  style: CameraOverlayStyle,
  videoSize: VideoSize,
  baseInputLabel = 'vbase',
  outputLabel = 'vout',
  cameraInputIndex = 1,
  drift?: Pick<CameraDriftCompensation, 'offsetMs' | 'ptsRate'> | null,
  /** Main-timeline enable expr from cameraOverlayEnableExpr (mid-recording mute). */
  enableExpr?: string | null,
): CameraFilterPlan {
  const normalized = normalizeCameraOverlay(style)
  const empty: CameraFilterPlan = {
    hasCamera: false,
    filterComplex: `[${baseInputLabel}]null[${outputLabel}]`,
    baseInputLabel,
    outputLabel,
    overlay: { x: 0, y: 0, w: 0, h: 0 },
    shadowApplied: false,
    borderApplied: false,
    driftApplied: false,
    mirroredApplied: false,
    opacityApplied: false,
  }

  if (!normalized.enabled) return empty

  const { width: frameW, height: frameH } = videoSize
  if (frameW <= 0 || frameH <= 0) return empty

  const norm = cameraBubbleNormRect(normalized, frameW, frameH)
  const bubbleW = evenDimension(norm.w * frameW)
  const bubbleH = evenDimension(norm.h * frameH)
  if (bubbleW < 2 || bubbleH < 2) return empty

  const x = Math.max(0, Math.round(norm.x * frameW))
  const y = Math.max(0, Math.round(norm.y * frameH))

  const wantBorder =
    normalized.borderEnabled && normalized.borderWidthPx > 0 && bubbleW >= 8 && bubbleH >= 8
  const maxInset = Math.max(0, Math.min(Math.floor((bubbleW - 4) / 2), Math.floor((bubbleH - 4) / 2)))
  const borderPx = wantBorder ? Math.min(normalized.borderWidthPx, maxInset) : 0
  const borderApplied = borderPx > 0
  const innerW = borderApplied ? evenDimension(Math.max(4, bubbleW - borderPx * 2)) : bubbleW
  const innerH = borderApplied ? evenDimension(Math.max(4, bubbleH - borderPx * 2)) : bubbleH
  if (innerW < 2 || innerH < 2) return empty

  const camX = borderApplied ? x + Math.round((bubbleW - innerW) / 2) : x
  const camY = borderApplied ? y + Math.round((bubbleH - innerH) / 2) : y

  const setpts = drift ? cameraDriftSetptsExpr(drift) : null
  const driftApplied = setpts != null
  const ptsPrefix = setpts ? `setpts=${setpts},` : ''
  const enableSuffix =
    enableExpr && enableExpr.trim().length > 0 ? `:enable='${enableExpr.trim()}'` : ''

  const mirroredApplied = normalized.mirrored
  const flipSuffix = mirroredApplied ? ',hflip' : ''
  const opacity = Math.max(0, Math.min(1, normalized.opacity))
  const opacityApplied = opacity < 0.999
  const opacityAa = opacityApplied ? Number(opacity.toFixed(3)) : 1
  const shadowAlpha = Math.max(
    0,
    Math.min(255, Math.round(CAMERA_SHADOW_ALPHA * opacity)),
  )
  const plateOpaque = Math.max(0, Math.min(255, Math.round(255 * opacity)))

  // Cover-fit camera into (possibly inset) bubble. fps+setsar stabilize MediaRecorder
  // VFR WebM; final format=yuv420p avoids libx264 "Conversion failed!" after rgba.
  const camScaled =
    `[${cameraInputIndex}:v]${ptsPrefix}fps=30,scale=${innerW}:${innerH}:force_original_aspect_ratio=increase,` +
    `crop=${innerW}:${innerH}${flipSuffix},setsar=1`

  const lines: string[] = []
  let baseLabel = baseInputLabel

  // —— Soft drop shadow (under everything) ——
  // Build at bubble size → pad for blur room → boxblur once → loop (same as background).
  const shadowApplied = normalized.shadowEnabled
  if (shadowApplied) {
    const shadowW = evenDimension(bubbleW + CAMERA_SHADOW_PAD_PX * 2)
    const shadowH = evenDimension(bubbleH + CAMERA_SHADOW_PAD_PX * 2)
    const shadowSrc = `${outputLabel}_shsrc`
    const shadowLoop = `${outputLabel}_shadow`
    const withShadow = `${outputLabel}_bgs`
    const shadowX = x - CAMERA_SHADOW_PAD_PX + CAMERA_SHADOW_OFFSET_X
    const shadowY = y - CAMERA_SHADOW_PAD_PX + CAMERA_SHADOW_OFFSET_Y
    const alpha = shapeAlphaExpr(normalized.shape, bubbleW, bubbleH, shadowAlpha)
    const blur = `boxblur=${CAMERA_SHADOW_BLUR_PX}:${Math.max(1, Math.floor(CAMERA_SHADOW_BLUR_PX / 2))}`
    const pad = `pad=${shadowW}:${shadowH}:(ow-iw)/2:(oh-ih)/2:color=0x00000000`

    if (alpha == null) {
      lines.push(
        `color=c=black:s=${bubbleW}x${bubbleH}:r=1:d=1,format=rgba,` +
          `geq=r=0:g=0:b=0:a=${shadowAlpha},${pad},${blur}[${shadowSrc}]`,
      )
    } else {
      lines.push(
        `color=c=black:s=${bubbleW}x${bubbleH}:r=1:d=1,format=rgba,` +
          `geq=r=0:g=0:b=0:a='${alpha}',${pad},${blur}[${shadowSrc}]`,
      )
    }
    lines.push(`[${shadowSrc}]loop=loop=-1:size=1[${shadowLoop}]`)
    lines.push(
      `[${baseLabel}][${shadowLoop}]overlay=${shadowX}:${shadowY}:format=auto:shortest=1${enableSuffix}[${withShadow}]`,
    )
    baseLabel = withShadow
  }

  // —— Border plate (full bubble size, same shape) ——
  if (borderApplied) {
    const borderColor = cameraBorderFfmpegColor(normalized.borderColor)
    const plateStill = `${outputLabel}_platestill`
    const plateLoop = `${outputLabel}_bord`
    const withBorder = `${outputLabel}_bb`
    const plateAlpha = shapeAlphaExpr(normalized.shape, bubbleW, bubbleH, plateOpaque)

    if (plateAlpha == null) {
      if (opacityApplied) {
        const plateRaw = `${outputLabel}_plateraw`
        lines.push(
          `color=c=${borderColor}:s=${bubbleW}x${bubbleH}:r=1:d=1,format=rgba,` +
            `colorchannelmixer=aa=${opacityAa}[${plateRaw}]`,
        )
        lines.push(`[${plateRaw}]loop=loop=-1:size=1[${plateLoop}]`)
      } else {
        lines.push(
          `color=c=${borderColor}:s=${bubbleW}x${bubbleH}:r=1:d=1,format=yuv420p[${plateStill}]`,
        )
        lines.push(`[${plateStill}]loop=loop=-1:size=1[${plateLoop}]`)
      }
      lines.push(
        `[${baseLabel}][${plateLoop}]overlay=${x}:${y}:format=auto:shortest=1${enableSuffix}[${withBorder}]`,
      )
    } else {
      const plateRaw = `${outputLabel}_plateraw`
      const plateMasked = `${outputLabel}_platemask`
      const maskStill = `${outputLabel}_pmask`
      const maskLoop = `${outputLabel}_pmaskloop`
      lines.push(
        `color=c=${borderColor}:s=${bubbleW}x${bubbleH}:r=1:d=1,format=rgba[${plateRaw}]`,
      )
      // alphamerge reads the mask's LUMA (not its alpha channel), so the mask
      // must be a grayscale still: white (255) inside the shape, black outside.
      lines.push(
        `color=c=black:s=${bubbleW}x${bubbleH}:r=1:d=1,format=gray,` +
          `geq=lum='${plateAlpha}'[${maskStill}]`,
      )
      lines.push(`[${maskStill}]loop=loop=-1:size=1[${maskLoop}]`)
      lines.push(`[${plateRaw}][${maskLoop}]alphamerge[${plateMasked}]`)
      lines.push(`[${plateMasked}]loop=loop=-1:size=1[${plateLoop}]`)
      lines.push(
        `[${baseLabel}][${plateLoop}]overlay=${x}:${y}:format=auto:shortest=1${enableSuffix}[${withBorder}]`,
      )
    }
    baseLabel = withBorder
  }

  // —— Camera video (inset when border is on) ——
  const camRaw = `${outputLabel}_raw`
  const useMask = normalized.shape !== 'rectangle'
  if (!useMask && !opacityApplied) {
    lines.push(`${camScaled},format=yuv420p[${camRaw}]`)
    lines.push(
      `[${baseLabel}][${camRaw}]overlay=${camX}:${camY}:format=auto:eof_action=pass:repeatlast=1:shortest=1${enableSuffix},` +
        `format=yuv420p[${outputLabel}]`,
    )
  } else if (!useMask && opacityApplied) {
    lines.push(
      `${camScaled},format=rgba,colorchannelmixer=aa=${opacityAa}[${camRaw}]`,
    )
    lines.push(
      `[${baseLabel}][${camRaw}]overlay=${camX}:${camY}:format=auto:eof_action=pass:repeatlast=1:shortest=1${enableSuffix},` +
        `format=yuv420p[${outputLabel}]`,
    )
  } else {
    const camMasked = `${outputLabel}_masked`
    const maskStill = `${outputLabel}_mask`
    const maskLoop = `${outputLabel}_maskloop`
    const alphaExpr =
      normalized.shape === 'circle'
        ? circleAlphaExpr(plateOpaque)
        : roundedBubbleAlphaExpr(innerW, innerH, plateOpaque)

    lines.push(`${camScaled},format=rgba[${camRaw}]`)
    // alphamerge reads the mask's LUMA (not its alpha channel), so the mask must
    // be a grayscale still: white (255) inside the shape, black (0) outside.
    // Building it as color=black + geq alpha left luma at 0 → camera fully
    // transparent (the bubble showed empty/black in exports).
    lines.push(
      `color=c=black:s=${innerW}x${innerH}:r=1:d=1,format=gray,` +
        `geq=lum='${alphaExpr}'[${maskStill}]`,
    )
    lines.push(`[${maskStill}]loop=loop=-1:size=1[${maskLoop}]`)
    lines.push(`[${camRaw}][${maskLoop}]alphamerge[${camMasked}]`)
    lines.push(
      `[${baseLabel}][${camMasked}]overlay=${camX}:${camY}:format=auto:eof_action=pass:repeatlast=1:shortest=1${enableSuffix},` +
        `format=yuv420p[${outputLabel}]`,
    )
  }

  return {
    hasCamera: true,
    filterComplex: lines.join(';'),
    baseInputLabel,
    outputLabel,
    overlay: { x, y, w: bubbleW, h: bubbleH },
    shadowApplied,
    borderApplied,
    driftApplied,
    mirroredApplied,
    opacityApplied,
  }
}
