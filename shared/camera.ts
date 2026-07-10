/**
 * FaceTime / webcam overlay layout — shared by live preview, review, and (later) ffmpeg bake.
 * Camera video is recorded as a separate WebM; compositing uses the same corner/size/shape.
 */

export type CameraCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export type CameraShape = 'circle' | 'rounded'

export interface CameraOverlayStyle {
  enabled: boolean
  /** MediaDeviceInfo.deviceId; null = default camera. */
  deviceId: string | null
  corner: CameraCorner
  /** Bubble width as % of the preview/frame width (12–40). */
  sizePercent: number
  shape: CameraShape
}

export const CAMERA_CORNERS: readonly CameraCorner[] = [
  'bottom-right',
  'bottom-left',
  'top-right',
  'top-left',
] as const

export const DEFAULT_CAMERA_OVERLAY: CameraOverlayStyle = {
  enabled: false,
  deviceId: null,
  corner: 'bottom-right',
  sizePercent: 22,
  shape: 'circle',
}

const MIN_SIZE = 12
const MAX_SIZE = 40
const MARGIN_PERCENT = 3

/** Clamp overlay style to safe UI/export ranges. */
export function normalizeCameraOverlay(
  partial: Partial<CameraOverlayStyle> | null | undefined,
): CameraOverlayStyle {
  const corner = CAMERA_CORNERS.includes(partial?.corner as CameraCorner)
    ? (partial!.corner as CameraCorner)
    : DEFAULT_CAMERA_OVERLAY.corner
  const shape: CameraShape = partial?.shape === 'rounded' ? 'rounded' : 'circle'
  const sizeRaw = partial?.sizePercent ?? DEFAULT_CAMERA_OVERLAY.sizePercent
  const sizePercent = Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(sizeRaw)))
  const deviceId =
    typeof partial?.deviceId === 'string' && partial.deviceId.trim().length > 0
      ? partial.deviceId.trim()
      : null

  return {
    enabled: Boolean(partial?.enabled),
    deviceId,
    corner,
    sizePercent,
    shape,
  }
}

/** CSS inset + size for the bubble relative to a positioned parent frame. */
export function cameraBubblePosition(style: CameraOverlayStyle): {
  top?: string
  bottom?: string
  left?: string
  right?: string
  width: string
  borderRadius: string
} {
  const normalized = normalizeCameraOverlay(style)
  const margin = `${MARGIN_PERCENT}%`
  const width = `${normalized.sizePercent}%`
  const borderRadius = normalized.shape === 'circle' ? '50%' : '22%'

  const pos: {
    top?: string
    bottom?: string
    left?: string
    right?: string
    width: string
    borderRadius: string
  } = { width, borderRadius }

  if (normalized.corner.includes('top')) pos.top = margin
  else pos.bottom = margin
  if (normalized.corner.includes('left')) pos.left = margin
  else pos.right = margin

  return pos
}

/**
 * Normalized rect (0–1) for ffmpeg overlay: x/y = top-left of bubble, w/h = size.
 * Assumes square bubble (circle/rounded) sized by width percent of frame.
 */
export function cameraBubbleNormRect(
  style: CameraOverlayStyle,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; w: number; h: number } {
  const normalized = normalizeCameraOverlay(style)
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const wPx = (normalized.sizePercent / 100) * frameWidth
  const hPx = wPx // square bubble
  const marginX = (MARGIN_PERCENT / 100) * frameWidth
  const marginY = (MARGIN_PERCENT / 100) * frameHeight

  let x = marginX
  let y = marginY
  if (normalized.corner.includes('right')) x = frameWidth - marginX - wPx
  if (normalized.corner.includes('bottom')) y = frameHeight - marginY - hPx

  return {
    x: x / frameWidth,
    y: y / frameHeight,
    w: wPx / frameWidth,
    h: hPx / frameHeight,
  }
}
