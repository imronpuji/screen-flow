/**
 * Smoke checks for playhead trim / cut helpers (FOKUS 5).
 * Uses dist-electron build (same as smoke:beautify / smoke:export-trim).
 */
import {
  MIN_CLIP_MS,
  canSplitAtPlayhead,
  cutAfterPlayhead,
  cutBeforePlayhead,
  markInAtPlayhead,
  markOutAtPlayhead,
  splitTrimAtPlayhead,
} from '../dist-electron/shared/timelineCut.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const FULL = 10_000
const TRIM = { startMs: 0, endMs: FULL }

function testMarkInOut(): void {
  const inn = markInAtPlayhead(TRIM, 2500, FULL)
  assert(inn.startMs === 2500, 'mark in start')
  assert(inn.endMs === FULL, 'mark in keeps end')

  const out = markOutAtPlayhead(TRIM, 7000, FULL)
  assert(out.startMs === 0, 'mark out keeps start')
  assert(out.endMs === 7000, 'mark out end')

  const both = markOutAtPlayhead(inn, 6000, FULL)
  assert(both.startMs === 2500 && both.endMs === 6000, 'in then out')
  console.log('ok mark in/out')
}

function testCutAliases(): void {
  const after = cutAfterPlayhead(TRIM, 4000, FULL)
  assert(after.endMs === 4000 && after.startMs === 0, 'cut after = keep before')
  const before = cutBeforePlayhead(TRIM, 4000, FULL)
  assert(before.startMs === 4000 && before.endMs === FULL, 'cut before = keep after')
  console.log('ok cut before/after')
}

function testSplit(): void {
  assert(canSplitAtPlayhead(TRIM, 5000, FULL), 'mid can split')
  assert(!canSplitAtPlayhead(TRIM, 50, FULL), 'near start cannot split')
  assert(!canSplitAtPlayhead(TRIM, FULL - 50, FULL), 'near end cannot split')

  const parts = splitTrimAtPlayhead(TRIM, 5000, FULL)
  assert(parts != null, 'split returns parts')
  assert(parts!.left.endMs === 5000, 'left ends at playhead')
  assert(parts!.right.startMs === 5000, 'right starts at playhead')
  assert(parts!.left.endMs - parts!.left.startMs >= MIN_CLIP_MS, 'left min')
  assert(parts!.right.endMs - parts!.right.startMs >= MIN_CLIP_MS, 'right min')

  assert(splitTrimAtPlayhead(TRIM, 40, FULL) == null, 'too close → null')
  console.log('ok split')
}

function testClamp(): void {
  const over = markInAtPlayhead(TRIM, 20_000, FULL)
  assert(over.startMs + MIN_CLIP_MS <= over.endMs, 'overshoot still valid window')
  const under = markOutAtPlayhead(TRIM, -100, FULL)
  assert(under.endMs >= under.startMs + MIN_CLIP_MS, 'undershoot still valid')
  console.log('ok clamp')
}

testMarkInOut()
testCutAliases()
testSplit()
testClamp()
console.log('smoke-timeline-cut: all ok')
