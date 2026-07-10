/**
 * Spawn system ffmpeg as a child process to transcode capture WebM → H.264 MP4.
 * Heavy work stays off the renderer; main owns the process lifecycle.
 *
 * Codec strategy:
 * - darwin → prefer VideoToolbox (h264_videotoolbox), fall back to libx264
 * - elsewhere → libx264 (CI/Linux agents)
 */

import { app } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import type { ExportMp4Request, ExportMp4Result } from '../../shared/ipc.js'

const FFMPEG_BIN = process.env.SCREEN_FLOW_FFMPEG ?? 'ffmpeg'

function screenFlowTempRoot(): string {
  return path.join(app.getPath('temp'), 'screen-flow')
}

/** Only allow reading/writing under the app temp capture tree (IPC hardening). */
export function assertUnderScreenFlowTemp(filePath: string): string {
  const resolved = path.resolve(filePath)
  const root = path.resolve(screenFlowTempRoot()) + path.sep
  if (!resolved.startsWith(root) && resolved !== path.resolve(screenFlowTempRoot())) {
    throw new Error('Export path must be inside the Screen Flow temp directory')
  }
  return resolved
}

function pickVideoEncoder(): { codec: string; extraArgs: string[] } {
  if (process.platform === 'darwin') {
    return {
      codec: 'h264_videotoolbox',
      // bitrate target; VideoToolbox ignores CRF-style flags
      extraArgs: ['-b:v', '8M'],
    }
  }
  return {
    codec: 'libx264',
    extraArgs: ['-preset', 'veryfast', '-crf', '20'],
  }
}

function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(FFMPEG_BIN, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      // Cap stderr so a runaway encode cannot blow memory in main.
      if (stderr.length < 64_000) {
        stderr += chunk.toString('utf8')
      }
    })

    child.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn ffmpeg (${FFMPEG_BIN}): ${err.message}. Install ffmpeg or set SCREEN_FLOW_FFMPEG.`,
        ),
      )
    })

    child.on('close', (code) => {
      resolve({ code: code ?? 1, stderr })
    })
  })
}

async function transcodeOnce(
  inputPath: string,
  outputPath: string,
  encoder: { codec: string; extraArgs: string[] },
): Promise<{ code: number; stderr: string }> {
  const args = [
    '-y',
    '-i',
    inputPath,
    '-an',
    '-c:v',
    encoder.codec,
    ...encoder.extraArgs,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]
  return runFfmpeg(args)
}

/**
 * Transcode a finished capture.webm into export.mp4 (same session dir by default).
 * Optionally removes the source WebM after a successful encode.
 */
export async function exportWebmToMp4(request: ExportMp4Request): Promise<ExportMp4Result> {
  const inputPath = assertUnderScreenFlowTemp(request.inputPath)
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`)
  }
  const stat = fs.statSync(inputPath)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('Input WebM is empty or not a file')
  }

  const outputPath = assertUnderScreenFlowTemp(
    request.outputPath ?? path.join(path.dirname(inputPath), 'export.mp4'),
  )
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  let encoder = pickVideoEncoder()
  let result = await transcodeOnce(inputPath, outputPath, encoder)

  // VideoToolbox may be missing on older macOS / non-Apple Silicon CI images —
  // fall back to software x264 once.
  if (result.code !== 0 && encoder.codec === 'h264_videotoolbox') {
    encoder = {
      codec: 'libx264',
      extraArgs: ['-preset', 'veryfast', '-crf', '20'],
    }
    result = await transcodeOnce(inputPath, outputPath, encoder)
  }

  if (result.code !== 0) {
    throw new Error(
      `ffmpeg exited with code ${result.code}${result.stderr ? `: ${result.stderr.slice(-800)}` : ''}`,
    )
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ffmpeg produced an empty MP4')
  }

  const cleanupTemp = request.cleanupTemp !== false
  if (cleanupTemp && inputPath !== outputPath) {
    try {
      fs.unlinkSync(inputPath)
    } catch {
      /* best-effort; export still succeeded */
    }
  }

  return {
    ok: true,
    outputPath,
    bytesWritten: fs.statSync(outputPath).size,
    codec: encoder.codec,
  }
}
