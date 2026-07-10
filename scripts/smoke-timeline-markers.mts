/**
 * Smoke checks for timeline clip markers (no Electron / DOM).
 */
import type { CursorEvent } from '../shared/cursor.ts'
import type { ZoomSegment } from '../shared/autozoom.ts'
import {
  buildTimelineMarkers,
  markerPercent,
  markersInTrimRange,
} from '../shared/timelineMarkers.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPercent(): void {
  assert(markerPercent(0, 1000) === 0, 'pct 0')
  assert(markerPercent(500, 1000) === 50, 'pct mid')
  assert(markerPercent(1000, 1000) === 100, 'pct end')
  assert(markerPercent(-10, 1000) === 0, 'pct clamp low')
  assert(markerPercent(2000, 1000) === 100, 'pct clamp high')
  assert(markerPercent(50, 0) === 0, 'pct zero duration')
  console.log('ok percent')
}

function testBuild(): void {
  const segments: ZoomSegment[] = [
    {
      startMs: 100,
      peakMs: 500,
      holdEndMs: 1300,
      endMs: 1800,
      focusX: 0.4,
      focusY: 0.5,
      peakScale: 1.6,
    },
    {
      startMs: 2000,
      peakMs: 2400,
      holdEndMs: 3200,
      endMs: 3700,
      focusX: 0.7,
      focusY: 0.3,
      peakScale: 1.6,
    },
  ]
  const events: CursorEvent[] = [
    { t: 100, x: 10, y: 10, kind: 'click', button: 0 },
    { t: 2000, x: 20, y: 20, kind: 'down', button: 0 },
    { t: 2500, x: 30, y: 30, kind: 'move' },
  ]

  const markers = buildTimelineMarkers(segments, events)
  const zooms = markers.filter((m) => m.kind === 'zoom')
  const clicks = markers.filter((m) => m.kind === 'click')
  assert(zooms.length === 2, `expected 2 zoom markers, got ${zooms.length}`)
  assert(
    zooms[0]?.tMs === 500 &&
      zooms[0]?.startMs === 100 &&
      zooms[0]?.endMs === 1800,
    'zoom seek=peak + span',
  )
  assert(clicks.length === 2, `expected 2 click markers, got ${clicks.length}`)
  assert(markers.every((m, i, arr) => i === 0 || arr[i - 1]!.tMs <= m.tMs), 'sorted')

  const noClicks = buildTimelineMarkers(segments, events, { includeClicks: false })
  assert(noClicks.every((m) => m.kind === 'zoom'), 'includeClicks false')
  console.log('ok build', markers.length)
}

function testTrimFilter(): void {
  const markers = buildTimelineMarkers(
    [
      {
        startMs: 0,
        peakMs: 400,
        holdEndMs: 1200,
        endMs: 1700,
        focusX: 0.5,
        focusY: 0.5,
        peakScale: 1.6,
      },
      {
        startMs: 5000,
        peakMs: 5400,
        holdEndMs: 6200,
        endMs: 6700,
        focusX: 0.2,
        focusY: 0.8,
        peakScale: 1.6,
      },
    ],
    [{ t: 100, x: 1, y: 1, kind: 'click', button: 0 }],
  )
  const inRange = markersInTrimRange(markers, 0, 2000)
  assert(inRange.some((m) => m.kind === 'zoom' && m.tMs === 400), 'keeps first zoom')
  assert(!inRange.some((m) => m.kind === 'zoom' && m.tMs === 5400), 'drops late zoom')
  assert(inRange.some((m) => m.kind === 'click'), 'keeps early click')
  console.log('ok trim filter', inRange.length)
}

testPercent()
testBuild()
testTrimFilter()
console.log('smoke-timeline-markers: all ok')
