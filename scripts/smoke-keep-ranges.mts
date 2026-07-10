/**
 * Smoke checks for multi-segment keep-ranges (FOKUS 5).
 * Uses dist-electron build (same as smoke:timeline-cut).
 */
import {
  MIN_KEEP_MS,
  applyTrimToKeepRanges,
  canSplitKeepRangesAtPlayhead,
  cutGapInKeepRanges,
  defaultKeepRanges,
  deleteKeepRangeAtPlayhead,
  findKeepRangeIndex,
  mergeAdjacentKeepRanges,
  normalizeKeepRanges,
  outerTrimFromKeepRanges,
  splitKeepRangesAtPlayhead,
  totalKeepDurationMs,
} from '../dist-electron/shared/keepRanges.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const FULL = 10_000

function testDefault(): void {
  const ranges = defaultKeepRanges(FULL)
  assert(ranges.length === 1, 'one range')
  assert(ranges[0]!.startMs === 0 && ranges[0]!.endMs === FULL, 'full clip')
  assert(totalKeepDurationMs(ranges) === FULL, 'total duration')
  console.log('ok default')
}

function testSplitAdjacent(): void {
  const base = defaultKeepRanges(FULL)
  assert(canSplitKeepRangesAtPlayhead(base, 4000, FULL), 'can split mid')
  const split = splitKeepRangesAtPlayhead(base, 4000, FULL)
  assert(split != null && split.length === 2, 'two ranges')
  assert(split![0]!.endMs === 4000, 'left end')
  assert(split![1]!.startMs === 4000, 'right start')
  // Touching ranges must NOT collapse in normalize (edit points).
  const norm = normalizeKeepRanges(split!, FULL)
  assert(norm.length === 2, 'normalize keeps razor edit point')
  // Export merge collapses touching → single encode.
  const merged = mergeAdjacentKeepRanges(split!, FULL)
  assert(merged.length === 1, 'export merges touching')
  assert(totalKeepDurationMs(merged) === FULL, 'merged duration')
  console.log('ok split adjacent')
}

function testCutGapConcat(): void {
  const base = defaultKeepRanges(FULL)
  const gapped = cutGapInKeepRanges(base, 3000, 6000, FULL)
  assert(gapped != null && gapped.length === 2, 'gap → two ranges')
  assert(gapped![0]!.endMs === 3000, 'left ends at gap')
  assert(gapped![1]!.startMs === 6000, 'right starts after gap')
  assert(totalKeepDurationMs(gapped!) === 7000, 'kept 7s')
  const merged = mergeAdjacentKeepRanges(gapped!, FULL)
  assert(merged.length === 2, 'export keeps real gap')
  const outer = outerTrimFromKeepRanges(gapped!)
  assert(outer.startMs === 0 && outer.endMs === FULL, 'outer envelope')
  console.log('ok cut gap')
}

function testDeleteSegment(): void {
  const gapped = cutGapInKeepRanges(defaultKeepRanges(FULL), 2000, 5000, FULL)!
  assert(gapped.length === 2, 'setup two')
  assert(findKeepRangeIndex(gapped, 1000) === 0, 'in first')
  assert(findKeepRangeIndex(gapped, 7000) === 1, 'in second')
  const delFirst = deleteKeepRangeAtPlayhead(gapped, 1000, FULL)
  assert(delFirst != null && delFirst.length === 1, 'delete first')
  assert(delFirst![0]!.startMs === 5000, 'remaining is second')
  assert(deleteKeepRangeAtPlayhead(delFirst!, 6000, FULL) == null, 'cannot delete last')
  console.log('ok delete segment')
}

function testApplyTrim(): void {
  const one = applyTrimToKeepRanges(defaultKeepRanges(FULL), { startMs: 500, endMs: 8000 }, FULL)
  assert(one.length === 1 && one[0]!.startMs === 500, 'single replace')
  const gapped = cutGapInKeepRanges(defaultKeepRanges(FULL), 3000, 6000, FULL)!
  const edged = applyTrimToKeepRanges(gapped, { startMs: 200, endMs: 9500 }, FULL)
  assert(edged.length === 2, 'multi keeps gap')
  assert(edged[0]!.startMs === 200, 'first edge')
  assert(edged[1]!.endMs === 9500, 'last edge')
  assert(MIN_KEEP_MS === 100, 'min keep')
  console.log('ok apply trim')
}

function testSplitTooClose(): void {
  assert(!canSplitKeepRangesAtPlayhead(defaultKeepRanges(FULL), 40, FULL), 'near start')
  assert(splitKeepRangesAtPlayhead(defaultKeepRanges(FULL), 40, FULL) == null, 'null split')
  console.log('ok split too close')
}

testDefault()
testSplitAdjacent()
testCutGapConcat()
testDeleteSegment()
testApplyTrim()
testSplitTooClose()
console.log('smoke-keep-ranges: all ok')
