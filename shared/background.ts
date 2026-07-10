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

export function getBackgroundPreset(id: string): BackgroundPreset {
  return BACKGROUND_PRESETS.find((p) => p.id === id) ?? BACKGROUND_PRESETS[0]!
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
