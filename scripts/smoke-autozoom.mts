/**
 * Smoke checks for auto-zoom keyframe engine (no Electron).
 * Load compiled shared modules so `.js` imports resolve after build:electron.
 */
import type { CursorEvent } from '../shared/cursor.ts'
import {
  buildZoomSegments,
  easeCubicInOut,
  getZoomTransformAtTime,
  parseCursorJsonl,
} from '../dist-electron/shared/autozoom.js'
import {
  mapScreenToNormalized,
  mapScreenToVideoPixels,
} from '../dist-electron/shared/cursorCoords.js'
import type { CaptureGeometry } from '../shared/cursorCoords.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testEase(): void {
  assert(easeCubicInOut(0) === 0, 'ease 0')
  assert(easeCubicInOut(1) === 1, 'ease 1')
  assert(easeCubicInOut(0.5) > 0.4 && easeCubicInOut(0.5) < 0.6, 'ease mid')
  // No overshoot past endpoints
  assert(easeCubicInOut(-0.5) === 0, 'ease clamp low')
  assert(easeCubicInOut(1.5) === 1, 'ease clamp high')
  console.log('ok ease')
}

function testParseJsonl(): void {
  const jsonl = '{"t":0,"x":100,"y":200,"kind":"move"}\n{"t":50,"x":400,"y":300,"kind":"click","button":0}\n'
  const events = parseCursorJsonl(jsonl)
  assert(events.length === 2 && events[1]?.kind === 'click', 'parse jsonl')
  console.log('ok parse')
}

function testZoomSegments(): void {
  const events: CursorEvent[] = [
    { t: 100, x: 960, y: 540, kind: 'click', button: 0 },
    { t: 2000, x: 480, y: 270, kind: 'click', button: 0 },
  ]
  const videoSize = { width: 1920, height: 1080 }
  const segments = buildZoomSegments(events, videoSize, {
    peakScale: 2,
    zoomInMs: 200,
    holdMs: 300,
    zoomOutMs: 200,
    mergeWindowMs: 0,
    retargetActive: false,
  })
  assert(segments.length === 2, 'two segments')
  assert(segments[1]!.startMs >= segments[0]!.endMs, 'no overlap')

  const atClick = getZoomTransformAtTime(100, segments)
  assert(atClick.scale === 1, 'at click start scale 1')

  const midZoom = getZoomTransformAtTime(200, segments)
  assert(midZoom.scale > 1.4 && midZoom.scale < 2.1, 'mid zoom in')
  assert(Math.abs(midZoom.focusX - 0.5) < 0.01, 'focus x center')

  const hold = getZoomTransformAtTime(350, segments)
  assert(Math.abs(hold.scale - 2) < 0.01, 'hold at peak')

  const idle = getZoomTransformAtTime(50, segments)
  assert(idle.scale === 1, 'idle before first click')
  console.log('ok segments')
}

/** Retina: cursor DIP must not be divided by physical video width. */
function testRetinaMapping(): void {
  const geometry: CaptureGeometry = {
    originX: 0,
    originY: 0,
    widthDip: 1440,
    heightDip: 900,
    scaleFactor: 2,
  }
  const videoSize = { width: 2880, height: 1800 }

  // Click at display center in DIP
  const norm = mapScreenToNormalized(720, 450, geometry)
  assert(Math.abs(norm.focusX - 0.5) < 1e-9, 'retina center focusX')
  assert(Math.abs(norm.focusY - 0.5) < 1e-9, 'retina center focusY')

  const px = mapScreenToVideoPixels(720, 450, geometry, videoSize)
  assert(Math.abs(px.x - 1440) < 1e-6, 'retina center pixel x')
  assert(Math.abs(px.y - 900) < 1e-6, 'retina center pixel y')

  // Legacy bug: 720/2880 = 0.25 — geometry path must NOT do that
  const segments = buildZoomSegments(
    [{ t: 0, x: 720, y: 450, kind: 'click', button: 0 }],
    videoSize,
    { geometry, mergeWindowMs: 0, retargetActive: false },
  )
  assert(segments.length === 1, 'one retina segment')
  assert(Math.abs(segments[0]!.focusX - 0.5) < 0.01, 'retina segment focusX')
  assert(Math.abs(segments[0]!.focusY - 0.5) < 0.01, 'retina segment focusY')

  // Multi-monitor: secondary display origin offset
  const secondary: CaptureGeometry = {
    originX: 1440,
    originY: 0,
    widthDip: 1920,
    heightDip: 1080,
    scaleFactor: 1,
  }
  const secNorm = mapScreenToNormalized(1440 + 960, 540, secondary)
  assert(Math.abs(secNorm.focusX - 0.5) < 1e-9, 'secondary center x')
  assert(Math.abs(secNorm.focusY - 0.5) < 1e-9, 'secondary center y')
  console.log('ok retina mapping')
}

/** Rapid clicks merge / retarget instead of queueing jitter hops. */
function testAntiJitter(): void {
  const videoSize = { width: 1920, height: 1080 }
  const events: CursorEvent[] = [
    { t: 100, x: 100, y: 100, kind: 'click', button: 0 },
    { t: 180, x: 400, y: 300, kind: 'click', button: 0 }, // within merge window
    { t: 250, x: 900, y: 500, kind: 'click', button: 0 }, // still merge
  ]
  const merged = buildZoomSegments(events, videoSize, {
    peakScale: 2,
    zoomInMs: 200,
    holdMs: 800,
    zoomOutMs: 200,
    mergeWindowMs: 320,
    retargetActive: true,
  })
  assert(merged.length === 1, 'merged rapid clicks → 1 segment')
  assert(Math.abs(merged[0]!.focusX - 900 / 1920) < 0.01, 'latest focus wins')
  assert(Math.abs(merged[0]!.focusY - 500 / 1080) < 0.01, 'latest focus y')

  // Retarget during hold (outside merge window but inside hold)
  const retargetEvents: CursorEvent[] = [
    { t: 0, x: 100, y: 100, kind: 'click', button: 0 },
    { t: 500, x: 960, y: 540, kind: 'click', button: 0 }, // during hold of first
  ]
  const retargeted = buildZoomSegments(retargetEvents, videoSize, {
    peakScale: 2,
    zoomInMs: 200,
    holdMs: 800,
    zoomOutMs: 200,
    mergeWindowMs: 100,
    retargetActive: true,
  })
  assert(retargeted.length === 1, 'retarget keeps one segment')
  assert(Math.abs(retargeted[0]!.focusX - 0.5) < 0.01, 'retarget focus center')
  console.log('ok anti-jitter')
}

testEase()
testParseJsonl()
testZoomSegments()
testRetinaMapping()
testAntiJitter()
console.log('smoke:autozoom ok')
