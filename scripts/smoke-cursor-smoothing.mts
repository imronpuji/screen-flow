/**
 * Smoke checks for cursor smoothing + click ring + auto-highlight engine (no Electron).
 */
import type { CursorEvent } from '../shared/cursor.ts'
import {
  buildClickRings,
  buildCursorKeyframes,
  getActiveClickHighlights,
  getActiveClickRings,
  getSmoothedCursorAtTime,
} from '../dist-electron/shared/cursorSmoothing.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testKeyframes(): void {
  const events: CursorEvent[] = [
    { t: 0, x: 0, y: 0, kind: 'move' },
    { t: 100, x: 100, y: 100, kind: 'move' },
    { t: 200, x: 200, y: 200, kind: 'click', button: 0 },
  ]
  const keyframes = buildCursorKeyframes(events)
  assert(keyframes.length === 3, 'three keyframes')
  assert(keyframes[2]!.x === 200, 'click position included')
  console.log('ok keyframes')
}

function testSmoothing(): void {
  const events: CursorEvent[] = [
    { t: 0, x: 0, y: 0, kind: 'move' },
    { t: 100, x: 100, y: 0, kind: 'move' },
    { t: 200, x: 200, y: 0, kind: 'move' },
  ]
  const keyframes = buildCursorKeyframes(events)
  const videoSize = { width: 200, height: 100 }
  const mid = getSmoothedCursorAtTime(100, keyframes, videoSize)
  assert(mid !== null, 'mid position exists')
  assert(mid.x > 0.4 && mid.x < 0.6, 'mid x near center')
  assert(Math.abs(mid.y) < 0.05, 'y near top')
  console.log('ok smoothing')
}

function testClickRings(): void {
  const events: CursorEvent[] = [
    { t: 500, x: 960, y: 540, kind: 'click', button: 0 },
  ]
  const videoSize = { width: 1920, height: 1080 }
  const rings = buildClickRings(events, videoSize)
  assert(rings.length === 1, 'one ring trigger')
  assert(Math.abs(rings[0]!.x - 0.5) < 0.01, 'center x')

  const activeStart = getActiveClickRings(500, rings)
  assert(activeStart.length === 1, 'ring active at click')
  assert(activeStart[0]!.opacity > 0.9, 'ring visible at start')

  const activeMid = getActiveClickRings(700, rings)
  assert(activeMid.length === 1, 'ring still animating')
  assert(activeMid[0]!.scale > activeStart[0]!.scale, 'ring expands')

  const done = getActiveClickRings(1000, rings)
  assert(done.length === 0, 'ring finished')
  console.log('ok click rings')
}

function testClickHighlights(): void {
  const events: CursorEvent[] = [
    { t: 500, x: 960, y: 540, kind: 'click', button: 0 },
  ]
  const videoSize = { width: 1920, height: 1080 }
  const rings = buildClickRings(events, videoSize)

  const start = getActiveClickHighlights(500, rings)
  assert(start.length === 1, 'highlight active at click')
  assert(start[0]!.opacity > 0.4, 'highlight soft but visible at start')

  const mid = getActiveClickHighlights(750, rings)
  assert(mid.length === 1, 'highlight still pulsing')
  assert(mid[0]!.scale > start[0]!.scale, 'highlight expands')

  // Longer than ring (450ms) — still alive at t=1000.
  const late = getActiveClickHighlights(1000, rings)
  assert(late.length === 1, 'highlight outlives outline ring')

  const done = getActiveClickHighlights(1300, rings)
  assert(done.length === 0, 'highlight finished (~700ms)')
  console.log('ok click highlights')
}

testKeyframes()
testSmoothing()
testClickRings()
testClickHighlights()
console.log('smoke:cursor-smoothing ok')
