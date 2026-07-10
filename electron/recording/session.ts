/**
 * In-memory recording session stub.
 * Real capture/encode lands in later runs — this only tracks session state via IPC.
 */

import type {
  RecordingStatus,
  StartRecordingRequest,
  StartRecordingResult,
  StopRecordingResult,
} from '../../shared/ipc.js'

let status: RecordingStatus = {
  state: 'idle',
  sourceId: null,
  startedAt: null,
}

export function getRecordingStatus(): RecordingStatus {
  return { ...status }
}

export function startRecordingStub(request: StartRecordingRequest): StartRecordingResult {
  const sourceId = request.sourceId?.trim()
  if (!sourceId) {
    throw new Error('sourceId is required to start recording')
  }
  if (status.state === 'recording') {
    throw new Error('Recording already in progress')
  }

  status = {
    state: 'recording',
    sourceId,
    startedAt: Date.now(),
  }

  return { ok: true, status: getRecordingStatus() }
}

export function stopRecordingStub(): StopRecordingResult {
  if (status.state !== 'recording' || status.startedAt == null) {
    throw new Error('No active recording to stop')
  }

  const durationMs = Math.max(0, Date.now() - status.startedAt)
  status = {
    state: 'idle',
    sourceId: null,
    startedAt: null,
  }

  return { ok: true, status: getRecordingStatus(), durationMs }
}
