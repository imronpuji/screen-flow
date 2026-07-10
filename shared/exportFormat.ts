/**
 * Export container formats: MP4 (default), WebM (VP9), GIF (palette).
 * Quality presets still come from exportQuality.ts; this module maps them
 * onto format-specific encoder / GIF sizing knobs.
 */

import type { ExportQualityId } from './exportQuality.js'
import { normalizeExportQuality } from './exportQuality.js'

export type ExportFormatId = 'mp4' | 'webm' | 'gif'

export interface ExportFormatPreset {
  id: ExportFormatId
  label: string
  /** File extension without dot. */
  extension: string
  /** Short hint under the format picker. */
  hint: string
  /** Save-dialog filter label. */
  dialogFilterName: string
  /** True when the format can carry camera mic audio. */
  supportsAudio: boolean
}

export const EXPORT_FORMAT_PRESETS: readonly ExportFormatPreset[] = [
  {
    id: 'mp4',
    label: 'MP4',
    extension: 'mp4',
    hint: 'H.264 · plays everywhere · recommended',
    dialogFilterName: 'MP4 video',
    supportsAudio: true,
  },
  {
    id: 'webm',
    label: 'WebM',
    extension: 'webm',
    hint: 'VP9 · smaller files · great for web',
    dialogFilterName: 'WebM video',
    supportsAudio: true,
  },
  {
    id: 'gif',
    label: 'GIF',
    extension: 'gif',
    hint: 'Animated GIF · no audio · capped size/fps',
    dialogFilterName: 'GIF animation',
    supportsAudio: false,
  },
] as const

export const DEFAULT_EXPORT_FORMAT: ExportFormatId = 'mp4'

export function getExportFormatPreset(
  id: string | undefined | null,
): ExportFormatPreset {
  const found = EXPORT_FORMAT_PRESETS.find((p) => p.id === id)
  return found ?? EXPORT_FORMAT_PRESETS.find((p) => p.id === DEFAULT_EXPORT_FORMAT)!
}

export function normalizeExportFormat(
  id: string | undefined | null,
): ExportFormatId {
  return getExportFormatPreset(id).id
}

export function exportFormatExtension(id: string | undefined | null): string {
  return getExportFormatPreset(id).extension
}

export function defaultExportFileName(
  formatId: string | undefined | null,
  now: Date = new Date(),
): string {
  const ext = exportFormatExtension(formatId)
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `ScreenFlow-${y}${m}${d}-${hh}${mm}${ss}.${ext}`
}

/** GIF sizing / fps derived from the shared quality preset. */
export interface GifEncodeOptions {
  fps: number
  /** Max output width in px (height scales to preserve aspect). */
  maxWidth: number
}

export function gifOptionsForQuality(
  qualityId: ExportQualityId | string | undefined | null,
): GifEncodeOptions {
  const quality = normalizeExportQuality(qualityId)
  switch (quality) {
    case 'draft':
      return { fps: 8, maxWidth: 480 }
    case 'high':
      return { fps: 15, maxWidth: 1080 }
    case 'good':
    default:
      return { fps: 12, maxWidth: 720 }
  }
}

/**
 * Append palettegen/paletteuse after an existing labeled video stream.
 * Returns filter fragment (no leading `;`) and the new output label.
 */
export function appendGifPaletteFilters(
  inputLabel: string,
  options: GifEncodeOptions,
  outputLabel = 'vgif',
): { filter: string; outputLabel: string } {
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)))
  const maxWidth = Math.max(64, Math.min(1920, Math.round(options.maxWidth)))
  // scale=w:h with -1 keeps aspect; min(iw,maxWidth) caps long edge width.
  const filter =
    `[${inputLabel}]fps=${fps},scale='min(iw\\,${maxWidth})':-1:flags=lanczos,split[gs0][gs1];` +
    `[gs0]palettegen=max_colors=256:stats_mode=diff[gpal];` +
    `[gs1][gpal]paletteuse=dither=bayer:bayer_scale=5[${outputLabel}]`
  return { filter, outputLabel }
}

/** Build a standalone GIF filter_complex from the primary video input. */
export function buildGifFilterFromInput(
  inputIndex: number,
  options: GifEncodeOptions,
  outputLabel = 'vgif',
): { filterComplex: string; outputLabel: string } {
  const fps = Math.max(1, Math.min(30, Math.round(options.fps)))
  const maxWidth = Math.max(64, Math.min(1920, Math.round(options.maxWidth)))
  const filterComplex =
    `[${inputIndex}:v]fps=${fps},scale='min(iw\\,${maxWidth})':-1:flags=lanczos,split[gs0][gs1];` +
    `[gs0]palettegen=max_colors=256:stats_mode=diff[gpal];` +
    `[gs1][gpal]paletteuse=dither=bayer:bayer_scale=5[${outputLabel}]`
  return { filterComplex, outputLabel }
}

/** VP9 encoder args for WebM (CRF mode). */
export function webmEncoderArgsForQuality(
  qualityId: ExportQualityId | string | undefined | null,
): { codec: string; extraArgs: string[] } {
  const quality = normalizeExportQuality(qualityId)
  const crf = quality === 'draft' ? 40 : quality === 'high' ? 28 : 32
  const cpuUsed = quality === 'draft' ? 5 : quality === 'high' ? 2 : 3
  return {
    codec: 'libvpx-vp9',
    extraArgs: [
      '-b:v',
      '0',
      '-crf',
      String(crf),
      '-cpu-used',
      String(cpuUsed),
      '-row-mt',
      '1',
    ],
  }
}

export function gifEncoderArgs(): { codec: string; extraArgs: string[] } {
  return { codec: 'gif', extraArgs: [] }
}
