/**
 * FaceTime / webcam overlay layout — shared by live preview, review, and ffmpeg bake.
 * Camera video is recorded as a separate WebM; compositing uses the same relative rect.
 *
 * Coordinate scheme (preview ≡ export):
 * - Origin: top-left of the frame (0,0); +x right, +y down.
 * - `x`/`y`: top-left of the bubble as fractions of frame width/height (0–1).
 * - `sizePercent`: bubble width as % of frame width (12–40).
 * - `heightPercent`: bubble height as % of frame **width** (same units; 12–40).
 *   When `lockAspect` is true (default), heightPercent === sizePercent → square in pixels.
 * - Safe margin: 3% of each axis from the frame edge (snap + clamp).
 * - Resize: corner handles keep the opposite corner fixed; aspect locked unless user unlocks
 *   (rectangle/rounded only — circle always locked square).
 * - Snap: 4 corners + 4 edge midpoints; live magnetic snap while dragging; presets for all 8.
 * - Nudge: arrow keys move free layout by small relative steps (Shift = larger); clamps to safe margin.
 * - Size nudge: +/- (or =/_) adjust width % (Shift = larger); lockAspect keeps height in sync; reclamps.
 * - Size presets: S/M/L quick widths (16/22/32%); keys 1/2/3 when bubble focused.
 * - Layout reset: key 0 / double-click → bottom-right + medium size (keeps device/chrome/shape).
 * - Snap cycle: `[` / `]` walk 8 presets clockwise (corners + edge mids) when bubble focused.
 * - Shape cycle: `C` walks circle → rounded → rectangle (keeps size/position; circle re-locks).
 * - Layout map (chrome): click-to-place via `placeCameraAtPoint` (center → snap); same relative
 *   coords as preview/export so mid-recording edits stay visible without burn-in on screen WebM.
 * - Shapes: circle (50% radius), rounded (~22% of min side), rectangle (0 — no ffmpeg alpha mask).
 * - Chrome: optional outline (width + color) + soft drop shadow — preview CSS ≡ ffmpeg bake.
 * - Mirror: horizontal flip (FaceTime selfie); preview scaleX(-1) ≡ ffmpeg hflip.
 * - Opacity: bubble fade 35–100% (preview CSS opacity ≡ ffmpeg alpha / colorchannelmixer).
 * - Mic: optional audio captured on the same MediaRecorder as camera video (one A/V track);
 *   export maps camera audio into the MP4; mid-recording mute disables audio+video tracks.
 */

export type CameraCorner = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left'

export type CameraShape = 'circle' | 'rounded' | 'rectangle'

export const CAMERA_SHAPES: readonly CameraShape[] = [
  'circle',
  'rounded',
  'rectangle',
] as const

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
  /**
   * Bubble height as % of frame **width** (same units as sizePercent, 12–40).
   * Equals sizePercent when aspect-locked (square in pixels).
   */
  heightPercent: number
  /**
   * When true, resize keeps a pixel-square bubble (heightPercent = sizePercent).
   * Circle always forces lock; rectangle/rounded may unlock for free resize.
   */
  lockAspect: boolean
  shape: CameraShape
  /** Soft drop shadow under the bubble (preview box-shadow ≡ ffmpeg still+blur). */
  shadowEnabled: boolean
  /** Outline around the bubble. */
  borderEnabled: boolean
  /** Outline thickness in CSS/logical px (1–6); ignored when borderEnabled is false. */
  borderWidthPx: number
  /** Outline color as #RRGGBB (preview + ffmpeg plate). */
  borderColor: string
  /**
   * Horizontal mirror (FaceTime selfie). Preview uses CSS scaleX(-1);
   * export uses ffmpeg `hflip` on the camera stream.
   */
  mirrored: boolean
  /** Bubble opacity 0.35–1 (preview CSS ≡ ffmpeg alpha on camera/chrome). */
  opacity: number
  /**
   * Include microphone on the camera MediaRecorder (same WebM as FaceTime video).
   * Preview stays muted locally; export maps this audio into the MP4.
   * Falls back to video-only if mic permission is denied.
   */
  micEnabled: boolean
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
/** Arrow-key nudge step as fraction of frame (≈0.5%). */
export const CAMERA_NUDGE_STEP = 0.005
/** Shift+arrow nudge step as fraction of frame (≈2%). */
export const CAMERA_NUDGE_STEP_SHIFT = 0.02
/** +/- size nudge step in sizePercent points. */
export const CAMERA_SIZE_NUDGE_STEP = 1
/** Shift+/- size nudge step in sizePercent points. */
export const CAMERA_SIZE_NUDGE_STEP_SHIFT = 4

export type CameraNudgeDirection = 'left' | 'right' | 'up' | 'down'
export type CameraSizeNudgeDirection = 'grow' | 'shrink'

/** Quick width presets (within 12–40%) — S readable face, M default, L presenter. */
export type CameraSizePresetId = 'small' | 'medium' | 'large'
export const CAMERA_SIZE_PRESETS: readonly {
  id: CameraSizePresetId
  label: string
  sizePercent: number
}[] = [
  { id: 'small', label: 'S', sizePercent: 16 },
  { id: 'medium', label: 'M', sizePercent: 22 },
  { id: 'large', label: 'L', sizePercent: 32 },
] as const
/** Default aspect used when deriving corner layout without a known frame size. */
export const CAMERA_DEFAULT_ASPECT = 16 / 9

/** Outline thickness clamp (logical px) — thin enough for small bubbles, visible on 1080p. */
export const CAMERA_MIN_BORDER_PX = 1
export const CAMERA_MAX_BORDER_PX = 6
/** Default outline — soft off-white matching prior hardcoded CSS. */
export const CAMERA_DEFAULT_BORDER_COLOR = '#E8EEF4'
export const CAMERA_DEFAULT_BORDER_WIDTH_PX = 2

/** Opacity clamp — below ~35% the face is unreadable; 100% = solid. */
export const CAMERA_MIN_OPACITY = 0.35
export const CAMERA_MAX_OPACITY = 1
export const CAMERA_DEFAULT_OPACITY = 1
/** Default FaceTime selfie mirror (live + export). */
export const CAMERA_DEFAULT_MIRRORED = true
/** Default: capture mic with camera so voiceover stays locked to the face track. */
export const CAMERA_DEFAULT_MIC_ENABLED = true

/** Quick outline swatches (preview ≡ export via borderColor). */
export const CAMERA_BORDER_COLOR_PRESETS: readonly {
  id: string
  label: string
  color: string
}[] = [
  { id: 'frost', label: 'Frost', color: '#E8EEF4' },
  { id: 'white', label: 'White', color: '#FFFFFF' },
  { id: 'ink', label: 'Ink', color: '#1A1F26' },
  { id: 'teal', label: 'Teal', color: '#3DD6C6' },
  { id: 'amber', label: 'Amber', color: '#F0A05A' },
  { id: 'rose', label: 'Rose', color: '#E879A9' },
] as const

/** True when the shape may unlock aspect (circle stays square). */
export function cameraShapeAllowsFreeAspect(shape: CameraShape): boolean {
  return shape === 'rectangle' || shape === 'rounded'
}

export const DEFAULT_CAMERA_OVERLAY: CameraOverlayStyle = (() => {
  const corner: CameraCorner = 'bottom-right'
  const sizePercent = 22
  const layout = layoutFromCorner(corner, sizePercent, CAMERA_DEFAULT_ASPECT, sizePercent)
  return {
    enabled: false,
    deviceId: null,
    corner,
    anchor: corner,
    x: layout.x,
    y: layout.y,
    sizePercent,
    heightPercent: sizePercent,
    lockAspect: true,
    shape: 'circle' as CameraShape,
    shadowEnabled: true,
    borderEnabled: true,
    borderWidthPx: CAMERA_DEFAULT_BORDER_WIDTH_PX,
    borderColor: CAMERA_DEFAULT_BORDER_COLOR,
    mirrored: CAMERA_DEFAULT_MIRRORED,
    opacity: CAMERA_DEFAULT_OPACITY,
    micEnabled: CAMERA_DEFAULT_MIC_ENABLED,
  }
})()

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isCameraCorner(value: unknown): value is CameraCorner {
  return typeof value === 'string' && (CAMERA_CORNERS as readonly string[]).includes(value)
}

function isCameraShape(value: unknown): value is CameraShape {
  return typeof value === 'string' && (CAMERA_SHAPES as readonly string[]).includes(value)
}

/** Normalize #RGB / #RRGGBB (optional alpha ignored) → uppercase #RRGGBB; else default. */
export function normalizeCameraBorderColor(value: unknown): string {
  if (typeof value !== 'string') return CAMERA_DEFAULT_BORDER_COLOR
  const raw = value.trim()
  const short = /^#([0-9a-fA-F]{3})$/.exec(raw)
  if (short) {
    const [r, g, b] = short[1]!.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  const full = /^#([0-9a-fA-F]{6})([0-9a-fA-F]{2})?$/.exec(raw)
  if (full) return `#${full[1]!.toUpperCase()}`
  return CAMERA_DEFAULT_BORDER_COLOR
}

/** CSS border-radius for preview — must match ffmpeg mask (circle/rounded) or none (rectangle). */
export function cameraShapeBorderRadius(shape: CameraShape): string {
  if (shape === 'circle') return '50%'
  if (shape === 'rounded') return '22%'
  return '0'
}

/**
 * Preview chrome (border + shadow) — same knobs ffmpeg bakes.
 * Shadow approximates `0 10px 28px rgba(0,0,0,0.45)` when enabled.
 */
export function cameraBubbleChromeStyle(style: CameraOverlayStyle): {
  border: string
  boxShadow: string
} {
  const normalized = normalizeCameraOverlay(style)
  const border =
    normalized.borderEnabled && normalized.borderWidthPx > 0
      ? `${normalized.borderWidthPx}px solid ${normalized.borderColor}`
      : 'none'
  const boxShadow = normalized.shadowEnabled
    ? '0 10px 28px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(61, 214, 198, 0.18)'
    : 'none'
  return { border, boxShadow }
}

/** Normalized bubble size (width + height fractions of the frame). */
export function cameraBubbleSizeNorm(
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  heightPercent: number = sizePercent,
): { w: number; h: number } {
  const w = clamp(sizePercent, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT) / 100
  const heightPct = clamp(heightPercent, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT)
  const aspect = frameAspect > 0 ? frameAspect : CAMERA_DEFAULT_ASPECT
  // heightPercent is % of frame width → pixel height / frameH = (pct/100)*frameW/frameH
  const h = (heightPct / 100) * aspect
  return { w, h }
}

/** Top-left (0–1) for a corner preset with safe margin. */
export function layoutFromCorner(
  corner: CameraCorner,
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  heightPercent: number = sizePercent,
): { x: number; y: number } {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect, heightPercent)
  const m = CAMERA_SAFE_MARGIN
  let x = m
  let y = m
  if (corner.includes('right')) x = 1 - m - w
  if (corner.includes('bottom')) y = 1 - m - h
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

/** Keep the bubble fully inside the frame with safe margin. */
export function clampCameraLayout(
  x: number,
  y: number,
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  heightPercent: number = sizePercent,
): { x: number; y: number } {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect, heightPercent)
  const m = CAMERA_SAFE_MARGIN
  const maxX = Math.max(m, 1 - m - w)
  const maxY = Math.max(m, 1 - m - h)
  return {
    x: clamp(x, m, maxX),
    y: clamp(y, m, maxY),
  }
}

/** Corner handles for resize (aspect-locked square, or free when unlocked). */
export type CameraResizeHandle = 'nw' | 'ne' | 'sw' | 'se'

export type CameraSnapTarget =
  | CameraCorner
  | 'top-center'
  | 'bottom-center'
  | 'left-center'
  | 'right-center'

/** Edge midpoints only (corners live in CAMERA_CORNERS). */
export const CAMERA_EDGE_TARGETS: readonly Exclude<CameraSnapTarget, CameraCorner>[] = [
  'top-center',
  'bottom-center',
  'left-center',
  'right-center',
] as const

/** All quick-position presets: 4 corners + 4 edge mids. */
export const CAMERA_SNAP_PRESETS: readonly CameraSnapTarget[] = [
  ...CAMERA_CORNERS,
  ...CAMERA_EDGE_TARGETS,
] as const

/**
 * Clockwise walk order for `[` / `]` snap cycling (starts top-left, around the frame).
 * Distinct from CAMERA_SNAP_PRESETS listing order (corners then edges).
 */
export const CAMERA_SNAP_CYCLE_ORDER: readonly CameraSnapTarget[] = [
  'top-left',
  'top-center',
  'top-right',
  'right-center',
  'bottom-right',
  'bottom-center',
  'bottom-left',
  'left-center',
] as const

/** Short labels for preset buttons / selects. */
export function cameraSnapPresetLabel(target: CameraSnapTarget): string {
  switch (target) {
    case 'top-left':
      return 'Top left'
    case 'top-center':
      return 'Top'
    case 'top-right':
      return 'Top right'
    case 'left-center':
      return 'Left'
    case 'right-center':
      return 'Right'
    case 'bottom-left':
      return 'Bottom left'
    case 'bottom-center':
      return 'Bottom'
    case 'bottom-right':
      return 'Bottom right'
    default:
      return target
  }
}

export function isCameraSnapTarget(value: unknown): value is CameraSnapTarget {
  return (
    typeof value === 'string' &&
    (CAMERA_SNAP_PRESETS as readonly string[]).includes(value)
  )
}

/** Snap targets: 4 corners + 4 edge midpoints (Loom / Screen Studio–style). */
export function cameraSnapTargets(
  sizePercent: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  heightPercent: number = sizePercent,
): Array<{ id: CameraSnapTarget; x: number; y: number }> {
  const { w, h } = cameraBubbleSizeNorm(sizePercent, frameAspect, heightPercent)
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
 * Place the bubble so its center sits at a frame-relative point (0–1), then
 * magnetic-snap. Used by the chrome layout map (click-to-place) so setup and
 * mid-recording position edits share the same relative coords as preview/export.
 */
export function placeCameraAtPoint(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  pointerX: number,
  pointerY: number,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  threshold: number = CAMERA_SNAP_THRESHOLD * 2,
): CameraOverlayStyle {
  const aspect = frameAspect > 0 ? frameAspect : CAMERA_DEFAULT_ASPECT
  const base = normalizeCameraOverlay(style, aspect)
  const { w, h } = cameraBubbleSizeNorm(
    base.sizePercent,
    aspect,
    base.heightPercent,
  )
  const x = Number.isFinite(pointerX) ? pointerX - w / 2 : base.x
  const y = Number.isFinite(pointerY) ? pointerY - h / 2 : base.y
  const snapped = snapCameraLayout(
    x,
    y,
    base.sizePercent,
    aspect,
    threshold,
    base.heightPercent,
  )
  if (snapped.snapped && snapped.target) {
    return applyCameraSnapPreset(base, snapped.target, aspect)
  }
  const clamped = clampCameraLayout(
    snapped.x,
    snapped.y,
    base.sizePercent,
    aspect,
    base.heightPercent,
  )
  return normalizeCameraOverlay(
    {
      ...base,
      anchor: 'free',
      x: clamped.x,
      y: clamped.y,
      sizePercent: base.sizePercent,
      heightPercent: base.heightPercent,
    },
    aspect,
  )
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
  heightPercent: number = sizePercent,
): { x: number; y: number; corner: CameraCorner | null; snapped: boolean; target: CameraSnapTarget | null } {
  const clamped = clampCameraLayout(x, y, sizePercent, frameAspect, heightPercent)
  const targets = cameraSnapTargets(sizePercent, frameAspect, heightPercent)
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
 * Resize from a corner handle. Opposite corner stays fixed.
 * When lockAspect (or circle): size stays square in pixels (12–40% width).
 * When unlocked (rectangle/rounded): width & height move independently.
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
  const lock = base.lockAspect || !cameraShapeAllowsFreeAspect(base.shape)
  const { w: curW, h: curH } = cameraBubbleSizeNorm(
    base.sizePercent,
    aspect,
    base.heightPercent,
  )

  // Fixed point = opposite corner of the bubble (stays put while resizing).
  let fixedX = base.x
  let fixedY = base.y
  if (handle === 'nw' || handle === 'sw') fixedX = base.x + curW
  if (handle === 'nw' || handle === 'ne') fixedY = base.y + curH

  if (lock) {
    const rawW = Math.abs(pointerX - fixedX)
    // Height fraction → equivalent width fraction for a pixel-square bubble.
    const rawWFromH = Math.abs(pointerY - fixedY) / aspect
    const sizeFrac = clamp(
      Math.max(rawW, rawWFromH),
      CAMERA_MIN_SIZE_PERCENT / 100,
      CAMERA_MAX_SIZE_PERCENT / 100,
    )
    const sizePercent = Math.round(sizeFrac * 100)
    const { w, h } = cameraBubbleSizeNorm(sizePercent, aspect, sizePercent)

    let x = fixedX
    let y = fixedY
    if (handle === 'nw' || handle === 'sw') x = fixedX - w
    if (handle === 'nw' || handle === 'ne') y = fixedY - h

    const clamped = clampCameraLayout(x, y, sizePercent, aspect, sizePercent)
    return normalizeCameraOverlay(
      {
        ...base,
        anchor: 'free',
        lockAspect: true,
        x: clamped.x,
        y: clamped.y,
        sizePercent,
        heightPercent: sizePercent,
      },
      aspect,
    )
  }

  // Free aspect: width from Δx, height from Δy (heightPercent in frame-width units).
  const rawW = Math.abs(pointerX - fixedX)
  const rawHFrac = Math.abs(pointerY - fixedY)
  const sizePercent = Math.round(
    clamp(rawW, CAMERA_MIN_SIZE_PERCENT / 100, CAMERA_MAX_SIZE_PERCENT / 100) * 100,
  )
  const heightPercent = Math.round(
    clamp(
      rawHFrac / aspect,
      CAMERA_MIN_SIZE_PERCENT / 100,
      CAMERA_MAX_SIZE_PERCENT / 100,
    ) * 100,
  )
  const { w, h } = cameraBubbleSizeNorm(sizePercent, aspect, heightPercent)

  let x = fixedX
  let y = fixedY
  if (handle === 'nw' || handle === 'sw') x = fixedX - w
  if (handle === 'nw' || handle === 'ne') y = fixedY - h

  const clamped = clampCameraLayout(x, y, sizePercent, aspect, heightPercent)
  return normalizeCameraOverlay(
    {
      ...base,
      anchor: 'free',
      lockAspect: false,
      x: clamped.x,
      y: clamped.y,
      sizePercent,
      heightPercent,
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
  return applyCameraSnapPreset(style, corner, frameAspect)
}

/**
 * Apply any snap preset (corner or edge mid).
 * Corners set `anchor` to that corner; edge mids use `anchor: 'free'` with snapped x/y
 * and keep `corner` as a nearby corner for fallback UI that only lists corners.
 */
export function applyCameraSnapPreset(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  target: CameraSnapTarget,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  // Normalize first so lockAspect / heightPercent stay consistent with sizePercent
  // (avoids DEFAULT heightPercent lingering after a size-only override).
  const base = normalizeCameraOverlay(style, frameAspect)
  const sizePercent = base.sizePercent
  const heightPercent = base.heightPercent
  const targets = cameraSnapTargets(sizePercent, frameAspect, heightPercent)
  const hit = targets.find((t) => t.id === target)
  if (!hit) {
    return base
  }

  if (isCameraCorner(target)) {
    return normalizeCameraOverlay(
      {
        ...base,
        corner: target,
        anchor: target,
        x: hit.x,
        y: hit.y,
        sizePercent,
        heightPercent,
      },
      frameAspect,
    )
  }

  const cornerGuess: CameraCorner =
    target === 'top-center' || target === 'left-center'
      ? 'top-left'
      : target === 'right-center'
        ? 'top-right'
        : 'bottom-right'

  return normalizeCameraOverlay(
    {
      ...base,
      corner: cornerGuess,
      anchor: 'free',
      x: hit.x,
      y: hit.y,
      sizePercent,
      heightPercent,
    },
    frameAspect,
  )
}

/**
 * Which snap preset (if any) matches the current layout within epsilon.
 * Used to highlight active position buttons after drag/snap.
 */
export function matchCameraSnapTarget(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
  epsilon: number = 0.012,
): CameraSnapTarget | null {
  const normalized = normalizeCameraOverlay(style, frameAspect)
  if (isCameraCorner(normalized.anchor)) {
    return normalized.anchor
  }
  const targets = cameraSnapTargets(
    normalized.sizePercent,
    frameAspect,
    normalized.heightPercent,
  )
  let best: CameraSnapTarget | null = null
  let bestDist = Infinity
  for (const t of targets) {
    const d = Math.hypot(normalized.x - t.x, normalized.y - t.y)
    if (d < bestDist) {
      bestDist = d
      best = t.id
    }
  }
  return bestDist <= epsilon ? best : null
}

export type CameraCycleDirection = 'next' | 'prev'

/**
 * Cycle snap preset clockwise (`next` / `]`) or counter-clockwise (`prev` / `[`).
 * If layout is free/custom, starts from nearest target then steps once.
 */
export function cycleCameraSnapPreset(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  direction: CameraCycleDirection = 'next',
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const order = CAMERA_SNAP_CYCLE_ORDER
  const matched = matchCameraSnapTarget(style, frameAspect)
  const currentIndex = matched ? order.indexOf(matched) : -1
  const step = direction === 'next' ? 1 : -1
  const from =
    currentIndex >= 0
      ? currentIndex
      : // Custom: jump from nearest (even outside epsilon) then step.
        (() => {
          const nearest = matchCameraSnapTarget(style, frameAspect, 1)
          const idx = nearest ? order.indexOf(nearest) : 0
          return idx >= 0 ? idx : 0
        })()
  const nextIndex = (from + step + order.length) % order.length
  return applyCameraSnapPreset(style, order[nextIndex]!, frameAspect)
}

/**
 * Cycle bubble shape: circle → rounded → rectangle → …
 * Circle forces aspect lock + square height; other shapes keep lockAspect as-is.
 */
export function cycleCameraShape(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  direction: CameraCycleDirection = 'next',
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const base = normalizeCameraOverlay(style, frameAspect)
  const order = CAMERA_SHAPES
  const currentIndex = Math.max(0, order.indexOf(base.shape))
  const step = direction === 'next' ? 1 : -1
  const nextIndex = (currentIndex + step + order.length) % order.length
  const shape = order[nextIndex]!
  if (shape === 'circle') {
    return normalizeCameraOverlay(
      {
        ...base,
        shape,
        lockAspect: true,
        heightPercent: base.sizePercent,
      },
      frameAspect,
    )
  }
  return normalizeCameraOverlay({ ...base, shape }, frameAspect)
}

/**
 * Nudge bubble by a small relative step (arrow keys). Always becomes free layout;
 * clamps to safe margin. Shift uses a larger step for faster fine-tuning.
 */
export function nudgeCameraLayout(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  direction: CameraNudgeDirection,
  options: { shift?: boolean; frameAspect?: number } = {},
): CameraOverlayStyle {
  const aspect =
    options.frameAspect && options.frameAspect > 0
      ? options.frameAspect
      : CAMERA_DEFAULT_ASPECT
  const base = normalizeCameraOverlay(style, aspect)
  const step = options.shift ? CAMERA_NUDGE_STEP_SHIFT : CAMERA_NUDGE_STEP
  let x = base.x
  let y = base.y
  if (direction === 'left') x -= step
  else if (direction === 'right') x += step
  else if (direction === 'up') y -= step
  else y += step
  const clamped = clampCameraLayout(
    x,
    y,
    base.sizePercent,
    aspect,
    base.heightPercent,
  )
  return normalizeCameraOverlay(
    {
      ...base,
      anchor: 'free',
      x: clamped.x,
      y: clamped.y,
      sizePercent: base.sizePercent,
      heightPercent: base.heightPercent,
    },
    aspect,
  )
}

/**
 * Grow/shrink bubble width by sizePercent points (+/- keys). When lockAspect,
 * height follows. Position reclamped via normalize (corner presets re-layout).
 */
export function nudgeCameraSize(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  direction: CameraSizeNudgeDirection,
  options: { shift?: boolean; frameAspect?: number } = {},
): CameraOverlayStyle {
  const aspect =
    options.frameAspect && options.frameAspect > 0
      ? options.frameAspect
      : CAMERA_DEFAULT_ASPECT
  const base = normalizeCameraOverlay(style, aspect)
  const step = options.shift ? CAMERA_SIZE_NUDGE_STEP_SHIFT : CAMERA_SIZE_NUDGE_STEP
  const delta = direction === 'grow' ? step : -step
  const sizePercent = base.sizePercent + delta
  const heightPercent = base.lockAspect
    ? sizePercent
    : base.heightPercent
  return normalizeCameraOverlay(
    {
      ...base,
      sizePercent,
      heightPercent,
    },
    aspect,
  )
}

export function isCameraSizePresetId(value: unknown): value is CameraSizePresetId {
  return (
    typeof value === 'string' &&
    CAMERA_SIZE_PRESETS.some((p) => p.id === value)
  )
}

/** Apply S/M/L width preset; lockAspect keeps height square. */
export function applyCameraSizePreset(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  presetId: CameraSizePresetId,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const preset = CAMERA_SIZE_PRESETS.find((p) => p.id === presetId)
  const sizePercent = preset?.sizePercent ?? DEFAULT_CAMERA_OVERLAY.sizePercent
  const base = normalizeCameraOverlay(style, frameAspect)
  return normalizeCameraOverlay(
    {
      ...base,
      sizePercent,
      heightPercent: base.lockAspect ? sizePercent : base.heightPercent,
    },
    frameAspect,
  )
}

/** Match current width to an S/M/L preset (exact sizePercent). */
export function matchCameraSizePreset(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
): CameraSizePresetId | null {
  const size = normalizeCameraOverlay(style).sizePercent
  const hit = CAMERA_SIZE_PRESETS.find((p) => p.sizePercent === size)
  return hit?.id ?? null
}

export function cameraSizePresetLabel(id: CameraSizePresetId): string {
  return CAMERA_SIZE_PRESETS.find((p) => p.id === id)?.label ?? id
}

/**
 * Reset layout to the Loom/Screen Studio default: bottom-right + medium size,
 * aspect locked. Keeps device, enabled, shape, chrome, mirror, opacity, mic.
 */
export function resetCameraLayout(
  style: Partial<CameraOverlayStyle> | CameraOverlayStyle,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const base = normalizeCameraOverlay(style, frameAspect)
  const sized = applyCameraSizePreset(base, 'medium', frameAspect)
  return applyCameraCornerPreset(
    {
      ...sized,
      lockAspect: true,
      heightPercent: sized.sizePercent,
    },
    DEFAULT_CAMERA_OVERLAY.corner,
    frameAspect,
  )
}

/** Map digit keys 1/2/3 → S/M/L size presets (bubble keyboard shortcuts). */
export function cameraSizePresetFromDigitKey(
  key: string,
): CameraSizePresetId | null {
  if (key === '1') return 'small'
  if (key === '2') return 'medium'
  if (key === '3') return 'large'
  return null
}

/** Clamp overlay style to safe UI/export ranges; fill x/y from corner when needed. */
export function normalizeCameraOverlay(
  partial: Partial<CameraOverlayStyle> | null | undefined,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): CameraOverlayStyle {
  const corner = isCameraCorner(partial?.corner)
    ? partial!.corner
    : DEFAULT_CAMERA_OVERLAY.corner
  const shape: CameraShape = isCameraShape(partial?.shape)
    ? partial!.shape
    : DEFAULT_CAMERA_OVERLAY.shape
  const sizeRaw = partial?.sizePercent ?? DEFAULT_CAMERA_OVERLAY.sizePercent
  const sizePercent = Math.round(
    clamp(sizeRaw, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT),
  )
  const allowsFree = cameraShapeAllowsFreeAspect(shape)
  const lockAspect =
    !allowsFree ||
    (typeof partial?.lockAspect === 'boolean'
      ? partial.lockAspect
      : DEFAULT_CAMERA_OVERLAY.lockAspect)
  const heightRaw =
    lockAspect
      ? sizePercent
      : typeof partial?.heightPercent === 'number' && Number.isFinite(partial.heightPercent)
        ? partial.heightPercent
        : sizePercent
  const heightPercent = Math.round(
    clamp(heightRaw, CAMERA_MIN_SIZE_PERCENT, CAMERA_MAX_SIZE_PERCENT),
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
    const clamped = clampCameraLayout(
      partial!.x!,
      partial!.y!,
      sizePercent,
      frameAspect,
      heightPercent,
    )
    x = clamped.x
    y = clamped.y
  } else if (isCameraCorner(resolvedAnchor)) {
    const layout = layoutFromCorner(
      resolvedAnchor,
      sizePercent,
      frameAspect,
      heightPercent,
    )
    x = layout.x
    y = layout.y
    resolvedCorner = resolvedAnchor
  } else if (hasFreeXY) {
    const clamped = clampCameraLayout(
      partial!.x!,
      partial!.y!,
      sizePercent,
      frameAspect,
      heightPercent,
    )
    x = clamped.x
    y = clamped.y
    resolvedAnchor = 'free'
  } else {
    const layout = layoutFromCorner(
      resolvedCorner,
      sizePercent,
      frameAspect,
      heightPercent,
    )
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
    heightPercent: lockAspect ? sizePercent : heightPercent,
    lockAspect,
    shape,
    shadowEnabled:
      typeof partial?.shadowEnabled === 'boolean'
        ? partial.shadowEnabled
        : DEFAULT_CAMERA_OVERLAY.shadowEnabled,
    borderEnabled:
      typeof partial?.borderEnabled === 'boolean'
        ? partial.borderEnabled
        : DEFAULT_CAMERA_OVERLAY.borderEnabled,
    borderWidthPx: Math.round(
      clamp(
        typeof partial?.borderWidthPx === 'number' && Number.isFinite(partial.borderWidthPx)
          ? partial.borderWidthPx
          : DEFAULT_CAMERA_OVERLAY.borderWidthPx,
        CAMERA_MIN_BORDER_PX,
        CAMERA_MAX_BORDER_PX,
      ),
    ),
    borderColor: normalizeCameraBorderColor(
      partial?.borderColor ?? DEFAULT_CAMERA_OVERLAY.borderColor,
    ),
    mirrored:
      typeof partial?.mirrored === 'boolean'
        ? partial.mirrored
        : DEFAULT_CAMERA_OVERLAY.mirrored,
    opacity: clamp(
      typeof partial?.opacity === 'number' && Number.isFinite(partial.opacity)
        ? partial.opacity
        : DEFAULT_CAMERA_OVERLAY.opacity,
      CAMERA_MIN_OPACITY,
      CAMERA_MAX_OPACITY,
    ),
    micEnabled:
      typeof partial?.micEnabled === 'boolean'
        ? partial.micEnabled
        : DEFAULT_CAMERA_OVERLAY.micEnabled,
  }
}

/** CSS inset + size + chrome for the bubble relative to a positioned parent frame. */
export function cameraBubblePosition(
  style: CameraOverlayStyle,
  frameAspect: number = CAMERA_DEFAULT_ASPECT,
): {
  top: string
  left: string
  width: string
  height: string | undefined
  aspectRatio: string | undefined
  borderRadius: string
  border: string
  boxShadow: string
  opacity: number
} {
  const aspect = frameAspect > 0 ? frameAspect : CAMERA_DEFAULT_ASPECT
  const normalized = normalizeCameraOverlay(style, aspect)
  const chrome = cameraBubbleChromeStyle(normalized)
  const locked =
    normalized.lockAspect || normalized.heightPercent === normalized.sizePercent
  if (locked) {
    return {
      top: `${normalized.y * 100}%`,
      left: `${normalized.x * 100}%`,
      width: `${normalized.sizePercent}%`,
      height: undefined,
      aspectRatio: '1',
      borderRadius: cameraShapeBorderRadius(normalized.shape),
      border: chrome.border,
      boxShadow: chrome.boxShadow,
      opacity: normalized.opacity,
    }
  }
  // heightPercent is % of frame width → CSS height % of parent height = pct * aspect
  const { h } = cameraBubbleSizeNorm(
    normalized.sizePercent,
    aspect,
    normalized.heightPercent,
  )
  return {
    top: `${normalized.y * 100}%`,
    left: `${normalized.x * 100}%`,
    width: `${normalized.sizePercent}%`,
    height: `${h * 100}%`,
    aspectRatio: undefined,
    borderRadius: cameraShapeBorderRadius(normalized.shape),
    border: chrome.border,
    boxShadow: chrome.boxShadow,
    opacity: normalized.opacity,
  }
}

/**
 * Normalized rect (0–1) for ffmpeg overlay: x/y = top-left of bubble, w/h = size.
 * Uses sizePercent + heightPercent (square when lockAspect).
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
  const { w, h } = cameraBubbleSizeNorm(
    normalized.sizePercent,
    aspect,
    normalized.heightPercent,
  )
  return {
    x: normalized.x,
    y: normalized.y,
    w,
    h,
  }
}
