/**
 * Smoke checks for timeline zoom viewport (FOKUS 5).
 * Uses dist-electron build (same as smoke:timeline-snap).
 */
import {
  DEFAULT_TIMELINE_PREFS,
  TIMELINE_PREFS_STORAGE_KEY,
  loadTimelinePrefs,
  normalizeTimelinePrefs,
  saveTimelinePrefs,
} from '../dist-electron/shared/timelinePrefs.js'
import {
  TIMELINE_ZOOM_MAX,
  TIMELINE_ZOOM_MIN,
  TIMELINE_ZOOM_STEPS,
  clampTimelineZoom,
  clientXToTimelineMs,
  followPlayheadInViewport,
  formatTimelineZoom,
  normalizeTimelineZoom,
  panTimelineViewport,
  resolveTimelineViewport,
  stepTimelineZoom,
  viewportPercent,
  viewportSpanPercent,
  visibleDurationMs,
} from '../dist-electron/shared/timelineZoom.js'

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

function testClampAndSteps(): void {
  assert(clampTimelineZoom(0) === TIMELINE_ZOOM_MIN, 'floor at 1')
  assert(clampTimelineZoom(99) === TIMELINE_ZOOM_MAX, 'cap at 8')
  assert(clampTimelineZoom(Number.NaN) === TIMELINE_ZOOM_MIN, 'NaN → 1')
  assert(normalizeTimelineZoom(2.2) === 2, '2.2 → 2')
  assert(normalizeTimelineZoom(2.7) === 3, '2.7 → 3')
  assert(stepTimelineZoom(1, 1) === 1.5, '1 → 1.5')
  assert(stepTimelineZoom(8, 1) === 8, 'max stays')
  assert(stepTimelineZoom(1.5, -1) === 1, '1.5 → 1')
  assert(stepTimelineZoom(1, -1) === 1, 'min stays')
  assert(formatTimelineZoom(2) === '2×', 'format 2×')
  assert(formatTimelineZoom(1.5) === '1.5×', 'format 1.5×')
  assert(TIMELINE_ZOOM_STEPS[0] === 1, 'steps start at 1')
  assert(TIMELINE_ZOOM_STEPS[TIMELINE_ZOOM_STEPS.length - 1] === 8, 'steps end at 8')
  console.log('ok clamp/steps')
}

function testViewport(): void {
  const full = resolveTimelineViewport(10_000, 1, 5000)
  assert(full.startMs === 0 && full.endMs === 10_000, '1× = full clip')
  assert(visibleDurationMs(10_000, 2) === 5_000, '2× → half')

  const mid = resolveTimelineViewport(10_000, 2, 5_000)
  assert(Math.abs(mid.startMs - 2_500) < 0.01, '2× mid start ~2500')
  assert(Math.abs(mid.endMs - 7_500) < 0.01, '2× mid end ~7500')

  const nearStart = resolveTimelineViewport(10_000, 2, 100)
  assert(nearStart.startMs === 0, 'clamp start at 0')
  assert(Math.abs(nearStart.endMs - 5_000) < 0.01, 'window length kept')

  const nearEnd = resolveTimelineViewport(10_000, 2, 9_900)
  assert(Math.abs(nearEnd.startMs - 5_000) < 0.01, 'clamp end')
  assert(nearEnd.endMs === 10_000, 'end at duration')

  assert(viewportPercent(5_000, mid) === 50, 'mid → 50%')
  assert(viewportPercent(2_500, mid) === 0, 'left edge')
  assert(viewportPercent(7_500, mid) === 100, 'right edge')

  const span = viewportSpanPercent(3_000, 4_000, mid)
  assert(span != null, 'span inside')
  assert(Math.abs(span!.left - 10) < 0.01, 'span left 10%')
  assert(Math.abs(span!.width - 20) < 0.01, 'span width 20%')

  assert(viewportSpanPercent(0, 100, mid) === null, 'fully left → null')
  assert(viewportSpanPercent(9_000, 10_000, mid) === null, 'fully right → null')

  const ms = clientXToTimelineMs(50, 0, 100, mid)
  assert(Math.abs(ms - 5_000) < 0.01, 'clientX mid → 5000')
  console.log('ok viewport')
}

function testFollowAndPan(): void {
  const vp = { startMs: 2_500, endMs: 7_500 }
  const same = followPlayheadInViewport(vp, 5_000, 10_000)
  assert(same.startMs === 2_500 && same.endMs === 7_500, 'inside → no pan')

  const left = followPlayheadInViewport(vp, 2_600, 10_000)
  assert(left.startMs < 2_500, 'near left edge → pan left')

  const right = followPlayheadInViewport(vp, 7_400, 10_000)
  assert(right.endMs > 7_500 || right.startMs > 2_500, 'near right → pan right')

  const panned = panTimelineViewport(vp, 1_000, 10_000)
  assert(Math.abs(panned.startMs - 3_500) < 0.01, 'pan +1000')
  assert(Math.abs(panned.endMs - 8_500) < 0.01, 'pan end')

  const over = panTimelineViewport(vp, 10_000, 10_000)
  assert(over.endMs === 10_000, 'pan clamp end')
  assert(Math.abs(over.startMs - 5_000) < 0.01, 'pan clamp start')
  console.log('ok follow/pan')
}

function testPrefs(): void {
  assert(DEFAULT_TIMELINE_PREFS.timelineZoom === 1, 'default zoom 1')
  assert(
    normalizeTimelinePrefs({ timelineZoom: 4 }).timelineZoom === 4,
    'zoom 4',
  )
  assert(
    normalizeTimelinePrefs({ timelineZoom: 99 }).timelineZoom === 8,
    'zoom clamp via normalize',
  )
  // Legacy prefs without timelineZoom → 1×
  assert(
    normalizeTimelinePrefs({ rippleDeleteEnabled: true }).timelineZoom === 1,
    'legacy → 1×',
  )

  const storage = memoryStorage()
  saveTimelinePrefs(
    {
      rippleDeleteEnabled: false,
      magneticSnapEnabled: true,
      timelineZoom: 3,
    },
    storage,
  )
  const loaded = loadTimelinePrefs(storage)
  assert(loaded.timelineZoom === 3, 'zoom persisted')
  assert(
    storage.getItem(TIMELINE_PREFS_STORAGE_KEY)?.includes('timelineZoom'),
    'key written',
  )
  console.log('ok prefs')
}

testClampAndSteps()
testViewport()
testFollowAndPan()
testPrefs()
console.log('smoke:timeline-zoom ok')
