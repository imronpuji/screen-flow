/**
 * Aesthetic background frame for preview playback (Screen Studio-style).
 * Pure functions — smoke-tested in CI without Electron.
 */

export interface BackgroundPreset {
  id: string
  label: string
  /** CSS background value (gradient). */
  css: string
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'midnight',
    label: 'Midnight',
    css: 'linear-gradient(145deg, #0f1c2e 0%, #1a2f4a 38%, #243b55 72%, #0d1520 100%)',
  },
  {
    id: 'aurora',
    label: 'Aurora',
    css:
      'radial-gradient(120% 90% at 15% 10%, rgba(61, 214, 198, 0.35) 0%, transparent 55%), ' +
      'radial-gradient(90% 80% at 85% 20%, rgba(99, 130, 255, 0.3) 0%, transparent 50%), ' +
      'linear-gradient(160deg, #0b1620 0%, #122433 45%, #0a1018 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    css:
      'radial-gradient(100% 80% at 80% 0%, rgba(255, 140, 90, 0.35) 0%, transparent 55%), ' +
      'radial-gradient(80% 70% at 10% 100%, rgba(180, 80, 200, 0.25) 0%, transparent 50%), ' +
      'linear-gradient(155deg, #1a1020 0%, #2a1838 50%, #120c18 100%)',
  },
  {
    id: 'slate',
    label: 'Slate',
    css: 'linear-gradient(160deg, #1c2128 0%, #2a313c 50%, #151a20 100%)',
  },
  {
    id: 'minimal',
    label: 'Minimal',
    css: 'linear-gradient(180deg, #12161c 0%, #0c0f14 100%)',
  },
]

export interface BackgroundStyle {
  enabled: boolean
  presetId: string
  /** Padding around the video card (0–24 % of frame). */
  paddingPercent: number
  /** Rounded corner radius on the video card (px). */
  cornerRadiusPx: number
  shadowEnabled: boolean
}

export const DEFAULT_BACKGROUND_STYLE: BackgroundStyle = {
  enabled: true,
  presetId: 'aurora',
  paddingPercent: 10,
  cornerRadiusPx: 14,
  shadowEnabled: true,
}

/**
 * Frame layout presets — padding + corner radius + shadow in one tap.
 * Color gradient stays independent (`presetId`) so users can mix look + framing.
 */
export type BackgroundFrameLayoutId = 'compact' | 'standard' | 'wide' | 'flat'

export interface BackgroundFrameLayoutPreset {
  id: BackgroundFrameLayoutId
  label: string
  /** Short hint for title / aria. */
  hint: string
  paddingPercent: number
  cornerRadiusPx: number
  shadowEnabled: boolean
}

export const BACKGROUND_FRAME_LAYOUTS: readonly BackgroundFrameLayoutPreset[] = [
  {
    id: 'compact',
    label: 'Compact',
    hint: 'Tight padding · soft corners',
    paddingPercent: 6,
    cornerRadiusPx: 10,
    shadowEnabled: true,
  },
  {
    id: 'standard',
    label: 'Standard',
    hint: 'Balanced Screen Studio frame',
    paddingPercent: 10,
    cornerRadiusPx: 14,
    shadowEnabled: true,
  },
  {
    id: 'wide',
    label: 'Wide',
    hint: 'Roomy padding · rounder card',
    paddingPercent: 16,
    cornerRadiusPx: 20,
    shadowEnabled: true,
  },
  {
    id: 'flat',
    label: 'Flat',
    hint: 'No shadow · square corners',
    paddingPercent: 8,
    cornerRadiusPx: 0,
    shadowEnabled: false,
  },
] as const

export function getBackgroundPreset(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? BACKGROUND_PRESETS[0]!
}

export function getBackgroundFrameLayout(
  id: string,
): BackgroundFrameLayoutPreset {
  return (
    BACKGROUND_FRAME_LAYOUTS.find((p) => p.id === id) ?? BACKGROUND_FRAME_LAYOUTS[1]!
  )
}

/** Apply a frame layout preset; keeps enabled + color gradient. */
export function applyBackgroundFrameLayout(
  style: BackgroundStyle,
  layoutId: BackgroundFrameLayoutId | string,
): BackgroundStyle {
  const layout = getBackgroundFrameLayout(layoutId)
  return normalizeBackgroundStyle({
    ...style,
    paddingPercent: layout.paddingPercent,
    cornerRadiusPx: layout.cornerRadiusPx,
    shadowEnabled: layout.shadowEnabled,
  })
}

/** Match current padding/radius/shadow to a layout preset (exact). */
export function matchBackgroundFrameLayout(
  style: BackgroundStyle,
): BackgroundFrameLayoutId | null {
  const normalized = normalizeBackgroundStyle(style)
  const hit = BACKGROUND_FRAME_LAYOUTS.find(
    (p) =>
      p.paddingPercent === normalized.paddingPercent &&
      p.cornerRadiusPx === normalized.cornerRadiusPx &&
      p.shadowEnabled === normalized.shadowEnabled,
  )
  return hit?.id ?? null
}

/** Clamp user-facing background knobs to safe preview ranges. */
export function normalizeBackgroundStyle(style: BackgroundStyle): BackgroundStyle {
  return {
    enabled: style.enabled,
    presetId: getBackgroundPreset(style.presetId).id,
    paddingPercent: Math.max(0, Math.min(24, style.paddingPercent)),
    cornerRadiusPx: Math.max(0, Math.min(32, style.cornerRadiusPx)),
    shadowEnabled: style.shadowEnabled,
  }
}

export interface ResolvedBackgroundFrame {
  backgroundCss: string
  paddingPercent: number
  cornerRadiusPx: number
  boxShadow: string | undefined
}

/** Map style → CSS-ready frame props for the preview overlay. */
export function resolveBackgroundFrame(style: BackgroundStyle): ResolvedBackgroundFrame | null {
  if (!style.enabled) return null
  const normalized = normalizeBackgroundStyle(style)
  const preset = getBackgroundPreset(normalized.presetId)
  return {
    backgroundCss: preset.css,
    paddingPercent: normalized.paddingPercent,
    cornerRadiusPx: normalized.cornerRadiusPx,
    boxShadow: normalized.shadowEnabled
      ? '0 24px 48px rgba(0, 0, 0, 0.45), 0 8px 16px rgba(0, 0, 0, 0.3)'
      : undefined,
  }
}
