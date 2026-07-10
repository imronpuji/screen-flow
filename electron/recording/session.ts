/**
 * Recording session: temp dir + append-only WebM writers (screen + optional camera).
 * Frames are captured in the renderer (getUserMedia + MediaRecorder);
 * main owns filesystem so we never hold the full recording in renderer RAM.
 *
 * Screen and camera share the same `startedAt` wall-clock so later ffmpeg overlay
 * can align streams without relying on frame order.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { resolveCaptureGeometry } from '../capture/geometry.js'
import {
  CAPTURE_GEOMETRY_FILENAME,
  type CaptureGeometry,
} from '../../shared/cursorCoords.js'
import type {
  AppendChunkRequest,
  AppendChunkResult,
  RecordingStatus,
  RecordingTrack,
  StartRecordingRequest,
  StartRecordingResult,
  StopRecordingResult,
} from '../../shared/ipc.js'
import {
  CAMERA_SYNC_FILENAME,
  closeOpenCameraActiveRanges,
  createEmptyCameraSyncMeta,
  normalizeCameraActiveRanges,
  type CameraActiveRange,
  type CameraSyncMeta,
} from '../../shared/cameraSync.js'
import { startCursorSampler, stopCursorSampler } from './cursorSampler.js'

const idleStatus = (): RecordingStatus => ({
  state: 'idle',
  sourceId: null,
  startedAt: null,
  sessionDir: null,
  outputPath: null,
  bytesWritten: 0,
  chunkCount: 0,
  cameraOutputPath: null,
  cameraBytesWritten: 0,
  cameraChunkCount: 0,
  cursorEventsPath: null,
  cursorEventCount: 0,
  captureGeometryPath: null,
  cameraSyncPath: null,
})

let status: RecordingStatus = idleStatus()
let writeStream: fs.WriteStream | null = null
let cameraWriteStream: fs.WriteStream | null = null
/** Serialize chunk writes so IPC handlers don't interleave on the same stream. */
let writeQueue: Promise<void> = Promise.resolve()
let cameraWriteQueue: Promise<void> = Promise.resolve()
/** First-chunk wall offsets for screen↔camera drift compensation. */
let syncMeta: CameraSyncMeta | null = null
/** Mid-recording mute/unmute windows (renderer pushes via IPC). */
let cameraActiveRanges: CameraActiveRange[] = []
/** How many camera segment files have been opened this session (0 = camera.webm). */
let cameraSegmentIndex = 0

function writeCaptureGeometry(sessionDir: string, geometry: CaptureGeometry): string {
  const geometryPath = path.join(sessionDir, CAPTURE_GEOMETRY_FILENAME)
  fs.writeFileSync(geometryPath, JSON.stringify(geometry, null, 2), 'utf8')
  return geometryPath
}

function assertRecording(): void {
  if (status.state !== 'recording' || !status.outputPath || !writeStream) {
    throw new Error('No active recording session')
  }
}

function toBuffer(data: AppendChunkRequest['data']): Buffer {
  if (Buffer.isBuffer(data)) {
    return data
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }
  throw new Error('Invalid chunk payload')
}

async function appendToStream(
  stream: fs.WriteStream,
  queueRef: { current: Promise<void> },
  buffer: Buffer,
): Promise<void> {
  queueRef.current = queueRef.current.then(
    () =>
      new Promise<void>((resolve, reject) => {
        stream.write(buffer, (err) => {
          if (err) reject(err)
          else resolve()
        })
      }),
  )
  await queueRef.current
}

export function getRecordingStatus(): RecordingStatus {
  return { ...status }
}

export async function startRecording(
  request: StartRecordingRequest,
): Promise<StartRecordingResult> {
  const sourceId = request.sourceId?.trim()
  if (!sourceId) {
    throw new Error('sourceId is required to start recording')
  }
  if (status.state === 'recording') {
    throw new Error('Recording already in progress')
  }

  const sessionId = `sf-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const sessionDir = path.join(app.getPath('temp'), 'screen-flow', sessionId)
  fs.mkdirSync(sessionDir, { recursive: true })

  const outputPath = path.join(sessionDir, 'capture.webm')
  writeStream = fs.createWriteStream(outputPath)
  writeQueue = Promise.resolve()

  const includeCamera = Boolean(request.includeCamera)
  let cameraOutputPath: string | null = null
  if (includeCamera) {
    cameraOutputPath = path.join(sessionDir, 'camera.webm')
    cameraWriteStream = fs.createWriteStream(cameraOutputPath)
    cameraWriteQueue = Promise.resolve()
  } else {
    cameraWriteStream = null
    cameraWriteQueue = Promise.resolve()
  }

  // Persist display DIP bounds + scaleFactor so auto-zoom/cursor map Retina correctly.
  const geometry = await resolveCaptureGeometry(sourceId)
  const captureGeometryPath = writeCaptureGeometry(sessionDir, geometry)

  const startedAt = Date.now()
  const cursorSampler = startCursorSampler({ sessionDir, startedAt })
  syncMeta = createEmptyCameraSyncMeta(startedAt)
  cameraActiveRanges = []
  cameraSegmentIndex = includeCamera ? 1 : 0

  status = {
    state: 'recording',
    sourceId,
    startedAt,
    sessionDir,
    outputPath,
    bytesWritten: 0,
    chunkCount: 0,
    cameraOutputPath,
    cameraBytesWritten: 0,
    cameraChunkCount: 0,
    cursorEventsPath: cursorSampler.eventsPath,
    cursorEventCount: 0,
    captureGeometryPath,
    cameraSyncPath: null,
  }

  return { ok: true, status: getRecordingStatus() }
}

/**
 * Lazily open camera.webm (or camera-N.webm) so the user can arm FaceTime
 * mid-recording even if includeCamera was false at start.
 */
export async function ensureCameraTrack(): Promise<RecordingStatus> {
  assertRecording()
  if (cameraWriteStream && status.cameraOutputPath) {
    return getRecordingStatus()
  }
  const sessionDir = status.sessionDir
  if (!sessionDir) {
    throw new Error('Recording session directory missing')
  }
  cameraSegmentIndex += 1
  const fileName =
    cameraSegmentIndex <= 1 ? 'camera.webm' : `camera-${cameraSegmentIndex}.webm`
  const cameraOutputPath = path.join(sessionDir, fileName)
  cameraWriteStream = fs.createWriteStream(cameraOutputPath)
  cameraWriteQueue = Promise.resolve()
  // Mid-arm after a prior finalize: reset first-chunk so lag reflects this segment.
  // (Multi-segment export still uses the primary path; first arm is the common case.)
  if (syncMeta && status.cameraChunkCount === 0) {
    syncMeta = { ...syncMeta, cameraFirstChunkMs: null }
  }
  status = {
    ...status,
    cameraOutputPath,
  }
  return getRecordingStatus()
}

/** Persist mid-recording camera visibility windows (mute/unmute). */
export function setCameraActiveRanges(ranges: CameraActiveRange[]): RecordingStatus {
  assertRecording()
  cameraActiveRanges = normalizeCameraActiveRanges(ranges)
  return getRecordingStatus()
}

export async function appendRecordingChunk(
  request: AppendChunkRequest,
): Promise<AppendChunkResult> {
  assertRecording()
  const track: RecordingTrack = request.track === 'camera' ? 'camera' : 'screen'
  const buffer = toBuffer(request?.data)

  if (buffer.byteLength === 0) {
    return {
      ok: true,
      bytesWritten: track === 'camera' ? status.cameraBytesWritten : status.bytesWritten,
      chunkCount: track === 'camera' ? status.cameraChunkCount : status.chunkCount,
      track,
    }
  }

  if (track === 'camera') {
    if (!cameraWriteStream || !status.cameraOutputPath) {
      await ensureCameraTrack()
    }
    const stream = cameraWriteStream
    if (!stream || !status.cameraOutputPath) {
      throw new Error('Camera track not enabled for this session')
    }
    if (syncMeta && syncMeta.cameraFirstChunkMs == null && status.startedAt != null) {
      syncMeta = {
        ...syncMeta,
        cameraFirstChunkMs: Math.max(0, Date.now() - status.startedAt),
      }
    }
    const queueRef = { current: cameraWriteQueue }
    await appendToStream(stream, queueRef, buffer)
    cameraWriteQueue = queueRef.current
    status = {
      ...status,
      cameraBytesWritten: status.cameraBytesWritten + buffer.byteLength,
      cameraChunkCount: status.cameraChunkCount + 1,
    }
    return {
      ok: true,
      bytesWritten: status.cameraBytesWritten,
      chunkCount: status.cameraChunkCount,
      track,
    }
  }

  const stream = writeStream
  if (!stream) {
    throw new Error('Write stream missing')
  }
  if (syncMeta && syncMeta.screenFirstChunkMs == null && status.startedAt != null) {
    syncMeta = {
      ...syncMeta,
      screenFirstChunkMs: Math.max(0, Date.now() - status.startedAt),
    }
  }
  const queueRef = { current: writeQueue }
  await appendToStream(stream, queueRef, buffer)
  writeQueue = queueRef.current
  status = {
    ...status,
    bytesWritten: status.bytesWritten + buffer.byteLength,
    chunkCount: status.chunkCount + 1,
  }

  return {
    ok: true,
    bytesWritten: status.bytesWritten,
    chunkCount: status.chunkCount,
    track,
  }
}

async function closeStream(stream: fs.WriteStream | null): Promise<void> {
  if (!stream) return
  await new Promise<void>((resolve, reject) => {
    stream.end((err: Error | null | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function stopRecording(): Promise<StopRecordingResult> {
  if (status.state !== 'recording' || status.startedAt == null) {
    throw new Error('No active recording to stop')
  }

  const durationMs = Math.max(0, Date.now() - status.startedAt)
  const outputPath = status.outputPath
  const bytesWritten = status.bytesWritten
  const chunkCount = status.chunkCount
  const cameraOutputPath = status.cameraOutputPath
  const cameraBytesWritten = status.cameraBytesWritten
  const cameraChunkCount = status.cameraChunkCount
  const captureGeometryPath = status.captureGeometryPath
  const sessionDir = status.sessionDir

  const cursorStats = await stopCursorSampler()

  // Drain pending chunk writes before closing streams.
  await writeQueue
  await cameraWriteQueue

  await closeStream(writeStream)
  await closeStream(cameraWriteStream)

  let cameraSyncPath: string | null = null
  let finalMeta: CameraSyncMeta | null = null
  if (syncMeta && sessionDir && cameraChunkCount > 0) {
    const closedRanges = closeOpenCameraActiveRanges(cameraActiveRanges, durationMs)
    finalMeta = {
      ...syncMeta,
      wallDurationMs: durationMs,
      activeRanges: closedRanges,
    }
    cameraSyncPath = path.join(sessionDir, CAMERA_SYNC_FILENAME)
    fs.writeFileSync(cameraSyncPath, JSON.stringify(finalMeta, null, 2), 'utf8')
  }

  writeStream = null
  cameraWriteStream = null
  writeQueue = Promise.resolve()
  cameraWriteQueue = Promise.resolve()
  syncMeta = null
  cameraActiveRanges = []
  cameraSegmentIndex = 0
  status = idleStatus()

  return {
    ok: true,
    status: getRecordingStatus(),
    durationMs,
    outputPath: chunkCount > 0 ? outputPath : null,
    bytesWritten,
    chunkCount,
    cameraOutputPath: cameraChunkCount > 0 ? cameraOutputPath : null,
    cameraBytesWritten,
    cameraChunkCount,
    cursorEventsPath: cursorStats.eventsPath,
    cursorEventCount: cursorStats.eventCount,
    captureGeometryPath,
    cameraSyncPath: cameraChunkCount > 0 ? cameraSyncPath : null,
    cameraSync: cameraChunkCount > 0 ? finalMeta : null,
  }
}

/** @deprecated Use startRecording — kept name alias during transition. */
export const startRecordingStub = startRecording
/** @deprecated Use stopRecording */
export const stopRecordingStub = stopRecording
