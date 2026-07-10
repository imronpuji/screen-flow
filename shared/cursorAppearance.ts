/**
 * Modifiable cursor look for preview + export compositing.
 * Cursor is recorded as data; appearance is applied at render time.
 */

export type CursorStyleId = 'dot' | 'crosshair' | 'hidden'

export interface CursorAppearance {
  /** Visual theme for the composited cursor. */
  style: CursorStyleId
  /** Size multiplier relative to the default dot (0.5–3). */
  sizeScale: number
  /** Soft spotlight around the cursor (preview + export glow). */
  spotlightEnabled: boolean
}

export interface CursorStyleOption {
  id: CursorStyleId
  label: string
}

export const CURSOR_STYLE_OPTIONS: readonly CursorStyleOption[] = [
  { id: 'dot', label: 'Dot' },
  { id: 'crosshair', label: 'Crosshair' },
  { id: 'hidden', label: 'Hidden' },
] as const

export const DEFAULT_CURSOR_APPEARANCE: CursorAppearance = {
  style: 'dot',
  sizeScale: 1,
  spotlightEnabled: false,
}

export const BASE_CURSOR_DOT_PX = 14
export const BASE_CURSOR_RING_PX = 44
export const BASE_CURSOR_SPOTLIGHT_PX = 72

const MIN_SCALE = 0.5
const MAX_SCALE = 3

export function clampCursorSizeScale(scale: number): number {
  if (!Number.isFinite(scale)) return 1
  return Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale))
}

export function normalizeCursorAppearance(
  appearance: Partial<CursorAppearance> | null | undefined,
): CursorAppearance {
  const style = appearance?.style
  return {
    style: style === 'crosshair' || style === 'hidden' || style === 'dot' ? style : 'dot',
    sizeScale: clampCursorSizeScale(appearance?.sizeScale ?? 1),
    spotlightEnabled: Boolean(appearance?.spotlightEnabled),
  }
}

/** False when the user hides the cursor entirely. */
export function isCursorVisible(appearance: CursorAppearance): boolean {
  return appearance.style !== 'hidden'
}

export function resolveCursorDotSizePx(appearance: CursorAppearance): number {
  const scale = clampCursorSizeScale(appearance.sizeScale)
  return Math.max(4, Math.round(BASE_CURSOR_DOT_PX * scale))
}

export function resolveCursorRingBasePx(appearance: CursorAppearance): number {
  const scale = clampCursorSizeScale(appearance.sizeScale)
  return Math.max(12, Math.round(BASE_CURSOR_RING_PX * scale))
}

export function resolveCursorSpotlightPx(appearance: CursorAppearance): number {
  const scale = clampCursorSizeScale(appearance.sizeScale)
  return Math.max(24, Math.round(BASE_CURSOR_SPOTLIGHT_PX * scale))
}

/** Export drawbox options derived from appearance (shared by preview sizing). */
export function appearanceToCursorDrawOptions(appearance: CursorAppearance): {
  visible: boolean
  style: CursorStyleId
  dotSizePx: number
  ringBasePx: number
  spotlightPx: number
  spotlightEnabled: boolean
} {
  const normalized = normalizeCursorAppearance(appearance)
  return {
    visible: isCursorVisible(normalized),
    style: normalized.style,
    dotSizePx: resolveCursorDotSizePx(normalized),
    ringBasePx: resolveCursorRingBasePx(normalized),
    spotlightPx: resolveCursorSpotlightPx(normalized),
    spotlightEnabled: normalized.spotlightEnabled,
  }
}
