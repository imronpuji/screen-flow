/**
 * Smoke checks for auto-zoom keyframe engine (no Electron).
 */
import type { CursorEvent } from '../shared/cursor.ts'
import {
  buildZoomSegments,
  easeCubicInOut,
  getZoomTransformAtTime,
  parseCursorJsonl,
} from '../shared/autozoom.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testEase(): void {
  assert(easeCubicInOut(0) === 0, 'ease 0')
  assert(easeCubicInOut(1) === 1, 'ease 1')
  assert(easeCubicInOut(0.5) > 0.4 && easeCubicInOut(0.5) < 0.6, 'ease mid')
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

testEase()
testParseJsonl()
testZoomSegments()
console.log('smoke:autozoom ok')
