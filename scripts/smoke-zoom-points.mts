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
  MIN_ZOOM_EDGE_MS,
  moveManualZoomPeak,
  nudgeZoomFocus,
  removeManualZoomPoint,
  resizeAutoZoomEdge,
  resizeManualZoomEdge,
  resizeZoomSegmentEdge,
  resolveZoomPointFocus,
  resolveZoomPointPeakMs,
  resolveZoomPointPeakScale,
  shiftZoomSegmentToPeak,
  upsertManualZoomPoint,
  upsertZoomPointOverride,
  ZOOM_FOCUS_NUDGE_STEP,
  ZOOM_FOCUS_NUDGE_STEP_SHIFT,
} from '../dist-electron/shared/zoomPoints.js'
import {
  buildTimelineMarkers,
  buildZoomEventMarkers,
} from '../dist-electron/shared/timelineMarkers.js'

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

function testFocusNudge(): void {
  const nudged = nudgeZoomFocus(0.5, 0.5, 'right')
  assert(
    Math.abs(nudged.focusX - (0.5 + ZOOM_FOCUS_NUDGE_STEP)) < 1e-9,
    'right step',
  )
  assert(nudged.focusY === 0.5, 'y unchanged')

  const shifted = nudgeZoomFocus(0.5, 0.5, 'up', { shift: true })
  assert(
    Math.abs(shifted.focusY - (0.5 - ZOOM_FOCUS_NUDGE_STEP_SHIFT)) < 1e-9,
    'shift up',
  )

  const clamped = nudgeZoomFocus(0.01, 0.99, 'left')
  assert(clamped.focusX === 0, 'clamp left')
  const clampedDown = nudgeZoomFocus(0.5, 0.99, 'down', { shift: true })
  assert(clampedDown.focusY === 1, 'clamp down')

  const segments = buildZoomSegments(sampleEvents(), videoSize)
  const withFocus = applyZoomPointOverrides(segments, [
    { index: 0, enabled: true, focusX: 0.1, focusY: 0.9, peakScale: 2 },
  ])
  assert(withFocus[0]!.focusX === 0.1 && withFocus[0]!.focusY === 0.9, 'focus override')
  assert(withFocus[0]!.peakScale === 2, 'scale with focus')
  assert(
    withFocus[1]!.focusX === segments[1]!.focusX,
    'other focus untouched',
  )

  const resolved = resolveZoomPointFocus(segments[0]!, 0, [
    { index: 0, enabled: true, focusX: 0.33, focusY: 0.66 },
  ])
  assert(resolved.focusX === 0.33 && resolved.focusY === 0.66, 'resolve focus')
  const fallback = resolveZoomPointFocus(segments[1]!, 1, [])
  assert(
    fallback.focusX === segments[1]!.focusX &&
      fallback.focusY === segments[1]!.focusY,
    'resolve default',
  )

  const exportPlan = planAutoZoomExport(
    sampleEvents(),
    videoSize,
    8000,
    {},
    {},
    [{ index: 0, enabled: true, focusX: 0.2, focusY: 0.8 }],
  )
  assert(exportPlan.segments[0]!.focusX === 0.2, 'export focus bake')
  assert(exportPlan.segments[0]!.focusY === 0.8, 'export focus bake y')
  console.log('ok focus nudge')
}

function testPeakDrag(): void {
  const segments = buildZoomSegments(sampleEvents(), videoSize)
  const first = segments[0]!
  const zoomIn = first.peakMs - first.startMs
  const hold = first.holdEndMs - first.peakMs
  const zoomOut = first.endMs - first.holdEndMs

  const shifted = shiftZoomSegmentToPeak(first, first.peakMs + 500, 8000)
  assert(shifted.peakMs === first.peakMs + 500, 'peak moved')
  assert(shifted.peakMs - shifted.startMs === zoomIn, 'zoom-in kept')
  assert(shifted.holdEndMs - shifted.peakMs === hold, 'hold kept')
  assert(shifted.endMs - shifted.holdEndMs === zoomOut, 'zoom-out kept')

  const clamped = shiftZoomSegmentToPeak(first, -100, 8000)
  assert(clamped.peakMs === 0, 'clamp low')
  const clampedHi = shiftZoomSegmentToPeak(first, 99999, 5000)
  assert(clampedHi.peakMs === 5000, 'clamp high')

  const withPeak = applyZoomPointOverrides(segments, [
    { index: 0, enabled: true, peakMs: first.peakMs + 300 },
  ])
  assert(withPeak[0]!.peakMs === first.peakMs + 300, 'override peak')
  assert(
    resolveZoomPointPeakMs(first, 0, [
      { index: 0, enabled: true, peakMs: 1234 },
    ]) === 1234,
    'resolve peak',
  )

  const manual = createManualZoomPoint({
    peakMs: 2000,
    id: 'mz-drag',
    focusX: 0.4,
    focusY: 0.6,
  })
  const moved = moveManualZoomPeak([manual], 'mz-drag', 3500, 8000)
  assert(moved[0]!.peakMs === 3500, 'manual peak moved')
  const seg = manualZoomToSegment(moved[0]!)
  assert(seg != null && seg.peakMs === 3500, 'manual segment follows')

  const markers = buildZoomEventMarkers(segments, [
    { index: 1, enabled: false },
    { index: 0, enabled: true, peakMs: first.peakMs + 200 },
  ], [moved[0]!])
  assert(markers.every((m) => m.kind === 'zoom'), 'zoom markers')
  assert(
    markers.some((m) => m.zoomIndex === 0 && m.tMs === first.peakMs + 200),
    'auto marker tagged + peak',
  )
  assert(
    !markers.some((m) => m.zoomIndex === 1),
    'disabled auto omitted',
  )
  assert(
    markers.some((m) => m.manualZoomId === 'mz-drag' && m.tMs === 3500),
    'manual marker tagged',
  )

  const timeline = buildTimelineMarkers(segments, sampleEvents(), {
    autoZoomSegments: segments,
    zoomPointOverrides: [{ index: 0, enabled: true, peakMs: 900 }],
    manualZoomPoints: [moved[0]!],
    includeClicks: false,
  })
  assert(
    timeline.some((m) => m.kind === 'zoom' && m.zoomIndex === 0 && m.tMs === 900),
    'timeline markers use sources',
  )

  const exportPlan = planAutoZoomExport(
    sampleEvents(),
    videoSize,
    8000,
    {},
    {},
    [{ index: 0, enabled: true, peakMs: first.peakMs + 400 }],
  )
  assert(
    exportPlan.segments[0]!.peakMs === first.peakMs + 400,
    'export bakes peakMs',
  )
  console.log('ok peak drag')
}

function testEdgeResize(): void {
  const segments = buildZoomSegments(sampleEvents(), videoSize)
  // Use middle segment — early click peaks near t=0 so start can't extend far.
  const mid = segments[1]!
  const hold = mid.holdEndMs - mid.peakMs

  const longerIn = resizeZoomSegmentEdge(
    mid,
    'start',
    mid.peakMs - 700,
    8000,
  )
  assert(longerIn.peakMs === mid.peakMs, 'start keeps peak')
  assert(longerIn.holdEndMs === mid.holdEndMs, 'start keeps hold end')
  assert(longerIn.startMs === mid.peakMs - 700, 'start extended')
  assert(longerIn.endMs === mid.endMs, 'start keeps end')

  const minIn = resizeZoomSegmentEdge(mid, 'start', mid.peakMs, 8000)
  assert(
    mid.peakMs - minIn.startMs === MIN_ZOOM_EDGE_MS,
    'start clamps to min edge',
  )

  const longerOut = resizeZoomSegmentEdge(
    mid,
    'end',
    mid.holdEndMs + 900,
    8000,
  )
  assert(longerOut.peakMs === mid.peakMs, 'end keeps peak')
  assert(longerOut.startMs === mid.startMs, 'end keeps start')
  assert(longerOut.endMs === mid.holdEndMs + 900, 'end extended')

  const minOut = resizeZoomSegmentEdge(mid, 'end', mid.holdEndMs, 8000)
  assert(
    minOut.endMs - minOut.holdEndMs === MIN_ZOOM_EDGE_MS,
    'end clamps to min edge',
  )

  let overrides = resizeAutoZoomEdge(
    segments,
    [],
    1,
    'start',
    mid.peakMs - 600,
    8000,
  )
  assert(overrides.length === 1, 'edge upserts override')
  assert(overrides[0]!.index === 1, 'targets index 1')
  assert(overrides[0]!.zoomInMs === 600, 'stores zoomInMs')
  assert(overrides[0]!.holdMs === hold, 'stores holdMs')
  assert(overrides[0]!.peakMs === mid.peakMs, 'stores peakMs')

  const applied = applyZoomPointOverrides(segments, overrides)
  const appliedMid = applied.find((s) => s.peakMs === mid.peakMs)!
  assert(appliedMid.startMs === mid.peakMs - 600, 'apply start edge')
  assert(appliedMid.peakMs === mid.peakMs, 'apply peak intact')

  overrides = resizeAutoZoomEdge(
    segments,
    overrides,
    1,
    'end',
    mid.holdEndMs + 750,
    8000,
  )
  assert(overrides[0]!.zoomOutMs === 750, 'stores zoomOutMs')
  const appliedOut = applyZoomPointOverrides(segments, overrides)
  const appliedMidOut = appliedOut.find((s) => s.peakMs === mid.peakMs)!
  assert(appliedMidOut.endMs === mid.holdEndMs + 750, 'apply end edge')
  assert(appliedMidOut.startMs === mid.peakMs - 600, 'keeps prior start')

  const withPeak = applyZoomPointOverrides(segments, [
    {
      index: 1,
      enabled: true,
      peakMs: mid.peakMs + 200,
      zoomInMs: 500,
      holdMs: hold,
      zoomOutMs: 400,
    },
  ])
  const peaked = withPeak.find((s) => s.peakMs === mid.peakMs + 200)!
  assert(peaked.peakMs === mid.peakMs + 200, 'timing+peak peak')
  assert(peaked.peakMs - peaked.startMs === 500, 'timing+peak in')
  assert(peaked.endMs - peaked.holdEndMs === 400, 'timing+peak out')

  const manual = createManualZoomPoint({
    peakMs: 3000,
    id: 'mz-edge',
    focusX: 0.5,
    focusY: 0.5,
  })
  const manualSeg = manualZoomToSegment(manual)!
  const resizedManual = resizeManualZoomEdge(
    [manual],
    'mz-edge',
    'start',
    manualSeg.peakMs - 550,
    8000,
  )
  assert(resizedManual[0]!.zoomInMs === 550, 'manual zoomIn stored')
  const manualApplied = manualZoomToSegment(resizedManual[0]!)!
  assert(manualApplied.startMs === 3000 - 550, 'manual start applied')
  assert(manualApplied.peakMs === 3000, 'manual peak intact')

  const markers = buildZoomEventMarkers(segments, overrides, resizedManual)
  assert(
    markers.some(
      (m) =>
        m.zoomIndex === 1 &&
        m.startMs === mid.peakMs - 600 &&
        m.endMs === mid.holdEndMs + 750,
    ),
    'markers reflect edge timing',
  )

  const exportPlan = planAutoZoomExport(
    sampleEvents(),
    videoSize,
    8000,
    {},
    {},
    overrides,
  )
  const exported = exportPlan.segments.find((s) => s.peakMs === mid.peakMs)!
  assert(
    exported.startMs === mid.peakMs - 600,
    'export bakes zoom-in edge',
  )
  assert(
    exported.endMs === mid.holdEndMs + 750,
    'export bakes zoom-out edge',
  )

  // Hold edge: peak + end fixed; trades holdMs ↔ zoomOutMs.
  const holdTarget = mid.peakMs + Math.max(MIN_ZOOM_EDGE_MS, Math.floor(hold / 2))
  const holdResized = resizeZoomSegmentEdge(mid, 'hold', holdTarget, 8000)
  assert(holdResized.peakMs === mid.peakMs, 'hold keeps peak')
  assert(holdResized.startMs === mid.startMs, 'hold keeps start')
  assert(holdResized.endMs === mid.endMs, 'hold keeps end')
  assert(holdResized.holdEndMs === holdTarget, 'hold moves holdEnd')
  assert(
    holdResized.endMs - holdResized.holdEndMs >= MIN_ZOOM_EDGE_MS,
    'hold keeps min zoom-out',
  )

  const minHold = resizeZoomSegmentEdge(mid, 'hold', mid.peakMs - 100, 8000)
  assert(minHold.holdEndMs === mid.peakMs, 'hold clamps to peak (0 hold)')

  const maxHold = resizeZoomSegmentEdge(mid, 'hold', mid.endMs, 8000)
  assert(
    maxHold.endMs - maxHold.holdEndMs === MIN_ZOOM_EDGE_MS,
    'hold clamps to leave min zoom-out',
  )

  let holdOverrides = resizeAutoZoomEdge(
    segments,
    [],
    1,
    'hold',
    holdTarget,
    8000,
  )
  assert(holdOverrides[0]!.holdMs === holdTarget - mid.peakMs, 'stores holdMs')
  assert(
    holdOverrides[0]!.zoomOutMs === mid.endMs - holdTarget,
    'stores traded zoomOutMs',
  )
  const holdApplied = applyZoomPointOverrides(segments, holdOverrides)
  const holdMid = holdApplied.find((s) => s.peakMs === mid.peakMs)!
  assert(holdMid.holdEndMs === holdTarget, 'apply hold edge')
  assert(holdMid.endMs === mid.endMs, 'apply hold keeps end')

  const holdManual = createManualZoomPoint({
    peakMs: 4000,
    id: 'mz-hold',
    focusX: 0.4,
    focusY: 0.6,
  })
  const holdManualSeg = manualZoomToSegment(holdManual)!
  const holdManualTarget =
    holdManualSeg.peakMs +
    Math.max(MIN_ZOOM_EDGE_MS, Math.floor((holdManualSeg.holdEndMs - holdManualSeg.peakMs) / 2))
  const resizedHoldManual = resizeManualZoomEdge(
    [holdManual],
    'mz-hold',
    'hold',
    holdManualTarget,
    8000,
  )
  assert(
    resizedHoldManual[0]!.holdMs === holdManualTarget - holdManualSeg.peakMs,
    'manual holdMs stored',
  )
  const holdManualApplied = manualZoomToSegment(resizedHoldManual[0]!)!
  assert(holdManualApplied.holdEndMs === holdManualTarget, 'manual hold applied')
  assert(holdManualApplied.endMs === holdManualSeg.endMs, 'manual hold keeps end')

  const holdMarkers = buildZoomEventMarkers(segments, holdOverrides, resizedHoldManual)
  assert(
    holdMarkers.some(
      (m) =>
        m.zoomIndex === 1 &&
        m.holdEndMs === holdTarget &&
        m.endMs === mid.endMs,
    ),
    'markers expose holdEndMs',
  )
  assert(
    holdMarkers.some((m) => m.manualZoomId === 'mz-hold' && m.holdEndMs === holdManualTarget),
    'manual markers expose holdEndMs',
  )

  console.log('ok edge resize')
}

testClamp()
testApplyOverrides()
testUpsertAndResolve()
testExportPlan()
testEditDefaults()
testManualZoomAtPlayhead()
testFocusNudge()
testPeakDrag()
testEdgeResize()
console.log('smoke-zoom-points: all ok')
