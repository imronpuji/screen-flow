/**
 * Smoke checks for FaceTime/webcam overlay layout helpers (no Electron).
 */
import {
  CAMERA_CORNERS,
  CAMERA_SAFE_MARGIN,
  DEFAULT_CAMERA_OVERLAY,
  applyCameraCornerPreset,
  cameraBubbleNormRect,
  cameraBubblePosition,
  clampCameraLayout,
  layoutFromCorner,
  normalizeCameraOverlay,
  snapCameraLayout,
} from '../shared/camera.ts'
import { defaultReviewEdit } from '../dist-electron/shared/edit.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps
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
  assert(clamped.anchor === DEFAULT_CAMERA_OVERLAY.corner, 'anchor from corner')
  assert(Number.isFinite(clamped.x) && Number.isFinite(clamped.y), 'x/y filled')

  const low = normalizeCameraOverlay({ sizePercent: 2 })
  assert(low.sizePercent === 12, 'size clamped low')
  assert(low.enabled === false, 'default off')

  const free = normalizeCameraOverlay({
    enabled: true,
    anchor: 'free',
    x: 0.4,
    y: 0.35,
    sizePercent: 20,
  })
  assert(free.anchor === 'free', 'free anchor kept')
  assert(nearly(free.x, 0.4), 'free x')
  assert(nearly(free.y, 0.35), 'free y')
  console.log('ok normalize')
}

function testPosition(): void {
  for (const corner of CAMERA_CORNERS) {
    const pos = cameraBubblePosition({ ...DEFAULT_CAMERA_OVERLAY, enabled: true, corner, anchor: corner })
    assert(pos.width === '22%', `${corner} width`)
    assert(pos.borderRadius === '50%', `${corner} circle`)
    assert(typeof pos.left === 'string' && pos.left.endsWith('%'), `${corner} left`)
    assert(typeof pos.top === 'string' && pos.top.endsWith('%'), `${corner} top`)
  }
  const rounded = cameraBubblePosition({
    ...DEFAULT_CAMERA_OVERLAY,
    shape: 'rounded',
    sizePercent: 30,
    anchor: 'top-left',
    corner: 'top-left',
  })
  assert(rounded.borderRadius === '22%', 'rounded radius')
  assert(rounded.width === '30%', 'custom size')
  console.log('ok position')
}

function testNormRect(): void {
  const rect = cameraBubbleNormRect(
    {
      ...DEFAULT_CAMERA_OVERLAY,
      enabled: true,
      corner: 'bottom-right',
      anchor: 'bottom-right',
      sizePercent: 20,
    },
    1920,
    1080,
  )
  assert(Math.abs(rect.w - 0.2) < 1e-9, 'w = size%')
  assert(Math.abs(rect.h - 384 / 1080) < 1e-9, 'h square in frame coords')
  assert(rect.x > 0.7, 'bottom-right x near right')
  assert(rect.y > 0.5, 'bottom-right y near bottom')

  const tl = cameraBubbleNormRect(
    {
      ...DEFAULT_CAMERA_OVERLAY,
      corner: 'top-left',
      anchor: 'top-left',
      sizePercent: 20,
    },
    1000,
    1000,
  )
  assert(Math.abs(tl.x - CAMERA_SAFE_MARGIN) < 1e-9, 'top-left x = margin')
  assert(Math.abs(tl.y - CAMERA_SAFE_MARGIN) < 1e-9, 'top-left y = margin')

  const free = cameraBubbleNormRect(
    {
      ...DEFAULT_CAMERA_OVERLAY,
      enabled: true,
      anchor: 'free',
      x: 0.25,
      y: 0.4,
      sizePercent: 20,
    },
    1920,
    1080,
  )
  assert(nearly(free.x, 0.25), 'free norm x')
  assert(nearly(free.y, 0.4), 'free norm y')

  const empty = cameraBubbleNormRect(DEFAULT_CAMERA_OVERLAY, 0, 0)
  assert(empty.w === 0 && empty.h === 0, 'zero frame → empty rect')
  console.log('ok norm rect')
}

function testSnapAndPresets(): void {
  const br = layoutFromCorner('bottom-right', 20, 16 / 9)
  const near = snapCameraLayout(br.x + 0.01, br.y - 0.01, 20, 16 / 9)
  assert(near.snapped === true, 'near corner snaps')
  assert(near.corner === 'bottom-right', 'snap corner id')
  assert(nearly(near.x, br.x) && nearly(near.y, br.y), 'snap coords')

  const mid = snapCameraLayout(0.4, 0.4, 20, 16 / 9)
  assert(mid.snapped === false, 'center stays free')
  assert(mid.corner === null, 'no corner when free')

  const preset = applyCameraCornerPreset(
    { ...DEFAULT_CAMERA_OVERLAY, enabled: true, sizePercent: 24 },
    'top-left',
    1,
  )
  assert(preset.anchor === 'top-left', 'preset anchor')
  assert(nearly(preset.x, CAMERA_SAFE_MARGIN), 'preset x')
  assert(nearly(preset.y, CAMERA_SAFE_MARGIN), 'preset y')

  const overflow = clampCameraLayout(-0.5, 2, 30, 16 / 9)
  assert(overflow.x >= CAMERA_SAFE_MARGIN, 'clamp x min')
  assert(overflow.y <= 1 - CAMERA_SAFE_MARGIN, 'clamp y max')
  console.log('ok snap + presets')
}

function testReviewEditCamera(): void {
  const plain = defaultReviewEdit(5000)
  assert(plain.cameraOverlay.enabled === false, 'default review camera off')
  assert(plain.cameraOverlay.corner === 'bottom-right', 'default corner')
  assert(typeof plain.cameraOverlay.x === 'number', 'default x')
  assert(typeof plain.cameraOverlay.y === 'number', 'default y')

  const withCam = defaultReviewEdit(3000, {
    enabled: true,
    deviceId: 'facetime',
    corner: 'top-left',
    sizePercent: 28,
    shape: 'rounded',
  })
  assert(withCam.cameraOverlay.enabled === true, 'seeded enabled')
  assert(withCam.cameraOverlay.deviceId === 'facetime', 'seeded device')
  assert(withCam.cameraOverlay.corner === 'top-left', 'seeded corner')
  assert(withCam.cameraOverlay.anchor === 'top-left', 'seeded anchor')
  assert(withCam.cameraOverlay.sizePercent === 28, 'seeded size')
  assert(withCam.cameraOverlay.shape === 'rounded', 'seeded shape')
  assert(nearly(withCam.cameraOverlay.x, CAMERA_SAFE_MARGIN), 'seeded top-left x')
  console.log('ok review edit camera')
}

testNormalize()
testPosition()
testNormRect()
testSnapAndPresets()
testReviewEditCamera()
console.log('smoke-camera: all ok')
