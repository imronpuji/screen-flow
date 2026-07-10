/**
 * ffprobe helpers for export (dimensions + duration).
 */

import { spawn } from 'node:child_process'

const FFPROBE_BIN = process.env.SCREEN_FLOW_FFPROBE ?? 'ffprobe'

export interface VideoProbeResult {
  width: number
  height: number
  durationSec: number
}

/** True when the file has at least one audio stream (e.g. camera.webm with mic). */
export async function probeHasAudioStream(inputPath: string): Promise<boolean> {
  try {
    const json = await runFfprobe([
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=index,codec_type',
      '-of',
      'json',
      inputPath,
    ])
    const parsed = JSON.parse(json) as {
      streams?: Array<{ codec_type?: string }>
    }
    return (parsed.streams ?? []).some((s) => s.codec_type === 'audio')
  } catch {
    return false
  }
}

function runFfprobe(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFPROBE_BIN, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn ffprobe (${FFPROBE_BIN}): ${err.message}. Install ffmpeg or set SCREEN_FLOW_FFPROBE.`,
        ),
      )
    })
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}: ${stderr.slice(-500)}`))
        return
      }
      resolve(stdout)
    })
  })
}

/**
 * Fallback duration probe for streaming/live WebM (MediaRecorder output has no
 * container/stream duration in its header). Scans video packet timestamps and
 * returns the last presentation time. Runs with -c copy semantics (no decode),
 * so it stays fast even on multi-minute captures.
 */
async function probeDurationByPackets(inputPath: string): Promise<number> {
  const csv = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'packet=pts_time,duration_time',
    '-of',
    'csv=p=0',
    inputPath,
  ])

  let lastPts = 0
  let lastFrameDur = 0
  for (const line of csv.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const [ptsRaw, durRaw] = trimmed.split(',')
    const pts = Number(ptsRaw)
    if (Number.isFinite(pts) && pts > lastPts) {
      lastPts = pts
      const dur = Number(durRaw)
      lastFrameDur = Number.isFinite(dur) && dur > 0 ? dur : lastFrameDur
    }
  }

  // Last pts is the start of the final frame; add one frame so duration covers it.
  return lastPts > 0 ? lastPts + lastFrameDur : 0
}

/** Read video stream width/height and container duration from a local file. */
export async function probeVideoFile(inputPath: string): Promise<VideoProbeResult> {
  const json = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    inputPath,
  ])

  const parsed = JSON.parse(json) as {
    streams?: Array<{ width?: number; height?: number; duration?: string }>
    format?: { duration?: string }
  }
  const stream = parsed.streams?.[0]
  const width = stream?.width
  const height = stream?.height

  if (!width || !height || width < 1 || height < 1) {
    throw new Error('ffprobe could not read video dimensions')
  }

  // Prefer container duration, then stream duration; both are absent for
  // MediaRecorder WebM, so fall back to scanning packet timestamps.
  let durationSec = Number(parsed.format?.duration ?? 0)
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    durationSec = Number(stream?.duration ?? 0)
  }
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    durationSec = await probeDurationByPackets(inputPath)
  }

  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('ffprobe could not read video duration')
  }

  return { width, height, durationSec }
}
