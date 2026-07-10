/**
 * Smoke checks for FaceTime/webcam overlay layout helpers (no Electron).
 */
import {
  CAMERA_CORNERS,
  CAMERA_MAX_SIZE_PERCENT,
  CAMERA_MIN_SIZE_PERCENT,
  CAMERA_SAFE_MARGIN,
  CAMERA_SHAPES,
  DEFAULT_CAMERA_OVERLAY,
  applyCameraCornerPreset,
  cameraBubbleNormRect,
  cameraBubblePosition,
  cameraShapeBorderRadius,
  cameraBubbleSizeNorm,
  clampCameraLayout,
  layoutFromCorner,
  normalizeCameraOverlay,
  resizeCameraFromHandle,
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

  const rect = normalizeCameraOverlay({ shape: 'rectangle', sizePercent: 18 })
  assert(rect.shape === 'rectangle', 'rectangle shape kept')
  assert(CAMERA_SHAPES.includes('rectangle'), 'CAMERA_SHAPES lists rectangle')

  const badShape = normalizeCameraOverlay({ shape: 'hexagon' as never })
  assert(badShape.shape === DEFAULT_CAMERA_OVERLAY.shape, 'bad shape falls back')

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

  const rectangle = cameraBubblePosition({
    ...DEFAULT_CAMERA_OVERLAY,
    shape: 'rectangle',
    sizePercent: 24,
    anchor: 'bottom-left',
    corner: 'bottom-left',
  })
  assert(rectangle.borderRadius === '0', 'rectangle radius')
  assert(cameraShapeBorderRadius('rectangle') === '0', 'helper rectangle')
  assert(cameraShapeBorderRadius('circle') === '50%', 'helper circle')
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

function testResizeHandles(): void {
  const start = normalizeCameraOverlay({
    enabled: true,
    anchor: 'free',
    x: 0.3,
    y: 0.3,
    sizePercent: 20,
  }, 16 / 9)
  const { w, h } = cameraBubbleSizeNorm(start.sizePercent, 16 / 9)

  // SE: grow toward bottom-right — opposite (NW) stays fixed.
  const se = resizeCameraFromHandle(
    start,
    'se',
    start.x + w * 1.5,
    start.y + h * 1.5,
    16 / 9,
  )
  assert(se.sizePercent > start.sizePercent, 'se grows')
  assert(se.sizePercent <= CAMERA_MAX_SIZE_PERCENT, 'se clamp max')
  assert(nearly(se.x, start.x, 1e-3), 'se keeps top-left x')
  assert(nearly(se.y, start.y, 1e-3), 'se keeps top-left y')
  assert(se.anchor === 'free', 'resize → free anchor')

  // NW: shrink toward center — opposite (SE) stays fixed.
  const seCornerX = start.x + w
  const seCornerY = start.y + h
  const nw = resizeCameraFromHandle(
    start,
    'nw',
    start.x + w * 0.4,
    start.y + h * 0.4,
    16 / 9,
  )
  assert(nw.sizePercent < start.sizePercent, 'nw shrinks')
  assert(nw.sizePercent >= CAMERA_MIN_SIZE_PERCENT, 'nw clamp min')
  const nwSize = cameraBubbleSizeNorm(nw.sizePercent, 16 / 9)
  assert(nearly(nw.x + nwSize.w, seCornerX, 1e-3), 'nw keeps SE x')
  assert(nearly(nw.y + nwSize.h, seCornerY, 1e-3), 'nw keeps SE y')

  // Huge drag clamps to max without leaving the frame.
  const huge = resizeCameraFromHandle(start, 'se', 2, 2, 16 / 9)
  assert(huge.sizePercent === CAMERA_MAX_SIZE_PERCENT, 'huge → max size')
  assert(huge.x >= CAMERA_SAFE_MARGIN - 1e-9, 'huge still in frame x')
  assert(huge.y >= CAMERA_SAFE_MARGIN - 1e-9, 'huge still in frame y')

  console.log('ok resize handles')
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
testResizeHandles()
testReviewEditCamera()
console.log('smoke-camera: all ok')
