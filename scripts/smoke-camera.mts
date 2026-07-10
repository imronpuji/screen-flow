/**
 * Smoke checks for FaceTime/webcam overlay layout helpers (no Electron).
 */
import {
  CAMERA_CORNERS,
  DEFAULT_CAMERA_OVERLAY,
  cameraBubbleNormRect,
  cameraBubblePosition,
  normalizeCameraOverlay,
} from '../shared/camera.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testNormalize(): void {
  const clamped = normalizeCameraOverlay({
    enabled: true,
    deviceId: '  cam-1  ',
    corner: 'nope' as never,
    sizePercent: 99,
    shape: 'rounded',
  })
  assert(clamped.enabled === true, 'enabled')
  assert(clamped.deviceId === 'cam-1', 'device trimmed')
  assert(clamped.corner === DEFAULT_CAMERA_OVERLAY.corner, 'bad corner falls back')
  assert(clamped.sizePercent === 40, 'size clamped high')
  assert(clamped.shape === 'rounded', 'shape')

  const low = normalizeCameraOverlay({ sizePercent: 2 })
  assert(low.sizePercent === 12, 'size clamped low')
  assert(low.enabled === false, 'default off')
  console.log('ok normalize')
}

function testPosition(): void {
  for (const corner of CAMERA_CORNERS) {
    const pos = cameraBubblePosition({ ...DEFAULT_CAMERA_OVERLAY, enabled: true, corner })
    assert(pos.width === '22%', `${corner} width`)
    assert(pos.borderRadius === '50%', `${corner} circle`)
    if (corner.includes('top')) assert(pos.top === '3%', `${corner} top`)
    else assert(pos.bottom === '3%', `${corner} bottom`)
    if (corner.includes('left')) assert(pos.left === '3%', `${corner} left`)
    else assert(pos.right === '3%', `${corner} right`)
  }
  const rounded = cameraBubblePosition({
    ...DEFAULT_CAMERA_OVERLAY,
    shape: 'rounded',
    sizePercent: 30,
  })
  assert(rounded.borderRadius === '22%', 'rounded radius')
  assert(rounded.width === '30%', 'custom size')
  console.log('ok position')
}

function testNormRect(): void {
  const rect = cameraBubbleNormRect(
    { ...DEFAULT_CAMERA_OVERLAY, enabled: true, corner: 'bottom-right', sizePercent: 20 },
    1920,
    1080,
  )
  assert(Math.abs(rect.w - 0.2) < 1e-9, 'w = size%')
  assert(Math.abs(rect.h - 384 / 1080) < 1e-9, 'h square in frame coords')
  assert(rect.x > 0.7, 'bottom-right x near right')
  assert(rect.y > 0.5, 'bottom-right y near bottom')

  const tl = cameraBubbleNormRect(
    { ...DEFAULT_CAMERA_OVERLAY, corner: 'top-left', sizePercent: 20 },
    1000,
    1000,
  )
  assert(Math.abs(tl.x - 0.03) < 1e-9, 'top-left x = margin')
  assert(Math.abs(tl.y - 0.03) < 1e-9, 'top-left y = margin')

  const empty = cameraBubbleNormRect(DEFAULT_CAMERA_OVERLAY, 0, 0)
  assert(empty.w === 0 && empty.h === 0, 'zero frame → empty rect')
  console.log('ok norm rect')
}

testNormalize()
testPosition()
testNormRect()
console.log('smoke-camera: all ok')
