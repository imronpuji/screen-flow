/**
 * Smoke checks for cursor event JSONL helpers (no Electron / no uIOhook).
 */
import {
  parseCursorEventLine,
  serializeCursorEvent,
  shouldSampleMove,
} from '../electron/recording/cursorEvents.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testSerializeRoundTrip(): void {
  const event = { t: 120, x: 640, y: 360, kind: 'click' as const, button: 0 as const }
  const line = serializeCursorEvent(event)
  assert(line.endsWith('\n'), 'newline terminated')
  const parsed = parseCursorEventLine(line)
  assert(parsed?.kind === 'click' && parsed.x === 640, 'round trip')
  console.log('ok serialize')
}

function testMoveThrottle(): void {
  const state = { lastT: 0, lastX: 0, lastY: 0 }
  assert(shouldSampleMove(state, { t: 20, x: 0, y: 0 }), 'interval elapsed')
  const state2 = { lastT: 0, lastX: 0, lastY: 0 }
  assert(!shouldSampleMove(state2, { t: 5, x: 1, y: 0 }), 'small move too soon')
  assert(shouldSampleMove(state2, { t: 5, x: 4, y: 0 }), 'large move allowed')
  console.log('ok move throttle')
}

testSerializeRoundTrip()
testMoveThrottle()
console.log('smoke:cursor-events ok')
