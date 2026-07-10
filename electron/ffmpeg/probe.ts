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

/** Read video stream width/height and container duration from a local file. */
export async function probeVideoFile(inputPath: string): Promise<VideoProbeResult> {
  const json = await runFfprobe([
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=width,height',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    inputPath,
  ])

  const parsed = JSON.parse(json) as {
    streams?: Array<{ width?: number; height?: number }>
    format?: { duration?: string }
  }
  const stream = parsed.streams?.[0]
  const width = stream?.width
  const height = stream?.height
  const durationSec = Number(parsed.format?.duration ?? 0)

  if (!width || !height || width < 1 || height < 1) {
    throw new Error('ffprobe could not read video dimensions')
  }
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    throw new Error('ffprobe could not read video duration')
  }

  return { width, height, durationSec }
}
