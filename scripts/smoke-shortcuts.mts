/**
 * Smoke checks for keyboard shortcut matcher (no DOM / Electron).
 */
import {
  SCRUB_STEP_MS,
  SCRUB_STEP_SHIFT_MS,
  SHORTCUTS,
  isEditableTarget,
  matchShortcut,
  scrubDeltaMs,
  shortcutsForContext,
} from '../shared/shortcuts.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testCatalog(): void {
  assert(SHORTCUTS.length >= 6, 'catalog has core bindings')
  assert(shortcutsForContext('setup').some((s) => s.id === 'toggle-record'), 'setup has record')
  assert(shortcutsForContext('review').some((s) => s.id === 'toggle-play'), 'review has play')
  assert(shortcutsForContext('exporting').some((s) => s.id === 'cancel-export'), 'exporting has cancel')
  console.log('ok catalog')
}

function testMatchSetupRecording(): void {
  assert(matchShortcut({ key: 'r' }, 'setup') === 'toggle-record', 'r starts')
  assert(matchShortcut({ key: 'R' }, 'setup') === 'toggle-record', 'R starts')
  assert(matchShortcut({ key: ' ' }, 'setup') === 'toggle-record', 'space starts')
  assert(matchShortcut({ key: ' ', code: 'Space' }, 'recording') === 'toggle-record', 'space stops')
  assert(matchShortcut({ key: 'Escape' }, 'recording') === 'toggle-record', 'esc stops')
  assert(matchShortcut({ key: 'Escape' }, 'setup') === null, 'esc ignored in setup')
  assert(matchShortcut({ key: 'e' }, 'setup') === null, 'e ignored in setup')
  assert(matchShortcut({ key: 'r', metaKey: true }, 'setup') === null, 'meta+r ignored')
  console.log('ok setup/recording')
}

function testMatchReview(): void {
  assert(matchShortcut({ key: ' ' }, 'review') === 'toggle-play', 'space play')
  assert(matchShortcut({ key: 'e' }, 'review') === 'export', 'e export')
  assert(matchShortcut({ key: 'b' }, 'review') === 'beautify', 'b beautify')
  assert(matchShortcut({ key: 'ArrowLeft' }, 'review') === 'scrub-back', 'left scrub')
  assert(matchShortcut({ key: 'ArrowRight' }, 'review') === 'scrub-forward', 'right scrub')
  assert(matchShortcut({ key: 'Escape' }, 'review') === 'discard', 'esc discard')
  assert(matchShortcut({ key: 'Escape' }, 'exporting') === 'cancel-export', 'esc cancel export')
  assert(matchShortcut({ key: 'e' }, 'exporting') === null, 'e ignored while exporting')
  console.log('ok review/exporting')
}

function testScrubDelta(): void {
  assert(scrubDeltaMs(false) === SCRUB_STEP_MS, '1s step')
  assert(scrubDeltaMs(true) === SCRUB_STEP_SHIFT_MS, '5s shift step')
  console.log('ok scrub delta')
}

function testEditableTarget(): void {
  // Node smoke has no DOM Element — null / plain object should be safe.
  assert(isEditableTarget(null) === false, 'null not editable')
  console.log('ok editable target')
}

testCatalog()
testMatchSetupRecording()
testMatchReview()
testScrubDelta()
testEditableTarget()
console.log('smoke-shortcuts: all ok')
