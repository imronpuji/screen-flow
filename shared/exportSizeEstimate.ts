/**
 * Rough export file-size estimate for the review Export panel (FOKUS 4).
 * Uses bitrate targets / empirical rates — not a probe. Shown as a calm
 * "~low–high" range so users can pick format/quality before Save As.
 */

import {
  normalizeExportFormat,
  gifOptionsForQuality,
  type ExportFormatId,
} from './exportFormat.js'
import {
  getExportQualityPreset,
  normalizeExportQuality,
  type ExportQualityId,
} from './exportQuality.js'

/** AAC bitrate used when camera mic is muxed into MP4/WebM. */
export const EXPORT_AUDIO_BITRATE_BPS = 128_000

/** Parse ffmpeg-style bitrate strings ("4M", "8M", "128k"). */
export function parseBitrateBps(raw: string): number {
  const trimmed = raw.trim().toLowerCase()
  const match = /^(\d+(?:\.\d+)?)([kmg]?)$/.exec(trimmed)
  if (!match) return 0
  const value = Number(match[1])
  if (!Number.isFinite(value) || value <= 0) return 0
  const unit = match[2]
  if (unit === 'g') return Math.round(value * 1_000_000_000)
  if (unit === 'm') return Math.round(value * 1_000_000)
  if (unit === 'k') return Math.round(value * 1_000)
  return Math.round(value)
}

/** Approximate average video bitrate for VP9 CRF exports (content-dependent). */
export function webmApproxBitrateBps(quality: ExportQualityId): number {
  switch (quality) {
    case 'draft':
      return 2_000_000
    case 'high':
      return 6_000_000
    case 'good':
    default:
      return 3_500_000
  }
}

/**
 * Empirical GIF bytes/sec from fps × area × bpp (palette + Bayer dither).
 * Assumes 16:9; real size swings with motion — range widens below.
 */
export function gifApproxBytesPerSecond(quality: ExportQualityId): number {
  const { fps, maxWidth } = gifOptionsForQuality(quality)
  const height = Math.round((maxWidth * 9) / 16)
  const bpp = quality === 'draft' ? 0.35 : quality === 'high' ? 0.7 : 0.5
  return Math.max(50_000, Math.round(fps * maxWidth * height * bpp))
}

export interface ExportSizeEstimateInput {
  format: ExportFormatId | string | null | undefined
  quality: ExportQualityId | string | null | undefined
  /** Kept / trimmed export length in ms. */
  durationMs: number
  /** True when mic/camera audio will be muxed (MP4/WebM only). */
  includeAudio?: boolean
}

export interface ExportSizeEstimate {
  format: ExportFormatId
  quality: ExportQualityId
  durationMs: number
  /** Midpoint estimate in bytes. */
  bytes: number
  bytesLow: number
  bytesHigh: number
  /** Human label, e.g. "~8–12 MB". */
  label: string
  /** One-line hint under the estimate. */
  hint: string
}

/** Compact byte label for estimates (KB / MB / GB). */
export function formatEstimateBytes(bytes: number): string {
  const n = Math.max(0, bytes)
  if (n < 1024) return `${Math.round(n)} B`
  if (n < 1024 * 1024) {
    const kb = n / 1024
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`
  }
  if (n < 1024 * 1024 * 1024) {
    const mb = n / (1024 * 1024)
    if (mb < 10) {
      const rounded = Math.round(mb * 10) / 10
      return Number.isInteger(rounded) ? `${rounded} MB` : `${rounded.toFixed(1)} MB`
    }
    return `${Math.round(mb)} MB`
  }
  const gb = n / (1024 * 1024 * 1024)
  if (gb < 10) {
    const rounded = Math.round(gb * 100) / 100
    return Number.isInteger(rounded) ? `${rounded} GB` : `${rounded.toFixed(2)} GB`
  }
  return `${gb.toFixed(1)} GB`
}

function clampDurationMs(durationMs: number): number {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return 0
  return Math.max(0, durationMs)
}

function videoBitrateBps(format: ExportFormatId, quality: ExportQualityId): number {
  if (format === 'webm') return webmApproxBitrateBps(quality)
  if (format === 'gif') return 0
  // MP4 — VideoToolbox bitrate targets are the clearest size signal.
  return parseBitrateBps(getExportQualityPreset(quality).videotoolboxBitrate)
}

function rangeFactor(format: ExportFormatId): { low: number; high: number } {
  // GIF/VP9 vary more with motion than CBR-ish VT targets.
  if (format === 'gif') return { low: 0.55, high: 1.55 }
  if (format === 'webm') return { low: 0.65, high: 1.4 }
  return { low: 0.8, high: 1.2 }
}

/**
 * Estimate export size from format, quality, and kept duration.
 * Returns zeros + "—" label when duration is unknown/empty.
 */
export function estimateExportSize(input: ExportSizeEstimateInput): ExportSizeEstimate {
  const format = normalizeExportFormat(input.format)
  const quality = normalizeExportQuality(input.quality)
  const durationMs = clampDurationMs(input.durationMs)
  const durationSec = durationMs / 1000
  const includeAudio = Boolean(input.includeAudio) && format !== 'gif'

  let bytes = 0
  if (durationSec > 0) {
    if (format === 'gif') {
      bytes = Math.round(gifApproxBytesPerSecond(quality) * durationSec)
    } else {
      const videoBps = videoBitrateBps(format, quality)
      const audioBps = includeAudio ? EXPORT_AUDIO_BITRATE_BPS : 0
      bytes = Math.round(((videoBps + audioBps) * durationSec) / 8)
    }
  }

  const { low, high } = rangeFactor(format)
  const bytesLow = Math.max(0, Math.round(bytes * low))
  const bytesHigh = Math.max(bytesLow, Math.round(bytes * high))

  let label = '—'
  let hint = 'Trim or keep clips to see an estimated file size.'
  if (bytes > 0) {
    const lowLabel = formatEstimateBytes(bytesLow)
    const highLabel = formatEstimateBytes(bytesHigh)
    label = lowLabel === highLabel ? `~${lowLabel}` : `~${lowLabel}–${highLabel}`
    if (format === 'gif') {
      hint = 'GIF size varies a lot with motion · estimate only'
    } else if (includeAudio) {
      hint = 'Includes mic audio · actual size depends on motion'
    } else {
      hint = 'Estimate from quality bitrate · actual size depends on motion'
    }
  }

  return {
    format,
    quality,
    durationMs,
    bytes,
    bytesLow,
    bytesHigh,
    label,
    hint,
  }
}
