/**
 * Smoke checks for FaceTime device pick / presence helpers (no Electron / DOM).
 */
import {
  CAMERA_INACTIVE_STATUS,
  isCameraDevicePresent,
  pickCameraDeviceId,
  type CameraDevice,
} from '../src/lib/cameraDevices.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPick(): void {
  const devices: CameraDevice[] = [
    { deviceId: 'facetime', label: 'FaceTime HD Camera' },
    { deviceId: 'continuity', label: 'iPhone Continuity Camera' },
  ]

  assert(pickCameraDeviceId(devices, 'continuity') === 'continuity', 'keep preferred')
  assert(pickCameraDeviceId(devices, 'gone') === 'facetime', 'fallback first')
  assert(pickCameraDeviceId(devices, null) === 'facetime', 'null → first')
  assert(pickCameraDeviceId(devices, '  ') === 'facetime', 'blank → first')
  assert(pickCameraDeviceId([], 'facetime') === null, 'empty list')
  assert(pickCameraDeviceId([], null) === null, 'empty + null')
  console.log('ok pick')
}

function testPresent(): void {
  const devices: CameraDevice[] = [{ deviceId: 'cam-a', label: 'Cam A' }]
  assert(isCameraDevicePresent(devices, 'cam-a') === true, 'present')
  assert(isCameraDevicePresent(devices, 'cam-b') === false, 'missing')
  assert(isCameraDevicePresent(devices, null) === false, 'null not present')
  assert(isCameraDevicePresent(devices, '  ') === false, 'blank not present')
  assert(isCameraDevicePresent([], 'cam-a') === false, 'empty list')
  console.log('ok present')
}

function testInactiveStatus(): void {
  assert(
    CAMERA_INACTIVE_STATUS.toLowerCase().includes('inactive'),
    'soft inactive copy',
  )
  assert(!CAMERA_INACTIVE_STATUS.includes('DOMException'), 'no technical jargon')
  console.log('ok status', CAMERA_INACTIVE_STATUS)
}

testPick()
testPresent()
testInactiveStatus()
console.log('smoke-camera-devices: all ok')
