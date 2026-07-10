/**
 * Webcam / FaceTime device helpers (renderer).
 * Enumeration + permission via navigator.mediaDevices — no main-process IPC needed.
 * Mic is opened on the same getUserMedia call as the camera so MediaRecorder
 * writes one A/V WebM (FOKUS 3A — voice locked to FaceTime track).
 */

export interface CameraDevice {
  deviceId: string
  label: string
}

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

export interface OpenCameraStreamOptions {
  /** Request microphone on the same stream (default false). */
  includeMic?: boolean
}

export interface OpenCameraStreamResult {
  stream: MediaStream
  /** True when at least one live audio track was obtained. */
  micActive: boolean
  /** Soft status when mic was requested but unavailable (permission / device). */
  micNote: string | null
}

function friendlyLabel(info: MediaDeviceInfo, index: number): string {
  const raw = info.label?.trim()
  if (raw) return raw
  return `Camera ${index + 1}`
}

/** List videoinput devices. Labels may be empty until permission is granted. */
export async function listCameraDevices(): Promise<CameraDevice[]> {
  if (!navigator.mediaDevices?.enumerateDevices) {
    return []
  }
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices
    .filter((d) => d.kind === 'videoinput')
    .map((d, i) => ({
      deviceId: d.deviceId,
      label: friendlyLabel(d, i),
    }))
}

/**
 * Probe camera permission without opening a lasting stream when possible.
 * Falls back to a short getUserMedia round-trip (stops tracks immediately).
 */
export async function probeCameraPermission(): Promise<CameraPermissionState> {
  if (!navigator.mediaDevices?.getUserMedia) {
    return 'unsupported'
  }
  try {
    const permissions = (
      navigator as Navigator & {
        permissions?: { query: (desc: { name: string }) => Promise<{ state: string }> }
      }
    ).permissions
    if (permissions?.query) {
      try {
        const status = await permissions.query({ name: 'camera' })
        if (status.state === 'granted' || status.state === 'denied' || status.state === 'prompt') {
          return status.state
        }
      } catch {
        /* Permissions API may reject "camera" on some Chromium builds — fall through. */
      }
    }
  } catch {
    /* ignore */
  }

  // If we already have labeled devices, permission was granted before.
  const devices = await listCameraDevices()
  if (devices.some((d) => d.label && !d.label.startsWith('Camera '))) {
    return 'granted'
  }
  return 'prompt'
}

const BASE_VIDEO: MediaTrackConstraints = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 30 },
}

function videoConstraints(deviceId: string | null): MediaTrackConstraints {
  return deviceId
    ? { ...BASE_VIDEO, deviceId: { exact: deviceId } }
    : { ...BASE_VIDEO, facingMode: 'user' }
}

function cameraErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof DOMException && err.name === 'NotAllowedError') {
    return 'Camera permission denied. Allow camera access to show the FaceTime overlay.'
  }
  if (err instanceof Error) return err.message
  return fallback
}

async function getUserMediaVideoOnly(deviceId: string | null): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: videoConstraints(deviceId),
    })
  } catch (err) {
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...BASE_VIDEO, facingMode: 'user' },
        })
      } catch (retryErr) {
        throw new Error(cameraErrorMessage(retryErr, 'Failed to open camera'), {
          cause: retryErr,
        })
      }
    }
    throw new Error(cameraErrorMessage(err, 'Failed to open camera'), { cause: err })
  }
}

/**
 * Open a webcam stream; prefers deviceId when set.
 * When `includeMic` is true, requests mic on the same call; on mic failure falls
 * back to video-only so the FaceTime overlay still works.
 */
export async function openCameraStream(
  deviceId: string | null,
  options: OpenCameraStreamOptions = {},
): Promise<OpenCameraStreamResult> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not supported in this environment')
  }

  const includeMic = Boolean(options.includeMic)
  const video = videoConstraints(deviceId)

  if (!includeMic) {
    const stream = await getUserMediaVideoOnly(deviceId)
    return { stream, micActive: false, micNote: null }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video,
    })
    const micActive = stream.getAudioTracks().some((t) => t.readyState === 'live')
    return {
      stream,
      micActive,
      micNote: micActive
        ? null
        : 'Microphone track missing — recording camera video only.',
    }
  } catch (err) {
    // Exact deviceId + mic can fail for several reasons; try video-only recovery.
    const micDenied = err instanceof DOMException && err.name === 'NotAllowedError'
    try {
      const stream = await getUserMediaVideoOnly(deviceId)
      return {
        stream,
        micActive: false,
        micNote: micDenied
          ? 'Microphone permission denied — camera stays on without mic.'
          : 'Microphone unavailable — camera stays on without mic.',
      }
    } catch (videoErr) {
      throw new Error(cameraErrorMessage(videoErr, 'Failed to open camera'), {
        cause: videoErr,
      })
    }
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}

/** True when the stream currently has a live audio track (mic armed). */
export function streamHasLiveMic(stream: MediaStream | null | undefined): boolean {
  if (!stream) return false
  return stream.getAudioTracks().some((t) => t.readyState === 'live')
}
