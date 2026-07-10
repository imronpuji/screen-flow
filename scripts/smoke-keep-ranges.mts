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
  deleteKeepRangeWithRipple,
  discardedKeepWindows,
  findKeepRangeIndex,
  isInsideKeepRange,
  mergeAdjacentKeepRanges,
  normalizeKeepRanges,
  outerTrimFromKeepRanges,
  resolveKeepPlaybackMs,
  snapPlayheadIntoKeepRanges,
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

function testRippleDelete(): void {
  const split = splitKeepRangesAtPlayhead(defaultKeepRanges(FULL), 4000, FULL)!
  const triple = splitKeepRangesAtPlayhead(split, 6000, FULL)!
  assert(triple != null && triple.length === 3, 'three razor segments')
  const noRipple = deleteKeepRangeWithRipple(triple, 5000, FULL, false)
  assert(noRipple != null && noRipple.ranges.length === 2, 'non-ripple keeps edit points')
  assert(noRipple!.ranges[0]!.endMs === 4000, 'left intact')
  assert(noRipple!.ranges[1]!.startMs === 6000, 'right intact')
  const rippleFirst = deleteKeepRangeWithRipple(triple, 2000, FULL, true)
  assert(rippleFirst != null && rippleFirst.ranges.length === 1, 'ripple merges survivors')
  assert(rippleFirst!.ranges[0]!.startMs === 4000, 'ripple from first delete')
  assert(rippleFirst!.ranges[0]!.endMs === FULL, 'ripple to end')
  assert(rippleFirst!.playheadMs === 4000, 'ripple playhead snap')
  const rippleLast = deleteKeepRangeWithRipple(triple, 8000, FULL, true)
  assert(rippleLast != null && rippleLast.ranges.length === 1, 'ripple delete last')
  assert(rippleLast!.ranges[0]!.endMs === 6000, 'ripple trims end')
  console.log('ok ripple delete')
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
testRippleDelete()
testApplyTrim()
testSplitTooClose()
testGapSkipPlayback()
console.log('smoke-keep-ranges: all ok')

function testGapSkipPlayback(): void {
  const gapped = cutGapInKeepRanges(defaultKeepRanges(FULL), 3000, 6000, FULL)!
  assert(gapped.length === 2, 'setup gapped')

  const inside = resolveKeepPlaybackMs(gapped, 1500, FULL)
  assert(inside.ms === 1500 && !inside.shouldPause, 'inside keep stays')

  const atEndFirst = resolveKeepPlaybackMs(gapped, 3000, FULL)
  assert(atEndFirst.ms === 6000 && !atEndFirst.shouldPause, 'end of first → next start')

  const inGap = resolveKeepPlaybackMs(gapped, 4500, FULL)
  assert(inGap.ms === 6000 && !inGap.shouldPause, 'gap → next start')

  const atLastEnd = resolveKeepPlaybackMs(gapped, FULL, FULL)
  assert(atLastEnd.ms === FULL && atLastEnd.shouldPause, 'last end pauses')

  const before = resolveKeepPlaybackMs(gapped, 0, FULL)
  assert(before.ms === 0 && !before.shouldPause, 'at first start')

  const trimmed = normalizeKeepRanges(
    [
      { startMs: 500, endMs: 2000 },
      { startMs: 7000, endMs: 9000 },
    ],
    FULL,
  )
  assert(snapPlayheadIntoKeepRanges(trimmed, 4000, FULL) === 7000, 'snap gap → next')
  assert(snapPlayheadIntoKeepRanges(trimmed, 100, FULL) === 500, 'snap before → first')
  assert(snapPlayheadIntoKeepRanges(trimmed, 9500, FULL) === 9000, 'snap after → last end')
  assert(isInsideKeepRange(trimmed, 1000), 'inside true')
  assert(!isInsideKeepRange(trimmed, 4000), 'gap false')

  const gaps = discardedKeepWindows(trimmed, FULL)
  assert(gaps.length === 3, 'lead + mid + trail gaps')
  assert(gaps[0]!.startMs === 0 && gaps[0]!.endMs === 500, 'lead')
  assert(gaps[1]!.startMs === 2000 && gaps[1]!.endMs === 7000, 'mid')
  assert(gaps[2]!.startMs === 9000 && gaps[2]!.endMs === FULL, 'trail')
  console.log('ok gap-skip playback')
}
