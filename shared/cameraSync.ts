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
  }
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
