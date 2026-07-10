/**
 * Smoke checks for per-click zoom point overrides (no Electron / DOM).
 * Load compiled shared modules so `.js` imports resolve after build:electron.
 */
import type { CursorEvent } from '../shared/cursor.ts'
import { buildZoomSegments } from '../dist-electron/shared/autozoom.js'
import { defaultReviewEdit } from '../dist-electron/shared/edit.js'
import { applyBeautifyPreset } from '../dist-electron/shared/beautify.js'
import { planAutoZoomExport } from '../dist-electron/shared/ffmpegZoom.js'
import {
  applyZoomPointOverrides,
  clampZoomPeakScale,
  countEnabledManualZoomPoints,
  countEnabledZoomPoints,
  createManualZoomPoint,
  isZoomPointEnabled,
  manualZoomToSegment,
  mergeZoomSegments,
  removeManualZoomPoint,
  resolveZoomPointPeakScale,
  upsertManualZoomPoint,
  upsertZoomPointOverride,
} from '../dist-electron/shared/zoomPoints.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const videoSize = { width: 1920, height: 1080 }

function sampleEvents(): CursorEvent[] {
  return [
    { t: 100, x: 400, y: 300, kind: 'click', button: 0 },
    { t: 2500, x: 1200, y: 700, kind: 'click', button: 0 },
    { t: 5000, x: 900, y: 500, kind: 'click', button: 0 },
  ]
}

function testClamp(): void {
  assert(clampZoomPeakScale(1.6) === 1.6, 'default ok')
  assert(clampZoomPeakScale(0.5) === 1.1, 'min')
  assert(clampZoomPeakScale(9) === 3, 'max')
  assert(clampZoomPeakScale(Number.NaN) === 1.6, 'nan')
  console.log('ok clamp')
}

function testApplyOverrides(): void {
  const segments = buildZoomSegments(sampleEvents(), videoSize)
  assert(segments.length === 3, `expected 3 segments, got ${segments.length}`)

  const none = applyZoomPointOverrides(segments, [])
  assert(none.length === 3, 'empty overrides keep all')

  const disabled = applyZoomPointOverrides(segments, [
    { index: 1, enabled: false },
  ])
  assert(disabled.length === 2, 'disable middle')
  assert(disabled[0]!.startMs === segments[0]!.startMs, 'keeps first')
  assert(disabled[1]!.startMs === segments[2]!.startMs, 'keeps third')

  const scaled = applyZoomPointOverrides(segments, [
    { index: 0, enabled: true, peakScale: 2.4 },
  ])
  assert(scaled[0]!.peakScale === 2.4, 'scale override')
  assert(scaled[1]!.peakScale === segments[1]!.peakScale, 'others untouched')
  console.log('ok apply', disabled.length)
}

function testUpsertAndResolve(): void {
  let overrides = upsertZoomPointOverride([], {
    index: 0,
    enabled: true,
    peakScale: 2,
  })
  overrides = upsertZoomPointOverride(overrides, {
    index: 0,
    enabled: false,
    peakScale: 2,
  })
  assert(overrides.length === 1, 'upsert replaces')
  assert(!isZoomPointEnabled(0, overrides), 'disabled')
  assert(isZoomPointEnabled(2, overrides), 'missing = enabled')

  const segments = buildZoomSegments(sampleEvents(), videoSize)
  assert(
    resolveZoomPointPeakScale(segments[0]!, 0, [
      { index: 0, enabled: true, peakScale: 2.2 },
    ]) === 2.2,
    'resolve scale',
  )
  assert(countEnabledZoomPoints(3, overrides) === 2, 'count enabled')
  console.log('ok upsert')
}

function testExportPlan(): void {
  const events = sampleEvents()
  const full = planAutoZoomExport(events, videoSize, 8000)
  assert(full.hasZoom, 'full has zoom')
  assert(full.segments.length === 3, 'full 3 segs')

  const trimmed = planAutoZoomExport(
    events,
    videoSize,
    8000,
    {},
    {},
    [
      { index: 0, enabled: false },
      { index: 2, enabled: true, peakScale: 2.5 },
    ],
  )
  assert(trimmed.hasZoom, 'partial still zooms')
  assert(trimmed.segments.length === 2, 'two left')
  assert(
    trimmed.segments.some((s) => s.peakScale === 2.5),
    'scaled segment baked',
  )

  const allOff = planAutoZoomExport(
    events,
    videoSize,
    8000,
    {},
    {},
    [
      { index: 0, enabled: false },
      { index: 1, enabled: false },
      { index: 2, enabled: false },
    ],
  )
  assert(!allOff.hasZoom, 'all off = no zoom filter')
  console.log('ok export plan')
}

function testEditDefaults(): void {
  const edit = defaultReviewEdit(5000)
  assert(Array.isArray(edit.zoomPointOverrides), 'overrides array')
  assert(edit.zoomPointOverrides.length === 0, 'empty by default')
  assert(Array.isArray(edit.manualZoomPoints), 'manual array')
  assert(edit.manualZoomPoints.length === 0, 'manual empty by default')

  const withEdits = {
    ...edit,
    zoomPointOverrides: [{ index: 0, enabled: false }],
    manualZoomPoints: [
      createManualZoomPoint({ peakMs: 1200, focusX: 0.3, focusY: 0.4, id: 'mz-keep' }),
    ],
  }
  const beautified = applyBeautifyPreset(withEdits, 'tutorial')
  assert(
    beautified.zoomPointOverrides.length === 1 &&
      beautified.zoomPointOverrides[0]!.enabled === false,
    'beautify preserves zoom overrides',
  )
  assert(
    beautified.manualZoomPoints.length === 1 &&
      beautified.manualZoomPoints[0]!.id === 'mz-keep',
    'beautify preserves manual zooms',
  )
  console.log('ok edit defaults')
}

function testManualZoomAtPlayhead(): void {
  const point = createManualZoomPoint({
    peakMs: 2000,
    focusX: 0.25,
    focusY: 0.75,
    peakScale: 2,
    id: 'mz-1',
  })
  assert(point.enabled, 'manual enabled')
  const seg = manualZoomToSegment(point)
  assert(seg != null, 'segment built')
  assert(seg!.peakMs === 2000, 'peak at playhead')
  assert(seg!.startMs === 1600, 'zoom-in 400ms before peak')
  assert(seg!.focusX === 0.25 && seg!.focusY === 0.75, 'focus kept')
  assert(seg!.peakScale === 2, 'scale kept')

  const disabled = manualZoomToSegment({ ...point, enabled: false })
  assert(disabled === null, 'disabled drops')

  const auto = buildZoomSegments(sampleEvents(), videoSize)
  const merged = mergeZoomSegments(auto, [point])
  assert(merged.length === auto.length + 1, 'merged adds one')
  assert(
    merged.some((s) => s.peakMs === 2000 && s.focusX === 0.25),
    'manual in merge',
  )

  let points = upsertManualZoomPoint([], point)
  points = upsertManualZoomPoint(points, { ...point, peakScale: 2.5 })
  assert(points.length === 1 && points[0]!.peakScale === 2.5, 'upsert replaces')
  points = removeManualZoomPoint(points, 'mz-1')
  assert(points.length === 0, 'remove')
  assert(countEnabledManualZoomPoints([point, { ...point, id: 'mz-2', enabled: false }]) === 1, 'count')

  const exportPlan = planAutoZoomExport(
    sampleEvents(),
    videoSize,
    8000,
    {},
    {},
    [],
    [point],
  )
  assert(exportPlan.hasZoom, 'manual alone with clicks zooms')
  assert(exportPlan.segments.length === 4, '3 auto + 1 manual')

  const manualOnly = planAutoZoomExport([], videoSize, 5000, {}, {}, [], [point])
  assert(manualOnly.hasZoom, 'manual-only export zooms')
  assert(manualOnly.segments.length === 1, 'one manual segment')
  console.log('ok manual playhead')
}

testClamp()
testApplyOverrides()
testUpsertAndResolve()
testExportPlan()
testEditDefaults()
testManualZoomAtPlayhead()
console.log('smoke-zoom-points: all ok')
