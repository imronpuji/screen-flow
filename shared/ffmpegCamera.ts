/**
 * Plan ffmpeg overlay for FaceTime/webcam bubble bake into export.
 * Matches shared/camera.ts layout (relative x/y + size%, circle/rounded).
 *
 * Mask uses a ONE-FRAME geq alpha → loop → alphamerge (same pattern as
 * background rounded corners) so we never run geq per video frame.
 */

import {
  cameraBubbleNormRect,
  normalizeCameraOverlay,
  type CameraOverlayStyle,
} from './camera.js'
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
  /** Pixel rect used for overlay (for smoke asserts). */
  overlay: { x: number; y: number; w: number; h: number }
}

/** Circle alpha: opaque inside radius, else transparent (bubble is square → W/2). */
export function circleAlphaExpr(opaque = 255): string {
  const a = Math.max(0, Math.min(255, Math.round(opaque)))
  return `if(lte(hypot(X-W/2,Y-H/2),W/2),${a},0)`
}

/**
 * Rounded-square alpha (~22% CSS border-radius on the bubble).
 * Commas stay inside single quotes so filter_complex does not split them.
 */
export function roundedBubbleAlphaExpr(sizePx: number, opaque = 255): string {
  const a = Math.max(0, Math.min(255, Math.round(opaque)))
  const r = Math.max(2, Math.round(sizePx * 0.22))
  return (
    `if(gt(abs(W/2-X),W/2-${r})*gt(abs(H/2-Y),H/2-${r}),` +
    `if(lte(hypot(abs(W/2-X)-(W/2-${r}),abs(H/2-Y)-(H/2-${r})),${r}),${a},0),${a})`
  )
}

/**
 * Build filter_complex that composites camera input onto the base video label.
 * `cameraInputIndex` is the ffmpeg input index (usually 1 when screen is 0).
 */
export function planCameraExport(
  style: CameraOverlayStyle,
  videoSize: VideoSize,
  baseInputLabel = 'vbase',
  outputLabel = 'vcam',
  cameraInputIndex = 1,
): CameraFilterPlan {
  const normalized = normalizeCameraOverlay(style)
  const empty = {
    hasCamera: false,
    filterComplex: `[${baseInputLabel}]null[${outputLabel}]`,
    baseInputLabel,
    outputLabel,
    overlay: { x: 0, y: 0, w: 0, h: 0 },
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

  const camRaw = `${outputLabel}_raw`
  const camMasked = `${outputLabel}_masked`
  const maskStill = `${outputLabel}_mask`
  const maskLoop = `${outputLabel}_maskloop`

  const alphaExpr =
    normalized.shape === 'circle'
      ? circleAlphaExpr(255)
      : roundedBubbleAlphaExpr(bubbleW, 255)

  // Cover-fit camera into square bubble, then attach 1-frame alpha mask.
  // fps+setsar stabilize MediaRecorder VFR WebM; final format=yuv420p avoids
  // libx264 "Conversion failed!" after rgba/yuva overlay on some macOS builds.
  const lines: string[] = [
    `[${cameraInputIndex}:v]fps=30,scale=${bubbleW}:${bubbleH}:force_original_aspect_ratio=increase,` +
      `crop=${bubbleW}:${bubbleH},setsar=1,format=rgba[${camRaw}]`,
    `color=c=black:s=${bubbleW}x${bubbleH}:r=1:d=1,format=rgba,` +
      `geq=r=0:g=0:b=0:a='${alphaExpr}'[${maskStill}]`,
    `[${maskStill}]loop=loop=-1:size=1[${maskLoop}]`,
    `[${camRaw}][${maskLoop}]alphamerge[${camMasked}]`,
    `[${baseInputLabel}][${camMasked}]overlay=${x}:${y}:format=auto:eof_action=pass:repeatlast=1:shortest=1,` +
      `format=yuv420p[${outputLabel}]`,
  ]

  return {
    hasCamera: true,
    filterComplex: lines.join(';'),
    baseInputLabel,
    outputLabel,
    overlay: { x, y, w: bubbleW, h: bubbleH },
  }
}
