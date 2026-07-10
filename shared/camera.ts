/**
 * FaceTime / webcam overlay layout — shared by live preview, review, and ffmpeg bake.
 * Camera video is recorded as a separate WebM; compositing uses the same relative rect.
 *
 * Coordinate scheme (preview ≡ export):
 * - Origin: top-left of the frame (0,0); +x right, +y down.
 * - `x`/`y`: top-left of the square bubble as fractions of frame width/height (0–1).
 * - `sizePercent`: bubble width as % of frame width; height = width in pixels (square).
 * - Safe margin: 3% of each axis from the frame edge (snap + clamp).
 * - Size clamp: 12–40% of frame width (min readable face; max keeps screen readable).
 * - Resize: corner handles keep the opposite corner fixed; aspect always locked (square).
 */

export type CameraCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export type CameraShape = 'circle' | 'rounded'

/** How the bubble is anchored — corner presets recompute x/y; free keeps drag position. */
export type CameraAnchor = CameraCorner | 'free'

export interface CameraOverlayStyle {
  enabled: boolean
  /** MediaDeviceInfo.deviceId; null = default camera. */
  deviceId: string | null
  /**
   * Last corner preset (or nearest after snap). When `anchor !== 'free'`, layout
   * is derived from this corner + size; when free, `x`/`y` are authoritative.
   */
  corner: CameraCorner
  /** `free` after drag; otherwise a corner preset id. */
  anchor: CameraAnchor
  /** Bubble top-left X as fraction of frame width (0–1). */
  x: number
  /** Bubble top-left Y as fraction of frame height (0–1). */
  y: number
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

/** Min/max bubble width as % of frame — keeps face readable without covering the demo. */
export const CAMERA_MIN_SIZE_PERCENT = 12
export const CAMERA_MAX_SIZE_PERCENT = 40
/** Padding from frame edge when snapped / clamped (fraction of each axis). */
export const CAMERA_SAFE_MARGIN = 0.03
/** Snap when within this fraction of a corner/edge target (of the shorter travel). */
export const CAMERA_SNAP_THRESHOLD = 0.045
/** Default aspect used when deriving corner layout without a known frame size. */
export const CAMERA_DEFAULT_ASPECT = 16 / 9

export const DEFAULT_CAMERA_OVERLAY: CameraOverlayStyle = (() => {
  const corner: CameraCorner = 'bottom-right'
  const sizePercent = 22
  const layout = layoutFromCorner(corner, sizePercent)
  return {
    enabled: false,
    deviceId: null,
    corner,
    anchor: corner,
    x: layout.x,
    y: layout.y,
    sizePercent,
    shape: 'circle' as CameraShape,
  }
})()

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isCameraCorner(value: unknown): value is CameraCorner {
  return typeof value === 'string' && (CAMERA_CORNERS as readonly string[]).includes(value)
}

/** Normalized bubble size (width fraction + height fraction for a square bubble). */
export function cameraBubbleSizeNorm(
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): { w: number; h: number } {
  const w = clamp(sizePercent, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT) / 100
  const aspect = frameAspect > 0 ? frameAspect : CAMERA_DEFAULT_ASPECT
  const h = w * aspect
  return { w, h }
}

/** Top-left (0–1) for a corner preset with safe margin. */
export function layoutFromCorner(
  corner: CameraCorner,
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): { x: number; y: number } {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect)
  const m = CAMERA_SAFE_MARGIN
  let x = m
  let y = m
  if (corner.includes('right')) x = 1 - m - w
  if (corner.includes('bottom')) y = 1 - m - h
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

/** Keep the square bubble fully inside the frame with safe margin. */
export function clampCameraLayout(
  x: number,
  y: number,
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): { x: number; y: number } {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect)
  const m = CAMERA_SAFE_MARGIN
  const maxX = Math.max(m, 1 - m - w)
  const maxY = Math.max(m, 1 - m - h)
  return {
    x: clamp(x, m, maxX),
    y: clamp(y, m, maxY),
  }
}

/** Corner handles for aspect-locked resize (square bubble). */
export type CameraResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export type CameraSnapTarget =
  | CameraCorner
  | 'top-center'
  | 'bottom-center'
  | 'left-center'
  | 'right-center'

/** Snap targets: 4 corners + 4 edge midpoints (Loom / Screen Studio–style). */
export function cameraSnapTargets(
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): Array<{ id: CameraSnapTarget; x: number; y: number }> {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect)
  const m = CAMERA_SAFE_MARGIN
  const midX = (1 - w) / 2
  const midY = (1 - h) / 2
  return [
    { id: 'top-left', x: m, y: m },
    { id: 'top-center', x: midX, y: m },
    { id: 'top-right', x: 1 - m - w, y: m },
    { id: 'left-center', x: m, y: midY },
    { id: 'right-center', x: 1 - m - w, y: midY },
    { id: 'bottom-left', x: m, y: 1 - m - h },
    { id: 'bottom-center', x: midX, y: 1 - m - h },
    { id: 'bottom-right', x: 1 - m - w, y: 1 - m - h },
  ]
}

/**
 * Snap free position to the nearest corner/edge target when within threshold.
 * Returns the snapped layout plus whether a corner preset was hit.
 */
export function snapCameraLayout(
  x: number,
  y: number,
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  threshold: number = CAMERA_SNAP_THRESHOLD,
): { x: number; y: number; corner: CameraCorner | null; snapped: boolean; target: CameraSnapTarget | null } {
  const clamped = clampCameraLayout(x, y, sizePercent, frameAspect)
  const targets = cameraSnapTargets(sizePercent, frameAspect)
  let best = targets[0]!
  let bestDist = Infinity
  for (const t of targets) {
    const d = Math.hypot(clamped.x - t.x, clamped.y - t.y)
    if (d < bestDist) {
      bestDist = d
      best = t
    }
  }
  if (bestDist <= threshold) {
    const corner = isCameraCorner(best.id) ? best.id : null
    return {
      x: best.x,
      y: best.y,
      corner,
      snapped: true,
      target: best.id,
    }
  }
  return {
    x: clamped.x,
    y: clamped.y,
    corner: null,
    snapped: false,
    target: null,
  }
}

/**
 * Aspect-locked resize from a corner handle.
 * Opposite corner stays fixed; size stays square in pixels (12–40% width).
 * Pointer x/y are frame-relative (0–1). Result is always `anchor: 'free'`.
 */
export function resizeCameraFromHandle(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  handle: CameraResizeHandle,
  pointerX: number,
  pointerY: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const aspect = frameAspect > 0 ? frameAspect : CAMERA_DEFAULT_ASPECT
  const base = normalizeCameraOverlay(style, aspect)
  const { w: curW, h: curH } = cameraBubbleSizeNorm(base.sizePercent, aspect)

  // Fixed point = opposite corner of the bubble (stays put while resizing).
  let fixedX = base.x
  let fixedY = base.y
  if (handle === 'nw' || handle === 'sw') fixedX = base.x + curW
  if (handle === 'nw' || handle === 'ne') fixedY = base.y + curH

  const rawW = Math.abs(pointerX - fixedX)
  // Height fraction → equivalent width fraction for a pixel-square bubble.
  const rawWFromH = Math.abs(pointerY - fixedY) / aspect
  const sizeFrac = clamp(
    Math.max(rawW, rawWFromH),
    CAMERA_MIN_SIZE_PERCENT / 100,
    CAMERA_MAX_SIZE_PERCENT / 100,
  )
  const sizePercent = Math.round(sizeFrac * 100)
  const { w, h } = cameraBubbleSizeNorm(sizePercent, aspect)

  let x = fixedX
  let y = fixedY
  if (handle === 'nw' || handle === 'sw') x = fixedX - w
  if (handle === 'nw' || handle === 'ne') y = fixedY - h
  // se: x/y already at fixed (top-left); ne: x at fixed, y above; sw: y at fixed, x left

  const clamped = clampCameraLayout(x, y, sizePercent, aspect)
  return normalizeCameraOverlay(
    {
      ...base,
      anchor: 'free',
      x: clamped.x,
      y: clamped.y,
      sizePercent,
    },
    aspect,
  )
}

/** Apply a corner preset — sets anchor + recomputes x/y. */
export function applyCameraCornerPreset(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  corner: CameraCorner,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const sizePercent = clamp(
    style.sizePercent ?? DEFAULT_CAMERA_OVERLAY.sizePercent,
    CAMERA_MIN_SIZE_PERCENT,
    CAMERA_MAX_SIZE_PERCENT,
  )
  const layout = layoutFromCorner(corner, sizePercent, frameAspect)
  return normalizeCameraOverlay({
    ...style,
    corner,
    anchor: corner,
    x: layout.x,
    y: layout.y,
    sizePercent,
  }, frameAspect)
}

/** Clamp overlay style to safe UI/export ranges; fill x/y from corner when needed. */
export function normalizeCameraOverlay(
  partial: Partial<CameraOverlayStyle> | null | undefined,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const corner = isCameraCorner(partial?.corner)
    ? partial!.corner
    : DEFAULT_CAMERA_OVERLAY.corner
  const shape: CameraShape = partial?.shape === 'rounded' ? 'rounded' : 'circle'
  const sizeRaw = partial?.sizePercent ?? DEFAULT_CAMERA_OVERLAY.sizePercent
  const sizePercent = Math.round(
    clamp(sizeRaw, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT),
  )
  const deviceId =
    typeof partial?.deviceId === 'string' && partial.deviceId.trim().length > 0
      ? partial.deviceId.trim()
      : null

  const anchorRaw = partial?.anchor
  const anchor: CameraAnchor =
    anchorRaw === 'free'
      ? 'free'
      : isCameraCorner(anchorRaw)
        ? anchorRaw
        : corner

  const hasFreeXY =
    typeof partial?.x === 'number' &&
    Number.isFinite(partial.x) &&
    typeof partial?.y === 'number' &&
    Number.isFinite(partial.y)

  let x: number
  let y: number
  let resolvedCorner = corner
  let resolvedAnchor = anchor

  if (resolvedAnchor === 'free' && hasFreeXY) {
    const clamped = clampCameraLayout(partial!.x!, partial!.y!, sizePercent, frameAspect)
    x = clamped.x
    y = clamped.y
  } else if (isCameraCorner(resolvedAnchor)) {
    const layout = layoutFromCorner(resolvedAnchor, sizePercent, frameAspect)
    x = layout.x
    y = layout.y
    resolvedCorner = resolvedAnchor
  } else if (hasFreeXY) {
    const clamped = clampCameraLayout(partial!.x!, partial!.y!, sizePercent, frameAspect)
    x = clamped.x
    y = clamped.y
    resolvedAnchor = 'free'
  } else {
    const layout = layoutFromCorner(resolvedCorner, sizePercent, frameAspect)
    x = layout.x
    y = layout.y
    resolvedAnchor = resolvedCorner
  }

  return {
    enabled: Boolean(partial?.enabled),
    deviceId,
    corner: resolvedCorner,
    anchor: resolvedAnchor,
    x,
    y,
    sizePercent,
    shape,
  }
}

/** CSS inset + size for the bubble relative to a positioned parent frame. */
export function cameraBubblePosition(style: CameraOverlayStyle): {
  top: string
  left: string
  width: string
  borderRadius: string
} {
  const normalized = normalizeCameraOverlay(style)
  return {
    top: `${normalized.y * 100}%`,
    left: `${normalized.x * 100}%`,
    width: `${normalized.sizePercent}%`,
    borderRadius: normalized.shape === 'circle' ? '50%' : '22%',
  }
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
  if (frameWidth <= 0 || frameHeight <= 0) {
    return { x: 0, y: 0, w: 0, h: 0 }
  }
  const aspect = frameWidth / frameHeight
  const normalized = normalizeCameraOverlay(style, aspect)
  const { w, h } = cameraBubbleSizeNorm(normalized.sizePercent, aspect)
  return {
    x: normalized.x,
    y: normalized.y,
    w,
    h,
  }
}
