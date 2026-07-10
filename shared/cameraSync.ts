/**
 * Screen ↔ camera A/V drift compensation.
 *
 * Both tracks share session `startedAt`. First-chunk wall offsets capture start lag
 * (webcam MediaRecorder often opens later than desktop capture). At export we also
 * probe actual WebM durations and optionally stretch camera PTS so the bubble does
 * not drift further by the end of the clip.
 *
 * Preview review applies the same `offsetMs` when seeking the recorded bubble.
 */

/**
 * Wall-clock window (ms from session `startedAt`) when the camera bubble is live.
 * Used for mid-recording mute/unmute: MediaRecorder may keep writing (black frames
 * while tracks are disabled), but preview/export only show the bubble in these ranges.
 */
export interface CameraActiveRange {
  startMs: number
  /** null = still open (closed to wallDurationMs on stop). */
  endMs: number | null
}

/** Written beside capture.webm / camera.webm as camera-sync.json. */
export interface CameraSyncMeta {
  version: 1
  /** Session wall-clock start (ms since epoch). */
  startedAt: number
  /** ms from startedAt until first screen chunk (null if none). */
  screenFirstChunkMs: number | null
  /** ms from startedAt until first camera chunk (null if none). */
  cameraFirstChunkMs: number | null
  /** Wall duration of the recording session (stop − start). */
  wallDurationMs: number
  /**
   * Periods when FaceTime overlay should be visible (mid-recording toggle).
   * Empty / omitted → treat as always-on for the whole camera track.
   */
  activeRanges?: CameraActiveRange[]
}

export interface CameraDriftCompensation {
  /** Delay camera relative to screen (ms). Positive = camera started late. */
  offsetMs: number
  /**
   * Multiply camera PTS by this after offset so durations line up (1 = no stretch).
   * Applied only when |rate − 1| exceeds the threshold and stays within clamp.
   */
  ptsRate: number
  screenDurationMs: number
  cameraDurationMs: number
}

export const CAMERA_SYNC_FILENAME = 'camera-sync.json'

/** Ignore tiny start lags (MediaRecorder jitter). */
export const CAMERA_SYNC_OFFSET_EPSILON_MS = 40
/** Cap absurd first-chunk deltas (bad clocks / paused tracks). */
export const CAMERA_SYNC_OFFSET_MAX_MS = 5000
/** Only stretch when duration mismatch after offset exceeds this. */
export const CAMERA_SYNC_RATE_EPSILON = 0.005
/** Keep stretch gentle — large rates usually mean a truncated track, not clock skew. */
export const CAMERA_SYNC_RATE_MIN = 0.9
export const CAMERA_SYNC_RATE_MAX = 1.1

export function createEmptyCameraSyncMeta(startedAt: number): CameraSyncMeta {
  return {
    version: 1,
    startedAt,
    screenFirstChunkMs: null,
    cameraFirstChunkMs: null,
    wallDurationMs: 0,
    activeRanges: [],
  }
}

/** Normalize / clamp active-range list from IPC or JSON. */
export function normalizeCameraActiveRanges(raw: unknown): CameraActiveRange[] {
  if (!Array.isArray(raw)) return []
  const out: CameraActiveRange[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const startMs = Number(o.startMs)
    if (!Number.isFinite(startMs) || startMs < 0) continue
    const endRaw = o.endMs
    const endMs =
      endRaw == null ? null : Number.isFinite(Number(endRaw)) ? Math.max(0, Number(endRaw)) : null
    if (endMs != null && endMs < startMs) continue
    out.push({ startMs: Math.max(0, startMs), endMs })
  }
  return out
}

/** Close any open range at `atMs` (session stop or mute). */
export function closeOpenCameraActiveRanges(
  ranges: CameraActiveRange[],
  atMs: number,
): CameraActiveRange[] {
  const t = Math.max(0, atMs)
  return ranges.map((r) => (r.endMs == null ? { ...r, endMs: Math.max(r.startMs, t) } : r))
}

/** Append a new open range (unmute / first arm). Ignores if one is already open. */
export function openCameraActiveRange(
  ranges: CameraActiveRange[],
  startMs: number,
): CameraActiveRange[] {
  if (ranges.some((r) => r.endMs == null)) return ranges
  return [...ranges, { startMs: Math.max(0, startMs), endMs: null }]
}

/**
 * True when playhead (ms from session/screen start ≈ wall offset) is inside an
 * active range. Empty ranges → always active (legacy recordings).
 * Fully-muted sentinel (`CAMERA_ACTIVE_RANGES_NEVER`) → never active.
 */
export function isCameraActiveAtMs(
  ranges: CameraActiveRange[] | null | undefined,
  timeMs: number,
  wallDurationMs = Number.POSITIVE_INFINITY,
): boolean {
  if (!ranges || ranges.length === 0) return true
  if (isCameraActiveRangesNever(ranges)) return false
  const t = Math.max(0, timeMs)
  for (const r of ranges) {
    const end = r.endMs == null ? wallDurationMs : r.endMs
    if (end - r.startMs < 20) continue
    if (t >= r.startMs && t <= end) return true
  }
  return false
}

/**
 * Map screen timeline ms (t=0 ≈ first screen chunk) back to wall ms from
 * session `startedAt`. Inverse of `wallMsToScreenTimelineMs` in timelineMarkers.
 */
export function screenTimelineMsToWallMs(
  screenMs: number,
  screenFirstChunkMs: number | null | undefined,
): number {
  const origin = Math.max(0, screenFirstChunkMs ?? 0)
  return Math.max(0, screenMs + origin)
}

/** Sentinel: non-empty ranges that cover nothing → bubble never shown. */
export const CAMERA_ACTIVE_RANGES_NEVER: CameraActiveRange[] = [{ startMs: 0, endMs: 0 }]

/**
 * Concrete closed intervals for review editing.
 * Empty / omitted (legacy always-on) → one full `[0, wall]` window.
 */
export function materializeCameraActiveRanges(
  ranges: CameraActiveRange[] | null | undefined,
  wallDurationMs: number,
): CameraActiveRange[] {
  const wall = Math.max(0, wallDurationMs)
  const normalized = normalizeCameraActiveRanges(ranges ?? [])
  if (normalized.length === 0) {
    return wall > 0 ? [{ startMs: 0, endMs: wall }] : []
  }
  return closeOpenCameraActiveRanges(normalized, wall > 0 ? wall : Number.MAX_SAFE_INTEGER)
    .map((r) => ({
      startMs: r.startMs,
      endMs: r.endMs == null ? wall : r.endMs,
    }))
    .filter((r) => (r.endMs ?? 0) - r.startMs >= 0)
}

/** Merge overlapping/adjacent closed ranges (sorted). */
export function mergeCameraActiveRanges(ranges: CameraActiveRange[]): CameraActiveRange[] {
  const closed = ranges
    .map((r) => ({
      startMs: Math.max(0, r.startMs),
      endMs: r.endMs == null ? null : Math.max(0, r.endMs),
    }))
    .filter((r) => r.endMs == null || r.endMs >= r.startMs)
    .sort((a, b) => a.startMs - b.startMs || (a.endMs ?? 0) - (b.endMs ?? 0))

  const out: CameraActiveRange[] = []
  for (const r of closed) {
    const prev = out[out.length - 1]
    if (!prev || prev.endMs == null) {
      out.push({ ...r })
      continue
    }
    if (r.startMs <= prev.endMs + 20) {
      const rEnd = r.endMs
      prev.endMs =
        rEnd == null ? null : Math.max(prev.endMs, rEnd)
    } else {
      out.push({ ...r })
    }
  }
  return out
}

/**
 * Toggle FaceTime visibility at a wall-clock time (review mute/unmute at playhead).
 * - Active → mute from `wallMs` (end the containing window; drop the remainder).
 * - Inactive → unmute from `wallMs` until the next window start or wall end.
 * Empty input (always-on) is materialized first. Fully muted → `CAMERA_ACTIVE_RANGES_NEVER`.
 */
export function toggleCameraActiveAtWallMs(
  ranges: CameraActiveRange[] | null | undefined,
  wallMs: number,
  wallDurationMs: number,
): CameraActiveRange[] {
  const wall = Math.max(0, wallDurationMs)
  const t = Math.max(0, Math.min(wallMs, wall))
  const list = materializeCameraActiveRanges(ranges, wall)
  const active = isCameraActiveAtMs(list, t, wall)

  if (active) {
    const next: CameraActiveRange[] = []
    for (const r of list) {
      const end = r.endMs ?? wall
      if (t < r.startMs || t > end) {
        next.push({ startMs: r.startMs, endMs: end })
        continue
      }
      // t inside [start, end] → keep prefix only (mute from t onward in this window).
      if (t - r.startMs >= 20) {
        next.push({ startMs: r.startMs, endMs: t })
      }
    }
    return next.length > 0 ? mergeCameraActiveRanges(next) : [...CAMERA_ACTIVE_RANGES_NEVER]
  }

  const nextStart =
    list
      .map((r) => r.startMs)
      .filter((s) => s > t)
      .sort((a, b) => a - b)[0] ?? wall
  if (nextStart - t < 20) return list
  return mergeCameraActiveRanges([...list, { startMs: t, endMs: nextStart }])
}

/** Remove one window by index; last removal → never-on sentinel (not always-on). */
export function removeCameraActiveRangeAt(
  ranges: CameraActiveRange[],
  index: number,
): CameraActiveRange[] {
  const next = ranges.filter((_, i) => i !== index)
  return next.length > 0 ? next : [...CAMERA_ACTIVE_RANGES_NEVER]
}

/** Minimum active-window length when dragging scrubber edges (ms). */
export const CAMERA_ACTIVE_RANGE_MIN_MS = 20

/**
 * Drag-resize one edge of a FaceTime active window (wall ms).
 * Clamps against neighbors + wall so windows never overlap or invert.
 * Empty / always-on input is materialized first. Collapse → never sentinel.
 */
export function resizeCameraActiveRangeEdge(
  ranges: CameraActiveRange[] | null | undefined,
  index: number,
  edge: 'start' | 'end',
  wallMs: number,
  wallDurationMs: number,
): CameraActiveRange[] {
  const wall = Math.max(0, wallDurationMs)
  const list = materializeCameraActiveRanges(ranges, wall).filter(
    (r) => (r.endMs ?? 0) - r.startMs >= CAMERA_ACTIVE_RANGE_MIN_MS,
  )
  if (index < 0 || index >= list.length) return list

  const t = Math.max(0, Math.min(wallMs, wall))
  const next = list.map((r) => ({
    startMs: r.startMs,
    endMs: r.endMs == null ? wall : r.endMs,
  }))
  const cur = next[index]!
  const prevEnd = index > 0 ? (next[index - 1]!.endMs ?? 0) : 0
  const nextStart = index < next.length - 1 ? next[index + 1]!.startMs : wall

  if (edge === 'start') {
    const maxStart = Math.max(prevEnd, (cur.endMs ?? wall) - CAMERA_ACTIVE_RANGE_MIN_MS)
    cur.startMs = Math.max(prevEnd, Math.min(t, maxStart))
  } else {
    const minEnd = Math.min(nextStart, cur.startMs + CAMERA_ACTIVE_RANGE_MIN_MS)
    cur.endMs = Math.min(nextStart, Math.max(t, minEnd))
  }

  const merged = mergeCameraActiveRanges(next).filter(
    (r) => (r.endMs ?? 0) - r.startMs >= CAMERA_ACTIVE_RANGE_MIN_MS,
  )
  return merged.length > 0 ? merged : [...CAMERA_ACTIVE_RANGES_NEVER]
}

/** True when ranges mean "never show" (edited fully muted), not legacy always-on. */
export function isCameraActiveRangesNever(
  ranges: CameraActiveRange[] | null | undefined,
): boolean {
  const normalized = normalizeCameraActiveRanges(ranges ?? [])
  if (normalized.length === 0) return false
  return normalized.every((r) => {
    const end = r.endMs ?? 0
    return end - r.startMs < 20
  })
}

/**
 * ffmpeg overlay `enable=` expression on the **main** (screen) timeline.
 * Returns null when the bubble should stay visible for the whole encode
 * (no ranges, or a single range covering ~the full wall duration).
 * Returns `'0'` when ranges exist but cover nothing (fully muted in review).
 *
 * `trimStartMs` (screen timeline) rebases enable times after input `-ss` seek
 * so mid-recording / review-edited windows stay aligned with trimmed output.
 */
export function cameraOverlayEnableExpr(
  ranges: CameraActiveRange[] | null | undefined,
  screenFirstChunkMs: number | null | undefined,
  wallDurationMs: number,
  options?: { trimStartMs?: number },
): string | null {
  const normalized = normalizeCameraActiveRanges(ranges ?? [])
  if (normalized.length === 0) return null

  const screenOrigin = Math.max(0, screenFirstChunkMs ?? 0)
  const wall = Math.max(0, wallDurationMs)
  const trimStartSec = Math.max(0, (options?.trimStartMs ?? 0) / 1000)
  const parts: string[] = []

  for (const r of closeOpenCameraActiveRanges(normalized, wall)) {
    const end = r.endMs ?? wall
    // Map wall offsets → screen timeline (t=0 ≈ first screen chunk), then trim.
    const startSec = Math.max(0, (r.startMs - screenOrigin) / 1000 - trimStartSec)
    const endSec = Math.max(startSec, (end - screenOrigin) / 1000 - trimStartSec)
    if (endSec - startSec < 0.02) continue
    parts.push(`between(t,${startSec.toFixed(3)},${endSec.toFixed(3)})`)
  }

  if (parts.length === 0) {
    // Had ranges but none survived → never show (fully muted), not always-on.
    return '0'
  }

  // Single range covering essentially the whole (post-trim) clip → no enable needed.
  if (parts.length === 1 && normalized.length === 1) {
    const r = closeOpenCameraActiveRanges(normalized, wall)[0]!
    const startSec = Math.max(0, (r.startMs - screenOrigin) / 1000 - trimStartSec)
    const endSec = Math.max(startSec, ((r.endMs ?? wall) - screenOrigin) / 1000 - trimStartSec)
    const fullSec = Math.max(0, (wall - screenOrigin) / 1000 - trimStartSec)
    if (startSec <= 0.05 && endSec >= fullSec - 0.05) return null
  }

  return parts.join('+')
}

/** Parse camera-sync.json (tolerant — returns null on garbage). */
export function parseCameraSyncMeta(raw: unknown): CameraSyncMeta | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== 1) return null
  const startedAt = Number(o.startedAt)
  if (!Number.isFinite(startedAt)) return null
  const screenFirst =
    o.screenFirstChunkMs == null ? null : Number(o.screenFirstChunkMs)
  const cameraFirst =
    o.cameraFirstChunkMs == null ? null : Number(o.cameraFirstChunkMs)
  const wallDurationMs = Number(o.wallDurationMs ?? 0)
  return {
    version: 1,
    startedAt,
    screenFirstChunkMs:
      screenFirst != null && Number.isFinite(screenFirst) ? Math.max(0, screenFirst) : null,
    cameraFirstChunkMs:
      cameraFirst != null && Number.isFinite(cameraFirst) ? Math.max(0, cameraFirst) : null,
    wallDurationMs: Number.isFinite(wallDurationMs) ? Math.max(0, wallDurationMs) : 0,
    activeRanges: normalizeCameraActiveRanges(o.activeRanges),
  }
}

/**
 * Start lag: camera first chunk minus screen first chunk.
 * Positive → delay camera (itsoffset / setpts +). Negative → trim/advance camera.
 */
export function cameraStartLagMs(
  meta: Pick<CameraSyncMeta, 'screenFirstChunkMs' | 'cameraFirstChunkMs'> | null | undefined,
): number {
  if (!meta) return 0
  const screen = meta.screenFirstChunkMs
  const camera = meta.cameraFirstChunkMs
  if (screen == null || camera == null) return 0
  const lag = camera - screen
  if (!Number.isFinite(lag)) return 0
  if (Math.abs(lag) < CAMERA_SYNC_OFFSET_EPSILON_MS) return 0
  return Math.max(-CAMERA_SYNC_OFFSET_MAX_MS, Math.min(CAMERA_SYNC_OFFSET_MAX_MS, lag))
}

/**
 * Compute export/preview compensation from probed durations + optional sync meta.
 *
 * offsetMs  — align starts (from first-chunk wall times)
 * ptsRate   — stretch/compress camera so (offset + cameraDur×rate) ≈ screenDur
 */
export function computeCameraDrift(args: {
  screenDurationMs: number
  cameraDurationMs: number
  sync?: Pick<CameraSyncMeta, 'screenFirstChunkMs' | 'cameraFirstChunkMs'> | null
}): CameraDriftCompensation {
  const screenDurationMs = Math.max(0, Number(args.screenDurationMs) || 0)
  const cameraDurationMs = Math.max(0, Number(args.cameraDurationMs) || 0)
  const offsetMs = cameraStartLagMs(args.sync)

  let ptsRate = 1
  if (screenDurationMs > 0 && cameraDurationMs > 0) {
    // After delaying camera by offsetMs, remaining screen timeline to fill:
    const targetCameraMs = screenDurationMs - offsetMs
    if (targetCameraMs > 100) {
      const raw = targetCameraMs / cameraDurationMs
      if (
        Number.isFinite(raw) &&
        Math.abs(raw - 1) >= CAMERA_SYNC_RATE_EPSILON &&
        raw >= CAMERA_SYNC_RATE_MIN &&
        raw <= CAMERA_SYNC_RATE_MAX
      ) {
        ptsRate = raw
      }
    }
  }

  return {
    offsetMs,
    ptsRate,
    screenDurationMs,
    cameraDurationMs,
  }
}

/** True when export/preview should apply a non-identity compensation. */
export function cameraDriftNeedsCompensation(drift: CameraDriftCompensation): boolean {
  return Math.abs(drift.offsetMs) >= CAMERA_SYNC_OFFSET_EPSILON_MS || drift.ptsRate !== 1
}

/**
 * Map screen timeline seconds → camera media currentTime for review playback.
 * Inverse of the export setpts/itsoffset alignment.
 */
export function screenTimeToCameraTimeSec(
  screenTimeSec: number,
  drift: Pick<CameraDriftCompensation, 'offsetMs' | 'ptsRate'> | null | undefined,
): number {
  const t = Math.max(0, screenTimeSec)
  if (!drift) return t
  const offsetSec = drift.offsetMs / 1000
  const rate = drift.ptsRate > 0 ? drift.ptsRate : 1
  // Export: camera_pts' = camera_pts * rate + offsetSec
  // → camera_pts = (screen_t - offsetSec) / rate
  return Math.max(0, (t - offsetSec) / rate)
}

/** ffmpeg setpts expression fragment for camera input (no surrounding commas). */
export function cameraDriftSetptsExpr(
  drift: Pick<CameraDriftCompensation, 'offsetMs' | 'ptsRate'>,
): string | null {
  const offsetSec = drift.offsetMs / 1000
  const rate = drift.ptsRate
  const hasOffset = Math.abs(drift.offsetMs) >= CAMERA_SYNC_OFFSET_EPSILON_MS
  const hasRate = Math.abs(rate - 1) >= CAMERA_SYNC_RATE_EPSILON
  if (!hasOffset && !hasRate) return null

  if (hasRate && hasOffset) {
    // PTS' = PTS * rate + offset
    return `PTS*${rate.toFixed(6)}+${offsetSec.toFixed(3)}/TB`
  }
  if (hasRate) {
    return `PTS*${rate.toFixed(6)}`
  }
  return `PTS+${offsetSec.toFixed(3)}/TB`
}

/**
 * Align camera mic audio with the same start lag as camera video (FOKUS 3A).
 * Returns a filter_complex fragment ending in `[outputLabel]`, or null when
 * no delay/trim is needed (caller can `-map N:a:0` directly).
 * Rate stretch is omitted — atempo ≠ video setpts; voice stays natural.
 */
export function cameraMicAudioFilter(
  cameraInputIndex: number,
  offsetMs: number,
  outputLabel = 'aout',
): string | null {
  const lag = Number.isFinite(offsetMs) ? offsetMs : 0
  if (Math.abs(lag) < CAMERA_SYNC_OFFSET_EPSILON_MS) return null
  const idx = Math.max(0, Math.floor(cameraInputIndex))
  const label = outputLabel.replace(/[^a-zA-Z0-9_]/g, '') || 'aout'
  if (lag > 0) {
    const ms = Math.round(Math.min(CAMERA_SYNC_OFFSET_MAX_MS, lag))
    // adelay is per-channel (ms); stereo gets two values.
    return `[${idx}:a]adelay=${ms}|${ms},asetpts=PTS-STARTPTS[${label}]`
  }
  const trimSec = Math.min(CAMERA_SYNC_OFFSET_MAX_MS, Math.abs(lag)) / 1000
  return `[${idx}:a]atrim=start=${trimSec.toFixed(3)},asetpts=PTS-STARTPTS[${label}]`
}
