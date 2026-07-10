/**
 * Webcam / FaceTime device helpers (renderer).
 * Enumeration + permission via navigator.mediaDevices — no main-process IPC needed.
 */

export interface CameraDevice {
  deviceId: string
  label: string
}

export type CameraPermissionState = 'granted' | 'denied' | 'prompt' | 'unsupported'

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

/** Open a webcam stream; prefers deviceId when set. */
export async function openCameraStream(deviceId: string | null): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Camera is not supported in this environment')
  }

  // Ideal constraints help FaceTime HD pick a real camera resolution (not 0×0).
  const baseVideo: MediaTrackConstraints = {
    width: { ideal: 1280 },
    height: { ideal: 720 },
    frameRate: { ideal: 30 },
  }
  const video: MediaTrackConstraints = deviceId
    ? { ...baseVideo, deviceId: { exact: deviceId } }
    : { ...baseVideo, facingMode: 'user' }

  try {
    return await navigator.mediaDevices.getUserMedia({ audio: false, video })
  } catch (err) {
    // Exact deviceId can fail if the device disappeared — retry with default.
    if (deviceId) {
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { ...baseVideo, facingMode: 'user' },
        })
      } catch (retryErr) {
        const message =
          retryErr instanceof DOMException && retryErr.name === 'NotAllowedError'
            ? 'Camera permission denied. Allow camera access to show the FaceTime overlay.'
            : retryErr instanceof Error
              ? retryErr.message
              : 'Failed to open camera'
        throw new Error(message, { cause: retryErr })
      }
    }
    const message =
      err instanceof DOMException && err.name === 'NotAllowedError'
        ? 'Camera permission denied. Allow camera access to show the FaceTime overlay.'
        : err instanceof Error
          ? err.message
          : 'Failed to open camera'
    throw new Error(message, { cause: err })
  }
}

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  if (!stream) return
  for (const track of stream.getTracks()) {
    track.stop()
  }
}
