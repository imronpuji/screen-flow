/**
 * Spawn system ffmpeg as a child process to transcode capture WebM → H.264 MP4.
 * Heavy work stays off the renderer; main owns the process lifecycle.
 *
 * Codec strategy:
 * - darwin → prefer VideoToolbox (h264_videotoolbox), fall back to libx264
 * - elsewhere → libx264 (CI/Linux agents)
 *
 * Progress: parse Duration + out_time_ms from ffmpeg stderr (best-effort %).
 * Cancel: SIGTERM the active child; export rejects with ExportCancelledError.
 */

import { app } from 'electron'
import { type ChildProcess, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { planExportFilters, EXPORT_SENDCMD_PLACEHOLDERS } from '../../shared/ffmpegExport.js'
import {
  applyTrimToCursorEvents,
  msToFfmpegSec,
  normalizeTrim,
  trimDurationMs,
  type TrimRange,
} from '../../shared/edit.js'
import type { ExportMp4Request, ExportMp4Result, ExportProgressEvent } from '../../shared/ipc.js'
import { readCursorEventsFile } from '../recording/readCursorEvents.js'
import { probeVideoFile } from './probe.js'
import {
  clampPercent,
  parseFfmpegDurationSec,
  parseFfmpegTimeSec,
} from './progress.js'

const FFMPEG_BIN = process.env.SCREEN_FLOW_FFMPEG ?? 'ffmpeg'

export class ExportCancelledError extends Error {
  constructor(message = 'Export cancelled') {
    super(message)
    this.name = 'ExportCancelledError'
  }
}

export type ExportProgressListener = (event: ExportProgressEvent) => void

let activeChild: ChildProcess | null = null
let cancelRequested = false
const progressListeners = new Set<ExportProgressListener>()

export function onExportProgress(listener: ExportProgressListener): () => void {
  progressListeners.add(listener)
  return () => {
    progressListeners.delete(listener)
  }
}

function emitProgress(event: ExportProgressEvent): void {
  for (const listener of progressListeners) {
    try {
      listener(event)
    } catch {
      /* never let a bad UI listener kill encode */
    }
  }
}

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

function runFfmpeg(
  args: string[],
  onStderr?: (chunk: string) => void,
): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (activeChild) {
      reject(new Error('An export is already in progress'))
      return
    }
    if (cancelRequested) {
      reject(new ExportCancelledError())
      return
    }

    const child = spawn(FFMPEG_BIN, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    activeChild = child

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      const text = chunk.toString('utf8')
      // Cap stderr so a runaway encode cannot blow memory in main.
      if (stderr.length < 64_000) {
        stderr += text
      }
      onStderr?.(text)
    })

    child.on('error', (err) => {
      if (activeChild === child) activeChild = null
      reject(
        new Error(
          `Failed to spawn ffmpeg (${FFMPEG_BIN}): ${err.message}. Install ffmpeg or set SCREEN_FLOW_FFMPEG.`,
        ),
      )
    })

    child.on('close', (code, signal) => {
      if (activeChild === child) activeChild = null
      if (cancelRequested || signal === 'SIGTERM' || signal === 'SIGKILL') {
        reject(new ExportCancelledError())
        return
      }
      resolve({ code: code ?? 1, stderr })
    })
  })
}

function escapeFfmpegFilterPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
}

async function transcodeOnce(
  inputPath: string,
  outputPath: string,
  encoder: { codec: string; extraArgs: string[] },
  options: {
    videoFilter?: string
    filterComplex?: string
    outputLabel?: string
    trim?: TrimRange
    /** Expected output duration for progress % when trimming. */
    expectedDurationSec?: number
    /** Extra inputs after the screen capture (e.g. camera.webm as input 1). */
    extraInputs?: string[]
  } = {},
): Promise<{ code: number; stderr: string }> {
  const args = ['-y']
  const seekSec =
    options.trim && options.trim.startMs > 0 ? msToFfmpegSec(options.trim.startMs) : null

  if (seekSec) {
    args.push('-ss', seekSec)
  }
  args.push('-i', inputPath)

  for (const extra of options.extraInputs ?? []) {
    // Same wall-clock seek as screen so overlay stays aligned after trim.
    if (seekSec) {
      args.push('-ss', seekSec)
    }
    args.push('-i', extra)
  }

  if (options.trim) {
    args.push('-to', msToFfmpegSec(options.trim.endMs))
  }
  args.push('-an')
  if (options.filterComplex) {
    args.push('-filter_complex', options.filterComplex)
    args.push('-map', `[${options.outputLabel ?? 'vout'}]`)
  } else if (options.videoFilter) {
    args.push('-vf', options.videoFilter)
  }
  args.push(
    '-c:v',
    encoder.codec,
    ...encoder.extraArgs,
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    // Machine-readable progress lines on stderr (out_time_ms=…).
    '-progress',
    'pipe:2',
    '-nostats',
    outputPath,
  )

  let durationSec: number | undefined = options.expectedDurationSec

  return runFfmpeg(args, (chunk) => {
    const maybeDuration = parseFfmpegDurationSec(chunk)
    if (maybeDuration != null && maybeDuration > 0 && durationSec == null) {
      durationSec = maybeDuration
    }
    const timeSec = parseFfmpegTimeSec(chunk)
    if (timeSec == null) return

    const percent =
      durationSec && durationSec > 0
        ? clampPercent((timeSec / durationSec) * 100)
        : 0

    emitProgress({
      phase: 'encoding',
      percent,
      timeSec,
      durationSec,
    })
  })
}

/**
 * Request cancellation of the in-flight ffmpeg child (if any).
 * Safe to call when idle — returns cancelled: false and does not latch cancel state.
 */
export function cancelExport(): { ok: true; cancelled: boolean } {
  const child = activeChild
  if (!child) {
    return { ok: true, cancelled: false }
  }
  cancelRequested = true
  try {
    child.kill('SIGTERM')
  } catch {
    /* process may have already exited */
  }
  emitProgress({ phase: 'cancelled', percent: 0, message: 'Export cancelled' })
  return { ok: true, cancelled: true }
}

/**
 * Transcode a finished capture.webm into export.mp4 (same session dir by default).
 * Optionally removes the source WebM after a successful encode.
 */
export async function exportWebmToMp4(request: ExportMp4Request): Promise<ExportMp4Result> {
  cancelRequested = false

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

  emitProgress({ phase: 'starting', percent: 0, message: 'Starting ffmpeg…' })

  const probe = await probeVideoFile(inputPath)
  const fullDurationMs = probe.durationSec * 1000

  let trimRange: TrimRange | undefined
  let trimApplied = false
  let expectedDurationSec: number | undefined

  if (request.trim) {
    trimRange = normalizeTrim(request.trim, fullDurationMs)
    const trimmedMs = trimDurationMs(trimRange)
    if (trimmedMs < 100) {
      throw new Error('Trim range is too short (minimum 100ms)')
    }
    trimApplied =
      trimRange.startMs > 0 || trimRange.endMs < fullDurationMs - 50
    expectedDurationSec = trimmedMs / 1000
    if (trimApplied) {
      emitProgress({
        phase: 'starting',
        percent: 0,
        message: `Trimming ${msToFfmpegSec(trimRange.startMs)}s–${msToFfmpegSec(trimRange.endMs)}s…`,
      })
    }
  }

  let zoomSendCmdPath: string | null = null
  let cursorSendCmdPath: string | null = null
  let autoZoomApplied = false
  let backgroundApplied = false
  let cursorApplied = false
  let cameraApplied = false
  let videoFilter: string | undefined
  let filterComplex: string | undefined
  let outputLabel: string | undefined
  let extraInputs: string[] = []

  const sessionDir = path.dirname(outputPath)
  const cursorEventsPath =
    request.autoZoom?.cursorEventsPath ?? request.cursorSmoothing?.cursorEventsPath
  let cursorEvents =
    cursorEventsPath != null
      ? readCursorEventsFile(assertUnderScreenFlowTemp(cursorEventsPath))
      : []

  if (trimRange && cursorEvents.length > 0) {
    cursorEvents = applyTrimToCursorEvents(cursorEvents, trimRange)
  }

  const exportDurationMs = trimRange ? trimDurationMs(trimRange) : fullDurationMs
  const effects: Parameters<typeof planExportFilters>[2] = {}

  if (request.autoZoom?.cursorEventsPath && cursorEvents.length > 0) {
    effects.autoZoom = {
      events: cursorEvents,
      options: request.autoZoom.options,
    }
  }
  if (request.background?.style) {
    effects.background = request.background.style
  }
  if (request.cursorSmoothing?.cursorEventsPath && cursorEvents.length > 0) {
    effects.cursorSmoothing = {
      events: cursorEvents,
      options: request.cursorSmoothing.options,
      appearance: request.cursorSmoothing.appearance,
    }
  }

  let cameraPath: string | null = null
  if (request.camera?.cameraPath && request.camera.style?.enabled) {
    cameraPath = assertUnderScreenFlowTemp(request.camera.cameraPath)
    if (!fs.existsSync(cameraPath) || fs.statSync(cameraPath).size === 0) {
      throw new Error('Camera WebM is missing or empty')
    }
    effects.camera = {
      style: request.camera.style,
      inputIndex: 1,
    }
    extraInputs = [cameraPath]
  }

  const hasEffects =
    effects.autoZoom != null ||
    effects.background != null ||
    effects.cursorSmoothing != null ||
    effects.camera != null

  if (hasEffects) {
    const plan = planExportFilters(
      { width: probe.width, height: probe.height },
      exportDurationMs,
      effects,
    )
    autoZoomApplied = plan.autoZoomApplied
    backgroundApplied = plan.backgroundApplied
    cursorApplied = plan.cursorApplied
    cameraApplied = plan.cameraApplied

    if (plan.zoomSendCmd) {
      zoomSendCmdPath = path.join(sessionDir, 'zoom-sendcmd.txt')
      fs.writeFileSync(zoomSendCmdPath, plan.zoomSendCmd, 'utf8')
    }
    if (plan.cursorSendCmd) {
      cursorSendCmdPath = path.join(sessionDir, 'cursor-sendcmd.txt')
      fs.writeFileSync(cursorSendCmdPath, plan.cursorSendCmd, 'utf8')
    }

    if (plan.filterComplex) {
      let graph = plan.filterComplex
      if (zoomSendCmdPath) {
        graph = graph.replace(
          EXPORT_SENDCMD_PLACEHOLDERS.zoom,
          escapeFfmpegFilterPath(zoomSendCmdPath),
        )
      }
      if (cursorSendCmdPath) {
        graph = graph.replace(
          EXPORT_SENDCMD_PLACEHOLDERS.cursor,
          escapeFfmpegFilterPath(cursorSendCmdPath),
        )
      }
      filterComplex = graph
      outputLabel = plan.outputLabel
    } else if (plan.videoFilter) {
      let vf = plan.videoFilter
      if (zoomSendCmdPath) {
        vf = vf.replace(
          EXPORT_SENDCMD_PLACEHOLDERS.zoom,
          escapeFfmpegFilterPath(zoomSendCmdPath),
        )
      }
      videoFilter = vf
    }

    const baked: string[] = []
    if (autoZoomApplied) baked.push('auto-zoom')
    if (backgroundApplied) baked.push('background')
    if (cursorApplied) baked.push('cursor')
    if (cameraApplied) baked.push('camera')
    if (baked.length > 0) {
      emitProgress({
        phase: 'starting',
        percent: 0,
        message: `Applying ${baked.join(' + ')}…`,
      })
    }
  }

  try {
    let encoder = pickVideoEncoder()
    const transcodeOptions = {
      videoFilter,
      filterComplex,
      outputLabel,
      trim: trimRange,
      expectedDurationSec,
      extraInputs: cameraApplied ? extraInputs : [],
    }
    let result = await transcodeOnce(inputPath, outputPath, encoder, transcodeOptions)

    // VideoToolbox may be missing on older macOS / non-Apple Silicon CI images —
    // fall back to software x264 once.
    if (result.code !== 0 && encoder.codec === 'h264_videotoolbox' && !cancelRequested) {
      encoder = {
        codec: 'libx264',
        extraArgs: ['-preset', 'veryfast', '-crf', '20'],
      }
      emitProgress({
        phase: 'encoding',
        percent: 0,
        message: 'Retrying with libx264…',
      })
      result = await transcodeOnce(inputPath, outputPath, encoder, transcodeOptions)
    }

    if (result.code !== 0) {
      const message = `ffmpeg exited with code ${result.code}${
        result.stderr ? `: ${result.stderr.slice(-800)}` : ''
      }`
      emitProgress({ phase: 'error', percent: 0, message })
      throw new Error(message)
    }

    if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      const message = 'ffmpeg produced an empty MP4'
      emitProgress({ phase: 'error', percent: 0, message })
      throw new Error(message)
    }

    const cleanupTemp = request.cleanupTemp !== false
    if (cleanupTemp && inputPath !== outputPath) {
      try {
        fs.unlinkSync(inputPath)
      } catch {
        /* best-effort; export still succeeded */
      }
    }
    if (cleanupTemp && cameraPath && cameraPath !== outputPath) {
      try {
        fs.unlinkSync(cameraPath)
      } catch {
        /* best-effort */
      }
    }

    const bytesWritten = fs.statSync(outputPath).size
    emitProgress({
      phase: 'done',
      percent: 100,
      message: `Wrote ${bytesWritten} bytes`,
    })

    return {
      ok: true,
      outputPath,
      bytesWritten,
      codec: encoder.codec,
      autoZoomApplied,
      backgroundApplied,
      cursorApplied,
      cameraApplied,
      trimApplied,
    }
  } catch (err) {
    if (err instanceof ExportCancelledError) {
      // Partial MP4 is useless — remove best-effort.
      try {
        if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
      } catch {
        /* ignore */
      }
      throw err
    }
    if (!(err instanceof Error && err.message.startsWith('ffmpeg exited'))) {
      emitProgress({
        phase: 'error',
        percent: 0,
        message: err instanceof Error ? err.message : 'Export failed',
      })
    }
    throw err
  } finally {
    if (zoomSendCmdPath) {
      try {
        fs.unlinkSync(zoomSendCmdPath)
      } catch {
        /* best-effort */
      }
    }
    if (cursorSendCmdPath) {
      try {
        fs.unlinkSync(cursorSendCmdPath)
      } catch {
        /* best-effort */
      }
    }
    cancelRequested = false
    activeChild = null
  }
}
