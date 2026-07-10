/**
 * Recording session: temp dir + append-only WebM writer.
 * Frames are captured in the renderer (getUserMedia + MediaRecorder);
 * main owns filesystem so we never hold the full recording in renderer RAM.
 */

import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {
  AppendChunkRequest,
  AppendChunkResult,
  RecordingStatus,
  StartRecordingRequest,
  StartRecordingResult,
  StopRecordingResult,
} from '../../shared/ipc.js'

const idleStatus = (): RecordingStatus => ({
  state: 'idle',
  sourceId: null,
  startedAt: null,
  sessionDir: null,
  outputPath: null,
  bytesWritten: 0,
  chunkCount: 0,
})

let status: RecordingStatus = idleStatus()
let writeStream: fs.WriteStream | null = null
/** Serialize chunk writes so IPC handlers don't interleave on the same stream. */
let writeQueue: Promise<void> = Promise.resolve()

function assertRecording(): void {
  if (status.state !== 'recording' || !status.outputPath || !writeStream) {
    throw new Error('No active recording session')
  }
}

export function getRecordingStatus(): RecordingStatus {
  return { ...status }
}

export function startRecording(request: StartRecordingRequest): StartRecordingResult {
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

  status = {
    state: 'recording',
    sourceId,
    startedAt: Date.now(),
    sessionDir,
    outputPath,
    bytesWritten: 0,
    chunkCount: 0,
  }

  return { ok: true, status: getRecordingStatus() }
}

export async function appendRecordingChunk(
  request: AppendChunkRequest,
): Promise<AppendChunkResult> {
  assertRecording()
  const stream = writeStream
  if (!stream) {
    throw new Error('Write stream missing')
  }

  const data = request?.data
  // Electron IPC may deliver ArrayBuffer, Buffer, or a typed-array view.
  let buffer: Buffer
  if (Buffer.isBuffer(data)) {
    buffer = data
  } else if (data instanceof Uint8Array) {
    buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  } else if (data instanceof ArrayBuffer) {
    buffer = Buffer.from(data)
  } else {
    throw new Error('Invalid chunk payload')
  }

  if (buffer.byteLength === 0) {
    return {
      ok: true,
      bytesWritten: status.bytesWritten,
      chunkCount: status.chunkCount,
    }
  }

  // Queue writes: Electron may deliver IPC chunks faster than disk flush.
  writeQueue = writeQueue.then(
    () =>
      new Promise<void>((resolve, reject) => {
        stream.write(buffer, (err) => {
          if (err) reject(err)
          else resolve()
        })
      }),
  )

  await writeQueue
  status = {
    ...status,
    bytesWritten: status.bytesWritten + buffer.byteLength,
    chunkCount: status.chunkCount + 1,
  }

  return {
    ok: true,
    bytesWritten: status.bytesWritten,
    chunkCount: status.chunkCount,
  }
}

export async function stopRecording(): Promise<StopRecordingResult> {
  if (status.state !== 'recording' || status.startedAt == null) {
    throw new Error('No active recording to stop')
  }

  const durationMs = Math.max(0, Date.now() - status.startedAt)
  const outputPath = status.outputPath
  const bytesWritten = status.bytesWritten
  const chunkCount = status.chunkCount

  // Drain pending chunk writes before closing the stream.
  await writeQueue

  await new Promise<void>((resolve, reject) => {
    if (!writeStream) {
      resolve()
      return
    }
    writeStream.end((err: Error | null | undefined) => {
      if (err) reject(err)
      else resolve()
    })
  })

  writeStream = null
  writeQueue = Promise.resolve()
  status = idleStatus()

  return {
    ok: true,
    status: getRecordingStatus(),
    durationMs,
    outputPath: chunkCount > 0 ? outputPath : null,
    bytesWritten,
    chunkCount,
  }
}

/** @deprecated Use startRecording — kept name alias during transition. */
export const startRecordingStub = startRecording
/** @deprecated Use stopRecording */
export const stopRecordingStub = stopRecording
