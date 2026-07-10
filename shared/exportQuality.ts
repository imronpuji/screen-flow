/**
 * Export quality presets for H.264 MP4.
 * VideoToolbox uses bitrate targets; libx264 uses CRF + x264 preset.
 */

export type ExportQualityId = 'draft' | 'good' | 'high'

export interface ExportQualityPreset {
  id: ExportQualityId
  label: string
  /** Short hint shown under the picker. */
  hint: string
  /** VideoToolbox bitrate (e.g. "8M"). */
  videotoolboxBitrate: string
  /** libx264 CRF (lower = higher quality). */
  x264Crf: number
  /** libx264 -preset (speed vs compression). */
  x264Preset: string
}

export const EXPORT_QUALITY_PRESETS: readonly ExportQualityPreset[] = [
  {
    id: 'draft',
    label: 'Draft',
    hint: 'Fastest · smaller file · fine for a quick check',
    videotoolboxBitrate: '4M',
    x264Crf: 28,
    x264Preset: 'ultrafast',
  },
  {
    id: 'good',
    label: 'Good',
    hint: 'Balanced quality & size · recommended',
    videotoolboxBitrate: '8M',
    x264Crf: 20,
    x264Preset: 'veryfast',
  },
  {
    id: 'high',
    label: 'High',
    hint: 'Best detail · larger file · slower encode',
    videotoolboxBitrate: '16M',
    x264Crf: 18,
    x264Preset: 'medium',
  },
] as const

export const DEFAULT_EXPORT_QUALITY: ExportQualityId = 'good'

export function getExportQualityPreset(id: string | undefined | null): ExportQualityPreset {
  const found = EXPORT_QUALITY_PRESETS.find((p) => p.id === id)
  return found ?? EXPORT_QUALITY_PRESETS.find((p) => p.id === DEFAULT_EXPORT_QUALITY)!
}

export function normalizeExportQuality(id: string | undefined | null): ExportQualityId {
  return getExportQualityPreset(id).id
}

/** Encoder args for the given quality on the current platform family. */
export function encoderArgsForQuality(
  qualityId: ExportQualityId | string | undefined | null,
  platform: string,
): { codec: string; extraArgs: string[] } {
  const preset = getExportQualityPreset(qualityId)
  if (platform === 'darwin') {
    return {
      codec: 'h264_videotoolbox',
      extraArgs: ['-b:v', preset.videotoolboxBitrate],
    }
  }
  return {
    codec: 'libx264',
    extraArgs: ['-preset', preset.x264Preset, '-crf', String(preset.x264Crf)],
  }
}

/** Software fallback when VideoToolbox fails — keep the same quality CRF. */
export function libx264FallbackArgs(
  qualityId: ExportQualityId | string | undefined | null,
): string[] {
  const preset = getExportQualityPreset(qualityId)
  return ['-preset', preset.x264Preset, '-crf', String(preset.x264Crf)]
}
