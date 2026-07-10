/**
 * One-click beautify — apply a polished look to review edit state.
 * Pure helpers so CI can smoke-test without Electron.
 */

import type { BackgroundStyle } from './background.js'
import { normalizeBackgroundStyle } from './background.js'
import type { CameraOverlayStyle } from './camera.js'
import { applyCameraCornerPreset } from './camera.js'
import type { CursorAppearance } from './cursorAppearance.js'
import { normalizeCursorAppearance } from './cursorAppearance.js'
import type { ReviewEditState } from './edit.js'
import type { ExportQualityId } from './exportQuality.js'
import { normalizeExportQuality } from './exportQuality.js'

export type BeautifyPresetId = 'tutorial' | 'demo' | 'social'

export interface BeautifyPreset {
  id: BeautifyPresetId
  label: string
  /** One-line description for the review panel. */
  hint: string
  autoZoomEnabled: boolean
  cursorSmoothingEnabled: boolean
  cursorAppearance: CursorAppearance
  background: BackgroundStyle
  /** Camera layout knobs (enabled left to caller — only if a track exists). */
  camera: Pick<
    CameraOverlayStyle,
    | 'corner'
    | 'sizePercent'
    | 'shape'
    | 'shadowEnabled'
    | 'borderEnabled'
    | 'borderWidthPx'
    | 'borderColor'
  >
  exportQuality: ExportQualityId
}

export const BEAUTIFY_PRESETS: readonly BeautifyPreset[] = [
  {
    id: 'tutorial',
    label: 'Tutorial',
    hint: 'Auto-zoom + spotlight cursor · Aurora frame · Good quality',
    autoZoomEnabled: true,
    cursorSmoothingEnabled: true,
    cursorAppearance: {
      style: 'dot',
      sizeScale: 1.35,
      spotlightEnabled: true,
    },
    background: {
      enabled: true,
      presetId: 'aurora',
      paddingPercent: 12,
      cornerRadiusPx: 16,
      shadowEnabled: true,
    },
    camera: {
      corner: 'bottom-right',
      sizePercent: 22,
      shape: 'circle',
      shadowEnabled: true,
      borderEnabled: true,
      borderWidthPx: 2,
      borderColor: '#E8EEF4',
    },
    exportQuality: 'good',
  },
  {
    id: 'demo',
    label: 'Product demo',
    hint: 'Crisp cursor · Midnight frame · High quality export',
    autoZoomEnabled: true,
    cursorSmoothingEnabled: true,
    cursorAppearance: {
      style: 'dot',
      sizeScale: 1.15,
      spotlightEnabled: false,
    },
    background: {
      enabled: true,
      presetId: 'midnight',
      paddingPercent: 10,
      cornerRadiusPx: 14,
      shadowEnabled: true,
    },
    camera: {
      corner: 'bottom-left',
      sizePercent: 20,
      shape: 'rectangle',
      shadowEnabled: true,
      borderEnabled: true,
      borderWidthPx: 3,
      borderColor: '#3DD6C6',
    },
    exportQuality: 'high',
  },
  {
    id: 'social',
    label: 'Social',
    hint: 'Bold cursor · Sunset frame · Draft-fast for quick shares',
    autoZoomEnabled: true,
    cursorSmoothingEnabled: true,
    cursorAppearance: {
      style: 'crosshair',
      sizeScale: 1.6,
      spotlightEnabled: true,
    },
    background: {
      enabled: true,
      presetId: 'sunset',
      paddingPercent: 14,
      cornerRadiusPx: 20,
      shadowEnabled: true,
    },
    camera: {
      corner: 'bottom-right',
      sizePercent: 28,
      shape: 'circle',
      shadowEnabled: true,
      borderEnabled: true,
      borderWidthPx: 3,
      borderColor: '#F0A05A',
    },
    exportQuality: 'draft',
  },
] as const

export function getBeautifyPreset(id: string): BeautifyPreset {
  return BEAUTIFY_PRESETS.find((p) => p.id === id) ?? BEAUTIFY_PRESETS[0]!
}

/**
 * Apply a beautify preset onto existing review state.
 * Preserves trim window; camera.enabled only stays on when a camera track exists.
 */
export function applyBeautifyPreset(
  edit: ReviewEditState,
  presetId: BeautifyPresetId | string,
  options?: { hasCameraTrack?: boolean },
): ReviewEditState {
  const preset = getBeautifyPreset(presetId)
  const hasCamera = Boolean(options?.hasCameraTrack)

  return {
    ...edit,
    autoZoomEnabled: preset.autoZoomEnabled,
    // Keep manual zoom-point edits; beautify only toggles the master switch.
    zoomPointOverrides: edit.zoomPointOverrides,
    cursorSmoothingEnabled: preset.cursorSmoothingEnabled,
    cursorAppearance: normalizeCursorAppearance(preset.cursorAppearance),
    background: normalizeBackgroundStyle(preset.background),
    cameraOverlay: applyCameraCornerPreset(
      {
        ...edit.cameraOverlay,
        // Beautify turns the bubble on whenever a camera track exists.
        enabled: hasCamera,
        sizePercent: preset.camera.sizePercent,
        shape: preset.camera.shape,
        shadowEnabled: preset.camera.shadowEnabled,
        borderEnabled: preset.camera.borderEnabled,
        borderWidthPx: preset.camera.borderWidthPx,
        borderColor: preset.camera.borderColor,
      },
      preset.camera.corner,
    ),
    exportQuality: normalizeExportQuality(preset.exportQuality),
  }
}
