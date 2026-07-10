/**
 * Renderer-side screen capture via Chromium getUserMedia + desktopCapturer source id.
 * MediaRecorder chunks are streamed to main (temp WebM) — no full blob held in RAM.
 */

export type CaptureMimeType = 'video/webm;codecs=vp9' | 'video/webm;codecs=vp8' | 'video/webm'

export interface LiveCaptureHandle {
  stream: MediaStream
  mimeType: CaptureMimeType
  stop: () => Promise<void>
}

function pickMimeType(): CaptureMimeType {
  const candidates: CaptureMimeType[] = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
  ]
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type)) {
      return type
    }
  }
  return 'video/webm'
}

/**
 * Electron: chromeMediaSource + chromeMediaSourceId from desktopCapturer.
 * Constraints are Chromium-specific; cast keeps TS happy without @types/webrtc extras.
 */
export async function openDesktopCaptureStream(sourceId: string): Promise<MediaStream> {
  const constraints = {
    audio: false,
    video: {
      mandatory: {
        chromeMediaSource: 'desktop',
        chromeMediaSourceId: sourceId,
      },
    },
  } as unknown as MediaStreamConstraints

  return navigator.mediaDevices.getUserMedia(constraints)
}

function startRecorderOnStream(options: {
  stream: MediaStream
  videoBitsPerSecond: number
  onChunk: (data: ArrayBuffer) => Promise<void>
  onError?: (error: Error) => void
  /** When true, stop() also stops MediaStream tracks (default true). */
  stopTracksOnEnd?: boolean
}): LiveCaptureHandle {
  const mimeType = pickMimeType()
  const recorder = new MediaRecorder(options.stream, {
    mimeType,
    videoBitsPerSecond: options.videoBitsPerSecond,
  })
  const stopTracksOnEnd = options.stopTracksOnEnd !== false

  let chain: Promise<void> = Promise.resolve()
  let stopResolve: (() => void) | null = null
  const stopped = new Promise<void>((resolve) => {
    stopResolve = resolve
  })

  recorder.ondataavailable = (event: BlobEvent) => {
    if (!event.data || event.data.size === 0) return
    chain = chain
      .then(async () => {
        const buffer = await event.data.arrayBuffer()
        await options.onChunk(buffer)
      })
      .catch((err: unknown) => {
        options.onError?.(err instanceof Error ? err : new Error(String(err)))
      })
  }

  recorder.onerror = () => {
    options.onError?.(new Error('MediaRecorder error'))
  }

  recorder.onstop = () => {
    void chain.finally(() => {
      if (stopTracksOnEnd) {
        for (const track of options.stream.getTracks()) {
          track.stop()
        }
      }
      stopResolve?.()
    })
  }

  // Timeslice keeps chunks small and streaming to disk instead of one giant blob.
  recorder.start(500)

  return {
    stream: options.stream,
    mimeType,
    stop: async () => {
      if (recorder.state !== 'inactive') {
        // Flush final cluster before stop so WebM is playable immediately.
        if (recorder.state === 'recording') {
          recorder.requestData()
        }
        recorder.stop()
      } else {
        if (stopTracksOnEnd) {
          for (const track of options.stream.getTracks()) {
            track.stop()
          }
        }
        stopResolve?.()
      }
      await stopped
      await chain
    },
  }
}

export async function startLiveCapture(options: {
  sourceId: string
  onChunk: (data: ArrayBuffer) => Promise<void>
  onError?: (error: Error) => void
}): Promise<LiveCaptureHandle> {
  const stream = await openDesktopCaptureStream(options.sourceId)
  return startRecorderOnStream({
    stream,
    videoBitsPerSecond: 8_000_000,
    onChunk: options.onChunk,
    onError: options.onError,
  })
}

/** Record an already-open webcam stream in parallel with screen capture. */
export function startCameraCapture(options: {
  stream: MediaStream
  onChunk: (data: ArrayBuffer) => Promise<void>
  onError?: (error: Error) => void
}): LiveCaptureHandle {
  return startRecorderOnStream({
    stream: options.stream,
    videoBitsPerSecond: 2_500_000,
    onChunk: options.onChunk,
    onError: options.onError,
    // Keep preview stream alive until the UI stops it explicitly.
    stopTracksOnEnd: false,
  })
}
