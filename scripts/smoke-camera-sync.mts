/**
 * Smoke checks for screen↔camera A/V drift compensation helpers.
 */
import {
  CAMERA_SYNC_OFFSET_EPSILON_MS,
  cameraDriftNeedsCompensation,
  cameraDriftSetptsExpr,
  cameraMicAudioFilter,
  cameraOverlayEnableExpr,
  cameraStartLagMs,
  closeOpenCameraActiveRanges,
  computeCameraDrift,
  createEmptyCameraSyncMeta,
  isCameraActiveAtMs,
  isCameraActiveRangesNever,
  materializeCameraActiveRanges,
  openCameraActiveRange,
  parseCameraSyncMeta,
  removeCameraActiveRangeAt,
  screenTimeToCameraTimeSec,
  toggleCameraActiveAtWallMs,
} from '../shared/cameraSync.ts'
import { planCameraExport } from '../dist-electron/shared/ffmpegCamera.js'
import { DEFAULT_CAMERA_OVERLAY } from '../shared/camera.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function nearly(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) < eps
}

function testParseMeta(): void {
  const empty = createEmptyCameraSyncMeta(1_000)
  assert(empty.version === 1, 'version')
  assert(empty.screenFirstChunkMs == null, 'no screen yet')
  assert(Array.isArray(empty.activeRanges), 'activeRanges default')
  assert(parseCameraSyncMeta(null) == null, 'null')
  assert(parseCameraSyncMeta({ version: 2 }) == null, 'bad version')
  const parsed = parseCameraSyncMeta({
    version: 1,
    startedAt: 50,
    screenFirstChunkMs: 10,
    cameraFirstChunkMs: 210,
    wallDurationMs: 5000,
    activeRanges: [{ startMs: 200, endMs: 4000 }],
  })
  assert(parsed != null, 'parsed')
  assert(parsed!.cameraFirstChunkMs === 210, 'camera first')
  assert(parsed!.activeRanges?.length === 1, 'active range kept')
  console.log('ok camera sync parse')
}

function testStartLag(): void {
  assert(cameraStartLagMs(null) === 0, 'null meta')
  assert(
    cameraStartLagMs({ screenFirstChunkMs: 10, cameraFirstChunkMs: 20 }) === 0,
    'tiny lag ignored',
  )
  const lag = cameraStartLagMs({
    screenFirstChunkMs: 50,
    cameraFirstChunkMs: 250,
  })
  assert(lag === 200, `lag 200 (got ${lag})`)
  assert(lag >= CAMERA_SYNC_OFFSET_EPSILON_MS, 'above epsilon')
  console.log('ok camera start lag')
}

function testComputeDrift(): void {
  const aligned = computeCameraDrift({
    screenDurationMs: 5000,
    cameraDurationMs: 5000,
    sync: { screenFirstChunkMs: 0, cameraFirstChunkMs: 0 },
  })
  assert(aligned.offsetMs === 0, 'aligned offset')
  assert(aligned.ptsRate === 1, 'aligned rate')
  assert(!cameraDriftNeedsCompensation(aligned), 'no compensation')

  const late = computeCameraDrift({
    screenDurationMs: 5000,
    cameraDurationMs: 4800,
    sync: { screenFirstChunkMs: 20, cameraFirstChunkMs: 220 },
  })
  assert(late.offsetMs === 200, `late offset (got ${late.offsetMs})`)
  // target = 5000-200 = 4800; camera = 4800 → rate ~1
  assert(nearly(late.ptsRate, 1, 0.01), `late rate near 1 (got ${late.ptsRate})`)

  const skew = computeCameraDrift({
    screenDurationMs: 10_000,
    cameraDurationMs: 9_700,
    sync: { screenFirstChunkMs: 0, cameraFirstChunkMs: 0 },
  })
  assert(skew.offsetMs === 0, 'skew offset 0')
  assert(skew.ptsRate > 1 && skew.ptsRate < 1.05, `gentle stretch (got ${skew.ptsRate})`)
  assert(cameraDriftNeedsCompensation(skew), 'skew needs compensation')

  const wild = computeCameraDrift({
    screenDurationMs: 10_000,
    cameraDurationMs: 5_000,
    sync: null,
  })
  assert(wild.ptsRate === 1, 'wild mismatch skips stretch')
  console.log('ok compute camera drift')
}

function testSetptsAndReviewMap(): void {
  const expr = cameraDriftSetptsExpr({ offsetMs: 200, ptsRate: 1 })
  assert(expr != null && expr.includes('0.200'), `setpts offset (got ${expr})`)
  const rateExpr = cameraDriftSetptsExpr({ offsetMs: 0, ptsRate: 1.02 })
  assert(rateExpr != null && rateExpr.includes('PTS*'), `setpts rate (got ${rateExpr})`)
  assert(cameraDriftSetptsExpr({ offsetMs: 0, ptsRate: 1 }) == null, 'identity null')

  const camT = screenTimeToCameraTimeSec(1.0, { offsetMs: 200, ptsRate: 1 })
  assert(nearly(camT, 0.8), `review map 1.0→0.8 (got ${camT})`)
  console.log('ok setpts + review map')
}

function testMicAudioFilter(): void {
  assert(cameraMicAudioFilter(1, 0) == null, 'no filter when aligned')
  assert(cameraMicAudioFilter(1, 20) == null, 'epsilon skip')
  const delay = cameraMicAudioFilter(1, 250)
  assert(delay != null && delay.includes('adelay=250|250'), `adelay (got ${delay})`)
  assert(delay!.includes('[aout]'), 'default out label')
  const trim = cameraMicAudioFilter(1, -400, 'mic')
  assert(trim != null && trim.includes('atrim=start=0.400'), `atrim (got ${trim})`)
  assert(trim!.includes('[mic]'), 'custom label')
  console.log('ok camera mic audio filter')
}

function testActiveRanges(): void {
  let ranges = openCameraActiveRange([], 100)
  assert(ranges.length === 1 && ranges[0]!.endMs == null, 'open range')
  ranges = closeOpenCameraActiveRanges(ranges, 2500)
  assert(ranges[0]!.endMs === 2500, 'closed')
  ranges = openCameraActiveRange(ranges, 4000)
  assert(ranges.length === 2, 'second open')
  assert(isCameraActiveAtMs(ranges, 150, 10_000), 'active in first')
  assert(!isCameraActiveAtMs(ranges, 3000, 10_000), 'muted gap')
  assert(isCameraActiveAtMs(ranges, 4500, 10_000), 'active in open second')
  assert(isCameraActiveAtMs([], 999, 10_000), 'empty = always on')

  const full = cameraOverlayEnableExpr([{ startMs: 0, endMs: 5000 }], 0, 5000)
  assert(full == null, 'full coverage → no enable')
  const partial = cameraOverlayEnableExpr(
    [
      { startMs: 500, endMs: 2000 },
      { startMs: 3000, endMs: 4500 },
    ],
    0,
    5000,
  )
  assert(partial != null && partial.includes('between(t,'), `partial enable (got ${partial})`)
  assert(partial!.includes('+'), 'OR of windows')

  // Review mute at playhead (always-on → prefix window)
  const muted = toggleCameraActiveAtWallMs([], 2000, 5000)
  assert(muted.length === 1 && muted[0]!.endMs === 2000, `mute always-on (got ${JSON.stringify(muted)})`)
  assert(!isCameraActiveAtMs(muted, 2500, 5000), 'muted after playhead')
  const unmuted = toggleCameraActiveAtWallMs(muted, 3000, 5000)
  assert(unmuted.length === 2, `unmute adds window (got ${JSON.stringify(unmuted)})`)
  assert(isCameraActiveAtMs(unmuted, 3500, 5000), 'active after unmute')

  const never = toggleCameraActiveAtWallMs([{ startMs: 0, endMs: 5000 }], 0, 5000)
  assert(isCameraActiveRangesNever(never), 'fully muted sentinel')
  assert(!isCameraActiveAtMs(never, 100, 5000), 'never active')
  assert(cameraOverlayEnableExpr(never, 0, 5000) === '0', 'enable=0 when never')

  const trimmed = cameraOverlayEnableExpr(
    [{ startMs: 6000, endMs: 8000 }],
    0,
    10_000,
    { trimStartMs: 5000 },
  )
  assert(
    trimmed != null && trimmed.includes('between(t,1.000,3.000)'),
    `trim rebase enable (got ${trimmed})`,
  )

  const removed = removeCameraActiveRangeAt(
    [
      { startMs: 0, endMs: 1000 },
      { startMs: 2000, endMs: 3000 },
    ],
    0,
  )
  assert(removed.length === 1 && removed[0]!.startMs === 2000, 'remove first')
  assert(
    isCameraActiveRangesNever(removeCameraActiveRangeAt([{ startMs: 0, endMs: 1000 }], 0)),
    'remove last → never',
  )

  const materialized = materializeCameraActiveRanges([], 4000)
  assert(
    materialized.length === 1 &&
      materialized[0]!.startMs === 0 &&
      materialized[0]!.endMs === 4000,
    'materialize always-on',
  )

  console.log('ok camera active ranges')
}

function testPlanInjectsSetpts(): void {
  const style = { ...DEFAULT_CAMERA_OVERLAY, enabled: true, shape: 'circle' as const }
  const plan = planCameraExport(
    style,
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
    { offsetMs: 150, ptsRate: 1 },
  )
  assert(plan.hasCamera, 'has camera')
  assert(plan.driftApplied, 'driftApplied')
  assert(plan.filterComplex.includes('setpts='), 'setpts in graph')
  assert(plan.filterComplex.includes('0.150'), 'offset in setpts')

  const plain = planCameraExport(style, { width: 320, height: 180 }, 'vbase', 'vout', 1, null)
  assert(!plain.driftApplied, 'no drift')
  assert(!plain.filterComplex.includes('setpts='), 'no setpts without drift')

  const gated = planCameraExport(
    style,
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
    null,
    'between(t,1.000,2.000)',
  )
  assert(gated.filterComplex.includes("enable='between(t,1.000,2.000)'"), 'enable in overlay')
  console.log('ok plan injects setpts')
}

testParseMeta()
testStartLag()
testComputeDrift()
testSetptsAndReviewMap()
testMicAudioFilter()
testActiveRanges()
testPlanInjectsSetpts()
console.log('smoke:camera-sync passed')
