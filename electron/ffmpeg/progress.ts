/**
 * Pure ffmpeg stderr progress parsers (no Electron deps — safe for unit/smoke tests).
 */

/** Parse `Duration: HH:MM:SS.xx` from ffmpeg banner. */
export function parseFfmpegDurationSec(stderrChunk: string): number | undefined {
  const match = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderrChunk)
  if (!match) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3])
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return undefined
  return hours * 3600 + minutes * 60 + seconds
}

/**
 * Prefer out_time_ms= from -progress pipe (microseconds),
 * fall back to time=HH:MM:SS.xx from classic stats.
 */
export function parseFfmpegTimeSec(stderrChunk: string): number | undefined {
  const msMatch = /out_time_ms=(\d+)/.exec(stderrChunk)
  if (msMatch) {
    const us = Number(msMatch[1])
    if (Number.isFinite(us)) return us / 1_000_000
  }
  const timeMatch = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderrChunk)
  if (!timeMatch) return undefined
  const hours = Number(timeMatch[1])
  const minutes = Number(timeMatch[2])
  const seconds = Number(timeMatch[3])
  if (![hours, minutes, seconds].every((n) => Number.isFinite(n))) return undefined
  return hours * 3600 + minutes * 60 + seconds
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(100, Math.round(value)))
}
