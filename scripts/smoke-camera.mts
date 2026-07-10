/**
 * Smoke checks for FaceTime/webcam overlay layout helpers (no Electron).
 */
import {
  CAMERA_BORDER_COLOR_PRESETS,
  CAMERA_CORNERS,
  CAMERA_DEFAULT_ASPECT,
  CAMERA_EDGE_TARGETS,
  CAMERA_MAX_SIZE_PERCENT,
  CAMERA_MIN_SIZE_PERCENT,
  CAMERA_SAFE_MARGIN,
  CAMERA_SHAPES,
  CAMERA_SIZE_PRESETS,
  CAMERA_SNAP_PRESETS,
  DEFAULT_CAMERA_OVERLAY,
  applyCameraCornerPreset,
  applyCameraSizePreset,
  applyCameraSnapPreset,
  cameraBubbleChromeStyle,
  cameraBubbleNormRect,
  cameraBubblePosition,
  cameraShapeBorderRadius,
  cameraBubbleSizeNorm,
  cameraSizePresetFromDigitKey,
  cameraSnapPresetLabel,
  cameraSnapTargets,
  clampCameraLayout,
  layoutFromCorner,
  matchCameraSizePreset,
  matchCameraSnapTarget,
  normalizeCameraBorderColor,
  normalizeCameraOverlay,
  nudgeCameraLayout,
  nudgeCameraSize,
  resetCameraLayout,
  resizeCameraFromHandle,
  snapCameraLayout,
  CAMERA_NUDGE_STEP,
  CAMERA_NUDGE_STEP_SHIFT,
  CAMERA_SIZE_NUDGE_STEP,
  CAMERA_SIZE_NUDGE_STEP_SHIFT,
  CAMERA_SNAP_CYCLE_ORDER,
  cycleCameraShape,
  cycleCameraSnapPreset,
  placeCameraAtPoint,
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
  assert(clamped.shadowEnabled === true, 'default shadow on')
  assert(clamped.borderEnabled === true, 'default border on')
  assert(clamped.borderWidthPx === 2, 'default border width')
  assert(clamped.borderColor === '#E8EEF4', 'default border color')
  assert(clamped.micEnabled === true, 'default mic on with camera')

  const low = normalizeCameraOverlay({ sizePercent: 2 })
  assert(low.sizePercent === 12, 'size clamped low')
  assert(low.enabled === false, 'default off')

  const noMic = normalizeCameraOverlay({ micEnabled: false })
  assert(noMic.micEnabled === false, 'mic can be disabled')

  const rect = normalizeCameraOverlay({ shape: 'rectangle', sizePercent: 18 })
  assert(rect.shape === 'rectangle', 'rectangle shape kept')
  assert(CAMERA_SHAPES.includes('rectangle'), 'CAMERA_SHAPES lists rectangle')

  const badShape = normalizeCameraOverlay({ shape: 'hexagon' as never })
  assert(badShape.shape === DEFAULT_CAMERA_OVERLAY.shape, 'bad shape falls back')

  const chrome = normalizeCameraOverlay({
    shadowEnabled: false,
    borderEnabled: true,
    borderWidthPx: 9,
    borderColor: '#abc',
  })
  assert(chrome.shadowEnabled === false, 'shadow off')
  assert(chrome.borderWidthPx === 6, 'border width clamped high')
  assert(chrome.borderColor === '#AABBCC', 'short hex expanded')
  assert(normalizeCameraBorderColor('nope') === '#E8EEF4', 'bad color falls back')
  assert(
    CAMERA_BORDER_COLOR_PRESETS.some((p) => p.color === '#E8EEF4'),
    'frost preset present',
  )
  assert(CAMERA_BORDER_COLOR_PRESETS.length >= 5, 'enough outline swatches')

  const look = normalizeCameraOverlay({
    mirrored: false,
    opacity: 0.1,
  })
  assert(look.mirrored === false, 'mirror off kept')
  assert(look.opacity === 0.35, 'opacity clamped low')
  assert(DEFAULT_CAMERA_OVERLAY.mirrored === true, 'default mirrored')
  assert(DEFAULT_CAMERA_OVERLAY.opacity === 1, 'default opacity')
  assert(
    normalizeCameraOverlay({ opacity: 2 }).opacity === 1,
    'opacity clamped high',
  )

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
    assert(pos.border.includes('2px solid'), `${corner} default border`)
    assert(pos.boxShadow.includes('rgba'), `${corner} default shadow`)
    assert(pos.opacity === 1, `${corner} default opacity`)
  }
  const faded = cameraBubblePosition({
    ...DEFAULT_CAMERA_OVERLAY,
    opacity: 0.7,
  })
  assert(faded.opacity === 0.7, 'position carries opacity')
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

  const bare = cameraBubbleChromeStyle({
    ...DEFAULT_CAMERA_OVERLAY,
    shadowEnabled: false,
    borderEnabled: false,
  })
  assert(bare.border === 'none', 'chrome border off')
  assert(bare.boxShadow === 'none', 'chrome shadow off')
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

  const targets = cameraSnapTargets(20, 16 / 9)
  assert(targets.length === 8, '8 snap targets')
  assert(CAMERA_SNAP_PRESETS.length === 8, '8 snap presets')
  assert(CAMERA_EDGE_TARGETS.length === 4, '4 edge mids')

  const topCenter = targets.find((t) => t.id === 'top-center')!
  const nearEdge = snapCameraLayout(topCenter.x + 0.01, topCenter.y + 0.005, 20, 16 / 9)
  assert(nearEdge.snapped === true, 'near edge mid snaps')
  assert(nearEdge.target === 'top-center', 'edge mid target id')
  assert(nearEdge.corner === null, 'edge mid is not a corner anchor')
  assert(nearly(nearEdge.x, topCenter.x) && nearly(nearEdge.y, topCenter.y), 'edge coords')

  const preset = applyCameraCornerPreset(
    { ...DEFAULT_CAMERA_OVERLAY, enabled: true, sizePercent: 24 },
    'top-left',
    1,
  )
  assert(preset.anchor === 'top-left', 'preset anchor')
  assert(nearly(preset.x, CAMERA_SAFE_MARGIN), 'preset x')
  assert(nearly(preset.y, CAMERA_SAFE_MARGIN), 'preset y')

  const edgePreset = applyCameraSnapPreset(
    { ...DEFAULT_CAMERA_OVERLAY, enabled: true, sizePercent: 20 },
    'bottom-center',
    16 / 9,
  )
  assert(edgePreset.anchor === 'free', 'edge preset → free anchor')
  assert(matchCameraSnapTarget(edgePreset, 16 / 9) === 'bottom-center', 'match edge')
  assert(cameraSnapPresetLabel('left-center') === 'Left', 'edge label')

  for (const corner of CAMERA_CORNERS) {
    const p = applyCameraSnapPreset(DEFAULT_CAMERA_OVERLAY, corner, 16 / 9)
    assert(matchCameraSnapTarget(p, 16 / 9) === corner, `match ${corner}`)
  }

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
  assert(huge.lockAspect === true, 'default resize stays locked')
  assert(huge.heightPercent === huge.sizePercent, 'locked → square height')

  // Free aspect (rectangle): width & height move independently.
  const freeStart = normalizeCameraOverlay(
    {
      enabled: true,
      shape: 'rectangle',
      lockAspect: false,
      anchor: 'free',
      x: 0.2,
      y: 0.2,
      sizePercent: 20,
      heightPercent: 20,
    },
    16 / 9,
  )
  assert(freeStart.lockAspect === false, 'rect can unlock')
  const freeSe = resizeCameraFromHandle(
    freeStart,
    'se',
    freeStart.x + 0.35,
    freeStart.y + 0.15,
    16 / 9,
  )
  assert(freeSe.lockAspect === false, 'free resize stays unlocked')
  assert(freeSe.sizePercent > freeStart.sizePercent, 'free se grows width')
  assert(freeSe.heightPercent !== freeSe.sizePercent, 'free se non-square')
  assert(freeSe.heightPercent >= CAMERA_MIN_SIZE_PERCENT, 'free height min')
  assert(freeSe.heightPercent <= CAMERA_MAX_SIZE_PERCENT, 'free height max')

  // Circle forces lock even if unlock requested.
  const circleForced = normalizeCameraOverlay({
    shape: 'circle',
    lockAspect: false,
    sizePercent: 24,
    heightPercent: 18,
  })
  assert(circleForced.lockAspect === true, 'circle forces lock')
  assert(circleForced.heightPercent === 24, 'circle height = width')

  const unlockedPos = cameraBubblePosition(
    normalizeCameraOverlay({
      shape: 'rounded',
      lockAspect: false,
      sizePercent: 20,
      heightPercent: 30,
      x: 0.1,
      y: 0.1,
      anchor: 'free',
    }),
    16 / 9,
  )
  assert(unlockedPos.aspectRatio === undefined, 'unlocked drops aspect-ratio')
  assert(typeof unlockedPos.height === 'string' && unlockedPos.height.length > 0, 'unlocked sets height')

  console.log('ok resize handles')
}

function testNudge(): void {
  const start = normalizeCameraOverlay({
    enabled: true,
    corner: 'bottom-right',
    sizePercent: 22,
    shape: 'circle',
  })
  const left = nudgeCameraLayout(start, 'left')
  assert(left.anchor === 'free', 'nudge → free')
  assert(nearly(left.x, start.x - CAMERA_NUDGE_STEP), 'nudge left step')
  assert(nearly(left.y, start.y), 'nudge left keeps y')

  const upShift = nudgeCameraLayout(start, 'up', { shift: true })
  assert(nearly(upShift.y, start.y - CAMERA_NUDGE_STEP_SHIFT), 'shift nudge up')

  // From top-left corner, nudge up/left should clamp at safe margin.
  const corner = applyCameraCornerPreset({}, 'top-left')
  const clamped = nudgeCameraLayout(corner, 'up')
  assert(nearly(clamped.y, CAMERA_SAFE_MARGIN), 'nudge clamps top')
  const clampedL = nudgeCameraLayout(corner, 'left')
  assert(nearly(clampedL.x, CAMERA_SAFE_MARGIN), 'nudge clamps left')

  console.log('ok nudge')
}

function testSizeNudgeAndPresets(): void {
  const start = normalizeCameraOverlay({
    enabled: true,
    corner: 'bottom-right',
    sizePercent: 22,
    shape: 'circle',
  })
  assert(matchCameraSizePreset(start) === 'medium', 'default matches M')

  const grown = nudgeCameraSize(start, 'grow')
  assert(grown.sizePercent === start.sizePercent + CAMERA_SIZE_NUDGE_STEP, 'grow +1')
  assert(grown.heightPercent === grown.sizePercent, 'locked height follows grow')
  assert(matchCameraSizePreset(grown) == null, 'off-preset after nudge')

  const shrunkShift = nudgeCameraSize(start, 'shrink', { shift: true })
  assert(
    shrunkShift.sizePercent === start.sizePercent - CAMERA_SIZE_NUDGE_STEP_SHIFT,
    'shift shrink −4',
  )

  const atMin = nudgeCameraSize(
    normalizeCameraOverlay({ ...start, sizePercent: CAMERA_MIN_SIZE_PERCENT }),
    'shrink',
  )
  assert(atMin.sizePercent === CAMERA_MIN_SIZE_PERCENT, 'size nudge clamps min')

  const atMax = nudgeCameraSize(
    normalizeCameraOverlay({ ...start, sizePercent: CAMERA_MAX_SIZE_PERCENT }),
    'grow',
    { shift: true },
  )
  assert(atMax.sizePercent === CAMERA_MAX_SIZE_PERCENT, 'size nudge clamps max')

  const unlocked = normalizeCameraOverlay({
    ...start,
    shape: 'rectangle',
    lockAspect: false,
    sizePercent: 20,
    heightPercent: 30,
  })
  const unlockedGrow = nudgeCameraSize(unlocked, 'grow')
  assert(unlockedGrow.sizePercent === 21, 'unlocked grows width')
  assert(unlockedGrow.heightPercent === 30, 'unlocked keeps height')

  for (const preset of CAMERA_SIZE_PRESETS) {
    const applied = applyCameraSizePreset(start, preset.id)
    assert(applied.sizePercent === preset.sizePercent, `preset ${preset.id} size`)
    assert(matchCameraSizePreset(applied) === preset.id, `match ${preset.id}`)
  }

  const freeLarge = applyCameraSizePreset(unlocked, 'large')
  assert(freeLarge.sizePercent === 32, 'large preset width')
  assert(freeLarge.heightPercent === 30, 'large keeps unlocked height')

  // Growing a corner-anchored bubble should re-layout within safe margin.
  const corner = applyCameraCornerPreset({ sizePercent: 16 }, 'top-left')
  const bigger = applyCameraSizePreset(corner, 'large')
  assert(nearly(bigger.x, CAMERA_SAFE_MARGIN), 'size preset keeps TL x')
  assert(nearly(bigger.y, CAMERA_SAFE_MARGIN), 'size preset keeps TL y')

  assert(cameraSizePresetFromDigitKey('1') === 'small', 'digit 1 → S')
  assert(cameraSizePresetFromDigitKey('2') === 'medium', 'digit 2 → M')
  assert(cameraSizePresetFromDigitKey('3') === 'large', 'digit 3 → L')
  assert(cameraSizePresetFromDigitKey('4') == null, 'digit 4 ignored')
  assert(cameraSizePresetFromDigitKey('a') == null, 'letter ignored')

  const messy = normalizeCameraOverlay({
    enabled: true,
    deviceId: 'facetime-hd',
    corner: 'top-left',
    anchor: 'free',
    x: 0.4,
    y: 0.4,
    sizePercent: 36,
    heightPercent: 18,
    lockAspect: false,
    shape: 'rectangle',
    mirrored: false,
    opacity: 0.8,
    micEnabled: false,
    borderColor: '#3DD6C6',
  })
  const reset = resetCameraLayout(messy)
  assert(reset.corner === 'bottom-right', 'reset corner BR')
  assert(reset.anchor === 'bottom-right', 'reset anchor BR')
  assert(reset.sizePercent === 22, 'reset medium size')
  assert(reset.heightPercent === 22, 'reset locks height')
  assert(reset.lockAspect === true, 'reset locks aspect')
  assert(reset.deviceId === 'facetime-hd', 'reset keeps device')
  assert(reset.enabled === true, 'reset keeps enabled')
  assert(reset.shape === 'rectangle', 'reset keeps shape')
  assert(reset.mirrored === false, 'reset keeps mirror')
  assert(reset.opacity === 0.8, 'reset keeps opacity')
  assert(reset.micEnabled === false, 'reset keeps mic')
  assert(reset.borderColor === '#3DD6C6', 'reset keeps border color')
  const expectedBR = applyCameraCornerPreset(
    { sizePercent: 22, heightPercent: 22, lockAspect: true },
    'bottom-right',
  )
  assert(nearly(reset.x, expectedBR.x), 'reset x matches BR')
  assert(nearly(reset.y, expectedBR.y), 'reset y matches BR')

  console.log('ok size nudge + presets')
}

function testCycleSnapAndShape(): void {
  assert(CAMERA_SNAP_CYCLE_ORDER.length === 8, 'cycle order has 8')
  assert(CAMERA_SNAP_CYCLE_ORDER[0] === 'top-left', 'cycle starts TL')
  assert(CAMERA_SNAP_CYCLE_ORDER[4] === 'bottom-right', 'cycle mid BR')

  let style = applyCameraSnapPreset(DEFAULT_CAMERA_OVERLAY, 'top-left')
  style = cycleCameraSnapPreset(style, 'next')
  assert(matchCameraSnapTarget(style) === 'top-center', 'next from TL → top')
  style = cycleCameraSnapPreset(style, 'next')
  assert(matchCameraSnapTarget(style) === 'top-right', 'next → TR')
  style = cycleCameraSnapPreset(style, 'prev')
  assert(matchCameraSnapTarget(style) === 'top-center', 'prev back to top')

  // Wrap: left-center → next → top-left
  style = applyCameraSnapPreset(DEFAULT_CAMERA_OVERLAY, 'left-center')
  style = cycleCameraSnapPreset(style, 'next')
  assert(matchCameraSnapTarget(style) === 'top-left', 'wrap clockwise')

  // Custom free layout: step from nearest
  const free = normalizeCameraOverlay({
    ...DEFAULT_CAMERA_OVERLAY,
    anchor: 'free',
    x: CAMERA_SAFE_MARGIN + 0.02,
    y: CAMERA_SAFE_MARGIN + 0.02,
  })
  const cycled = cycleCameraSnapPreset(free, 'next')
  assert(matchCameraSnapTarget(cycled) != null, 'custom lands on a preset')
  assert(matchCameraSnapTarget(cycled) !== 'top-left', 'custom steps past nearest TL')

  let shapeStyle = normalizeCameraOverlay({
    shape: 'circle',
    sizePercent: 24,
    lockAspect: true,
  })
  shapeStyle = cycleCameraShape(shapeStyle, 'next')
  assert(shapeStyle.shape === 'rounded', 'circle → rounded')
  shapeStyle = cycleCameraShape(shapeStyle, 'next')
  assert(shapeStyle.shape === 'rectangle', 'rounded → rectangle')
  shapeStyle = cycleCameraShape(shapeStyle, 'next')
  assert(shapeStyle.shape === 'circle', 'rectangle → circle')
  assert(shapeStyle.lockAspect === true, 'circle re-locks')
  assert(shapeStyle.heightPercent === shapeStyle.sizePercent, 'circle square')

  const unlocked = normalizeCameraOverlay({
    shape: 'rectangle',
    lockAspect: false,
    sizePercent: 30,
    heightPercent: 16,
  })
  const toRounded = cycleCameraShape(unlocked, 'prev')
  assert(toRounded.shape === 'rounded', 'prev rectangle → rounded')
  assert(toRounded.lockAspect === false, 'keeps unlock on rounded')
  assert(toRounded.heightPercent === 16, 'keeps free height')

  console.log('ok cycle snap + shape')
}

function testPlaceAtPoint(): void {
  const base = normalizeCameraOverlay({
    enabled: true,
    sizePercent: 22,
    shape: 'circle',
  })
  const br = placeCameraAtPoint(base, 0.95, 0.95)
  assert(matchCameraSnapTarget(br) === 'bottom-right', 'click BR snaps BR')
  assert(br.anchor === 'bottom-right', 'BR anchor')

  const tl = placeCameraAtPoint(base, 0.05, 0.05)
  assert(matchCameraSnapTarget(tl) === 'top-left', 'click TL snaps TL')

  const mid = placeCameraAtPoint(base, 0.5, 0.5)
  assert(
    matchCameraSnapTarget(mid) === 'top-center' ||
      matchCameraSnapTarget(mid) === 'bottom-center' ||
      matchCameraSnapTarget(mid) === null ||
      ['left-center', 'right-center'].includes(matchCameraSnapTarget(mid) ?? ''),
    'center click snaps edge mid or free',
  )
  // Center of frame with default size should hit an edge mid (top/bottom) or stay free.
  const rect = cameraBubbleNormRect(mid, 1920, 1080)
  assert(rect.w > 0 && rect.h > 0, 'placed bubble has size')
  assert(rect.x >= 0 && rect.y >= 0, 'placed bubble in frame')

  const freeish = placeCameraAtPoint(base, 0.35, 0.4, CAMERA_DEFAULT_ASPECT, 0.01)
  assert(freeish.anchor === 'free', 'tiny threshold keeps free when far from snap')

  // Drag path on layout map = successive placeCameraAtPoint calls (magnetic).
  let dragged = base
  for (const [px, py] of [
    [0.2, 0.2],
    [0.4, 0.3],
    [0.9, 0.9],
  ] as const) {
    dragged = placeCameraAtPoint(dragged, px, py)
  }
  assert(matchCameraSnapTarget(dragged) === 'bottom-right', 'drag path ends at BR snap')

  // Scroll-wheel resize on map uses the same nudgeCameraSize helper.
  const beforeSize = dragged.sizePercent
  const grown = nudgeCameraSize(dragged, 'grow')
  assert(grown.sizePercent === beforeSize + 1, 'map wheel grow +1')
  const shrunk = nudgeCameraSize(grown, 'shrink', { shift: true })
  assert(shrunk.sizePercent === grown.sizePercent - 4, 'map wheel shift shrink -4')

  console.log('ok place at point')
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
  assert(withCam.cameraOverlay.shadowEnabled === true, 'seeded default shadow')
  assert(withCam.cameraOverlay.borderEnabled === true, 'seeded default border')
  console.log('ok review edit camera')
}

testNormalize()
testPosition()
testNormRect()
testSnapAndPresets()
testResizeHandles()
testNudge()
testSizeNudgeAndPresets()
testCycleSnapAndShape()
testPlaceAtPoint()
testReviewEditCamera()
console.log('smoke-camera: all ok')
