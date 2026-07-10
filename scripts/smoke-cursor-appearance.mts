/**
 * Smoke checks for modifiable cursor appearance (size / style / hide / spotlight).
 */
import {
  appearanceToCursorDrawOptions,
  clampCursorSizeScale,
  DEFAULT_CURSOR_APPEARANCE,
  isCursorVisible,
  normalizeCursorAppearance,
  resolveCursorDotSizePx,
} from '../dist-electron/shared/cursorAppearance.js'
import type { CursorEvent } from '../shared/cursor.ts'
import { planCursorExport } from '../dist-electron/shared/ffmpegCursor.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testNormalize(): void {
  const normalized = normalizeCursorAppearance({
    style: 'crosshair',
    sizeScale: 99,
    spotlightEnabled: true,
  })
  assert(normalized.style === 'crosshair', 'style preserved')
  assert(normalized.sizeScale === 3, 'size clamped to max')
  assert(normalized.spotlightEnabled, 'spotlight on')
  assert(clampCursorSizeScale(0.1) === 0.5, 'min scale')
  assert(isCursorVisible(DEFAULT_CURSOR_APPEARANCE), 'default visible')
  assert(!isCursorVisible({ ...DEFAULT_CURSOR_APPEARANCE, style: 'hidden' }), 'hidden')
  console.log('ok normalize')
}

function testSizing(): void {
  const small = resolveCursorDotSizePx({ ...DEFAULT_CURSOR_APPEARANCE, sizeScale: 0.5 })
  const large = resolveCursorDotSizePx({ ...DEFAULT_CURSOR_APPEARANCE, sizeScale: 2 })
  assert(small < 14, 'half size smaller than default')
  assert(large === 28, '2× size is 28px')
  const draw = appearanceToCursorDrawOptions({
    style: 'dot',
    sizeScale: 1.5,
    spotlightEnabled: true,
  })
  assert(draw.dotSizePx === 21, '1.5× dot')
  assert(draw.spotlightEnabled, 'spotlight flag')
  assert(draw.spotlightPx > draw.dotSizePx, 'spotlight larger than dot')
  console.log('ok sizing')
}

function testExportPlans(): void {
  const events: CursorEvent[] = [
    { t: 0, x: 10, y: 10, kind: 'move' },
    { t: 200, x: 160, y: 90, kind: 'click', button: 0 },
  ]
  const videoSize = { width: 320, height: 180 }

  const hidden = planCursorExport(events, videoSize, 1000, null, {
    appearance: { style: 'hidden', sizeScale: 1, spotlightEnabled: false },
  })
  assert(!hidden.hasCursor, 'hidden skips cursor bake')
  assert(hidden.filterComplex.includes('null'), 'hidden uses null filter')

  const large = planCursorExport(events, videoSize, 1000, null, {
    appearance: { style: 'dot', sizeScale: 2, spotlightEnabled: false },
  })
  assert(large.hasCursor, 'large cursor active')
  assert(large.filterComplex.includes('w=28:h=28'), '2× drawbox size')

  const cross = planCursorExport(events, videoSize, 1000, null, {
    appearance: { style: 'crosshair', sizeScale: 1, spotlightEnabled: true },
  })
  assert(cross.hasCursor, 'crosshair active')
  assert(cross.filterComplex.includes('drawbox@cursorh'), 'horizontal arm')
  assert(cross.filterComplex.includes('drawbox@cursorv'), 'vertical arm')
  assert(cross.filterComplex.includes('drawbox@spot'), 'spotlight filter')
  assert(cross.sendCmd.includes('drawbox@cursorh'), 'sendcmd drives crosshair')
  console.log('ok export plans')
}

testNormalize()
testSizing()
testExportPlans()
console.log('smoke:cursor-appearance ok')
