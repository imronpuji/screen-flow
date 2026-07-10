/**
 * Smoke checks for screen↔camera A/V drift compensation helpers.
 */
import {
  CAMERA_SYNC_OFFSET_EPSILON_MS,
  cameraDriftNeedsCompensation,
  cameraDriftSetptsExpr,
  cameraStartLagMs,
  computeCameraDrift,
  createEmptyCameraSyncMeta,
  parseCameraSyncMeta,
  screenTimeToCameraTimeSec,
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
  assert(parseCameraSyncMeta(null) == null, 'null')
  assert(parseCameraSyncMeta({ version: 2 }) == null, 'bad version')
  const parsed = parseCameraSyncMeta({
    version: 1,
    startedAt: 50,
    screenFirstChunkMs: 10,
    cameraFirstChunkMs: 210,
    wallDurationMs: 5000,
  })
  assert(parsed != null, 'parsed')
  assert(parsed!.cameraFirstChunkMs === 210, 'camera first')
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
  console.log('ok plan injects setpts')
}

testParseMeta()
testStartLag()
testComputeDrift()
testSetptsAndReviewMap()
testPlanInjectsSetpts()
console.log('smoke:camera-sync passed')
