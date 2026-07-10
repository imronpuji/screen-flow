/**
 * Smoke checks for magnetic timeline snap (FOKUS 5).
 * Uses dist-electron build (same as smoke:keep-ranges).
 */
import {
  DEFAULT_TIMELINE_PREFS,
  TIMELINE_PREFS_STORAGE_KEY,
  loadTimelinePrefs,
  normalizeTimelinePrefs,
  saveTimelinePrefs,
} from '../dist-electron/shared/timelinePrefs.js'
import {
  DEFAULT_MAGNETIC_SNAP_THRESHOLD_MS,
  collectTimelineSnapTargets,
  dedupeTimelineSnapTargets,
  magneticSnapThresholdMs,
  snapKeepEdgeMagnetically,
  snapPlayheadMagnetically,
} from '../dist-electron/shared/timelineSnap.js'
import type { TimelineMarker } from '../dist-electron/shared/timelineMarkers.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

function testThreshold(): void {
  assert(
    magneticSnapThresholdMs(0) === DEFAULT_MAGNETIC_SNAP_THRESHOLD_MS,
    'unknown duration → default',
  )
  assert(magneticSnapThresholdMs(5_000) === 80, 'short clip floors at 80')
  assert(magneticSnapThresholdMs(10_000) === 120, '10s → 120')
  assert(magneticSnapThresholdMs(30_000) === 250, 'long clip caps at 250')
  console.log('ok threshold')
}

function testCollectAndSnap(): void {
  const markers: TimelineMarker[] = [
    {
      id: 'z1',
      kind: 'zoom',
      tMs: 2500,
      startMs: 2000,
      endMs: 3000,
      label: 'Zoom',
    },
    { id: 'c1', kind: 'click', tMs: 4100, label: 'Click' },
    {
      id: 'cam1',
      kind: 'camera',
      tMs: 1000,
      startMs: 1000,
      endMs: 5000,
      label: 'Camera',
      rangeIndex: 0,
    },
  ]
  const targets = collectTimelineSnapTargets({
    durationMs: 10_000,
    trimStartMs: 500,
    trimEndMs: 9000,
    keepRanges: [
      { startMs: 0, endMs: 4000 },
      { startMs: 6000, endMs: 10_000 },
    ],
    markers,
  })
  assert(targets.some((t) => t.tMs === 0), 'clip start (0)')
  assert(targets.some((t) => t.tMs === 10_000), 'clip end')
  assert(targets.some((t) => t.tMs === 500 && t.kind === 'trim-in'), 'trim in')
  assert(targets.some((t) => t.tMs === 4000), 'keep edge / razor at 4000')
  assert(targets.some((t) => t.tMs === 2500 && t.kind === 'zoom'), 'zoom peak')
  assert(targets.some((t) => t.tMs === 4100 && t.kind === 'click'), 'click')
  assert(targets.some((t) => t.tMs === 1000), 'camera edge')

  const near = snapPlayheadMagnetically(4080, targets, 120)
  assert(near.snapped && near.ms === 4100, 'snap to click at 4100')
  assert(near.target?.kind === 'click', 'click kind')

  const far = snapPlayheadMagnetically(4500, targets, 120)
  assert(!far.snapped && far.ms === 4500, 'no snap when far')

  const keep = snapPlayheadMagnetically(3920, targets, 120)
  assert(keep.snapped && keep.ms === 4000, 'snap to keep edge')

  // Tie-break: earlier target wins at equal distance.
  const tied = snapPlayheadMagnetically(
    100,
    [
      { tMs: 50, kind: 'click', id: 'a' },
      { tMs: 150, kind: 'click', id: 'b' },
    ],
    100,
  )
  assert(tied.ms === 50, 'earlier target on tie')
  console.log('ok collect+snap', targets.length)
}

function testDedupe(): void {
  const deduped = dedupeTimelineSnapTargets([
    { tMs: 1000, kind: 'keep-edge', id: 'a' },
    { tMs: 1000.4, kind: 'zoom', id: 'b' },
    { tMs: 2000, kind: 'click', id: 'c' },
  ])
  assert(deduped.length === 2, 'dedupe within 1ms')
  assert(deduped[0]!.kind === 'keep-edge', 'keep first kind')
  console.log('ok dedupe')
}

function testKeepEdgeSnap(): void {
  const targets = collectTimelineSnapTargets({
    durationMs: 10_000,
    keepRanges: [
      { startMs: 0, endMs: 4000 },
      { startMs: 6000, endMs: 10_000 },
    ],
    markers: [{ id: 'c1', kind: 'click', tMs: 2500, label: 'Click' }],
  })
  // Dragging keep-0-end near 2500 should snap to click, not stick to itself.
  const nearClick = snapKeepEdgeMagnetically(2480, targets, ['keep-0-end'], 120)
  assert(nearClick.snapped && nearClick.ms === 2500, 'edge snaps to click')

  // Near own edge id excluded → no self-stick at 4000 when proposing 4000±ε
  // with only that target nearby after exclude… use a lone target case:
  const selfOnly = snapKeepEdgeMagnetically(
    4010,
    [{ tMs: 4000, kind: 'keep-edge', id: 'keep-0-end' }],
    ['keep-0-end'],
    120,
  )
  assert(!selfOnly.snapped && selfOnly.ms === 4010, 'excludes self edge')

  const toNeighbor = snapKeepEdgeMagnetically(5920, targets, ['keep-0-end'], 120)
  assert(toNeighbor.snapped && toNeighbor.ms === 6000, 'snap to neighbor start')
  console.log('ok keep-edge snap')
}

function testPrefs(): void {
  assert(DEFAULT_TIMELINE_PREFS.magneticSnapEnabled === true, 'default on')
  assert(
    normalizeTimelinePrefs({ rippleDeleteEnabled: true }).magneticSnapEnabled ===
      true,
    'legacy missing key → on',
  )
  assert(
    normalizeTimelinePrefs({ magneticSnapEnabled: false }).magneticSnapEnabled ===
      false,
    'explicit off',
  )

  const storage = memoryStorage()
  saveTimelinePrefs(
    {
      rippleDeleteEnabled: true,
      magneticSnapEnabled: false,
      timelineZoom: 1,
    },
    storage,
  )
  const loaded = loadTimelinePrefs(storage)
  assert(loaded.rippleDeleteEnabled === true, 'ripple persisted')
  assert(loaded.magneticSnapEnabled === false, 'magnetic off persisted')
  assert(loaded.timelineZoom === 1, 'zoom default persisted')
  assert(
    storage.getItem(TIMELINE_PREFS_STORAGE_KEY)?.includes('magneticSnapEnabled'),
    'key written',
  )

  // Empty storage → defaults.
  const fresh = loadTimelinePrefs(memoryStorage())
  assert(fresh.magneticSnapEnabled === true, 'fresh → on')
  assert(fresh.rippleDeleteEnabled === false, 'fresh ripple off')
  assert(fresh.timelineZoom === 1, 'fresh zoom 1×')
  console.log('ok prefs')
}

function main(): void {
  testThreshold()
  testCollectAndSnap()
  testDedupe()
  testKeepEdgeSnap()
  testPrefs()
  console.log('smoke:timeline-snap ok')
}

main()
