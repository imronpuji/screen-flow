/**
 * Smoke checks for review edit undo/redo history (no Electron / DOM).
 */
import {
  EDIT_HISTORY_COALESCE_MS,
  EDIT_HISTORY_LIMIT,
  canRedo,
  canUndo,
  createEditHistory,
  pushEdit,
  redoEdit,
  undoEdit,
} from '../shared/editHistory.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testCreate(): void {
  const h = createEditHistory({ n: 0 })
  assert(h.present.n === 0, 'present')
  assert(!canUndo(h), 'no undo')
  assert(!canRedo(h), 'no redo')
  console.log('ok create')
}

function testPushUndoRedo(): void {
  let h = createEditHistory({ n: 0 }, 1000)
  h = pushEdit(h, { n: 1 }, { now: 2000, coalesceMs: 0 })
  h = pushEdit(h, { n: 2 }, { now: 3000, coalesceMs: 0 })
  assert(h.present.n === 2, 'present 2')
  assert(canUndo(h), 'can undo')
  h = undoEdit(h, 4000)
  assert(h.present.n === 1, 'undo → 1')
  h = undoEdit(h, 5000)
  assert(h.present.n === 0, 'undo → 0')
  assert(!canUndo(h), 'exhausted undo')
  assert(canRedo(h), 'can redo')
  h = redoEdit(h, 6000)
  assert(h.present.n === 1, 'redo → 1')
  h = redoEdit(h, 7000)
  assert(h.present.n === 2, 'redo → 2')
  assert(!canRedo(h), 'exhausted redo')
  console.log('ok push/undo/redo')
}

function testCoalesce(): void {
  let h = createEditHistory({ n: 0 }, 0)
  h = pushEdit(h, { n: 1 }, { now: 1000, coalesceMs: EDIT_HISTORY_COALESCE_MS })
  // Rapid slider ticks within coalesce window → one undo step.
  h = pushEdit(h, { n: 2 }, { now: 1100, coalesceMs: EDIT_HISTORY_COALESCE_MS })
  h = pushEdit(h, { n: 3 }, { now: 1200, coalesceMs: EDIT_HISTORY_COALESCE_MS })
  assert(h.present.n === 3, 'coalesced present')
  assert(h.past.length === 1, `one past entry, got ${h.past.length}`)
  assert(h.past[0]!.n === 0, 'past is initial')
  h = undoEdit(h, 2000)
  assert(h.present.n === 0, 'undo skips coalesced middle')
  console.log('ok coalesce')
}

function testPushClearsFuture(): void {
  let h = createEditHistory({ n: 0 }, 0)
  h = pushEdit(h, { n: 1 }, { now: 1000, coalesceMs: 0 })
  h = pushEdit(h, { n: 2 }, { now: 2000, coalesceMs: 0 })
  h = undoEdit(h, 3000)
  assert(canRedo(h), 'redo available')
  h = pushEdit(h, { n: 9 }, { now: 4000, coalesceMs: 0 })
  assert(!canRedo(h), 'branch clears future')
  assert(h.present.n === 9, 'new present')
  console.log('ok clear future')
}

function testLimit(): void {
  let h = createEditHistory({ n: 0 }, 0)
  for (let i = 1; i <= EDIT_HISTORY_LIMIT + 10; i++) {
    h = pushEdit(h, { n: i }, { now: i * 1000, coalesceMs: 0 })
  }
  assert(h.past.length === EDIT_HISTORY_LIMIT, `cap at ${EDIT_HISTORY_LIMIT}`)
  assert(h.present.n === EDIT_HISTORY_LIMIT + 10, 'latest present')
  console.log('ok limit')
}

function testSameRefNoop(): void {
  const present = { n: 1 }
  let h = createEditHistory(present, 0)
  h = pushEdit(h, present, { now: 1000, coalesceMs: 0 })
  assert(h.past.length === 0, 'same ref skipped')
  console.log('ok same ref')
}

testCreate()
testPushUndoRedo()
testCoalesce()
testPushClearsFuture()
testLimit()
testSameRefNoop()
console.log('smoke-edit-history: all ok')
