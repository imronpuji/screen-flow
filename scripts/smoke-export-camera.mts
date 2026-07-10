/**
 * Smoke checks for FaceTime/webcam ffmpeg overlay bake (plan + real encode).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DEFAULT_CAMERA_OVERLAY } from '../shared/camera.ts'
import { DEFAULT_BACKGROUND_STYLE } from '../shared/background.ts'
import {
  circleAlphaExpr,
  planCameraExport,
  roundedBubbleAlphaExpr,
} from '../dist-electron/shared/ffmpegCamera.js'
import { planExportFilters } from '../dist-electron/shared/ffmpegExport.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testAlphaExprs(): void {
  const circle = circleAlphaExpr()
  assert(circle.includes('hypot'), 'circle uses hypot')
  assert(circle.includes('W/2'), 'circle radius W/2')
  const rounded = roundedBubbleAlphaExpr(200)
  assert(rounded.includes('hypot'), 'rounded uses corner circles')
  assert(roundedBubbleAlphaExpr(0).includes('2'), 'tiny bubble still has radius floor')
  console.log('ok camera alpha exprs')
}

function testCameraPlan(): void {
  const style = {
    ...DEFAULT_CAMERA_OVERLAY,
    enabled: true,
    corner: 'bottom-right' as const,
    sizePercent: 20,
    shape: 'circle' as const,
  }
  const plan = planCameraExport(style, { width: 320, height: 180 }, 'vbase', 'vout', 1)
  assert(plan.hasCamera, 'camera enabled')
  assert(plan.filterComplex.includes('[1:v]'), 'reads camera input 1')
  assert(plan.filterComplex.includes('fps=30'), 'normalizes camera fps')
  assert(plan.filterComplex.includes('alphamerge'), '1-frame mask alphamerge')
  assert(plan.filterComplex.includes('loop=loop=-1:size=1'), 'mask still looped')
  assert(plan.filterComplex.includes('overlay='), 'overlays bubble')
  assert(plan.filterComplex.includes('format=yuv420p'), 'forces yuv420p for libx264')
  assert(plan.filterComplex.includes('boxblur='), 'default shadow blur')
  assert(plan.shadowApplied === true, 'default shadow applied')
  assert(plan.borderApplied === true, 'default border applied')
  assert(plan.filterComplex.includes('0xE8EEF4'), 'default border color plate')
  assert(plan.overlay.w === 64, `bubble w even (got ${plan.overlay.w})`)
  assert(plan.overlay.x > 200, 'bottom-right x near right')
  assert(plan.mirroredApplied === true, 'default mirror hflip')
  assert(plan.filterComplex.includes('hflip'), 'hflip in graph')
  assert(plan.opacityApplied === false, 'default full opacity')

  const natural = planCameraExport(
    { ...style, mirrored: false },
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
  )
  assert(natural.mirroredApplied === false, 'mirror off')
  assert(!natural.filterComplex.includes('hflip'), 'no hflip when natural')

  const faded = planCameraExport(
    { ...style, opacity: 0.6, shadowEnabled: false, borderEnabled: false },
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
  )
  assert(faded.opacityApplied === true, 'opacity applied')
  assert(faded.filterComplex.includes('a=153') || faded.filterComplex.includes("a='"), 'faded alpha')

  const off = planCameraExport(
    { ...style, enabled: false },
    { width: 320, height: 180 },
  )
  assert(!off.hasCamera, 'disabled skips camera')
  assert(!off.shadowApplied && !off.borderApplied, 'disabled skips chrome')

  const bare = planCameraExport(
    { ...style, shadowEnabled: false, borderEnabled: false },
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
  )
  assert(bare.hasCamera, 'bare camera on')
  assert(!bare.shadowApplied, 'shadow off')
  assert(!bare.borderApplied, 'border off')
  assert(!bare.filterComplex.includes('boxblur='), 'no shadow blur when off')

  const rectPlan = planCameraExport(
    { ...style, shape: 'rectangle', borderEnabled: true, borderWidthPx: 3 },
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
  )
  assert(rectPlan.hasCamera, 'rectangle enabled')
  // Rectangle camera video itself skips alphamerge; border plate may still use loop.
  assert(rectPlan.filterComplex.includes('overlay='), 'rectangle still overlays')
  assert(rectPlan.filterComplex.includes('format=yuv420p'), 'rectangle yuv420p')
  assert(rectPlan.borderApplied, 'rectangle border on')
  assert(rectPlan.mirroredApplied, 'rectangle still mirrored by default')

  const rectFade = planCameraExport(
    {
      ...style,
      shape: 'rectangle',
      opacity: 0.5,
      shadowEnabled: false,
      borderEnabled: false,
      mirrored: false,
    },
    { width: 320, height: 180 },
    'vbase',
    'vout',
    1,
  )
  assert(rectFade.opacityApplied, 'rect opacity')
  assert(rectFade.filterComplex.includes('colorchannelmixer=aa=0.5'), 'rect aa mixer')
  console.log('ok camera plan')
}

function testCompositeWithCamera(): void {
  const style = { ...DEFAULT_CAMERA_OVERLAY, enabled: true, shape: 'rounded' as const }
  const plan = planExportFilters({ width: 320, height: 180 }, 1500, {
    background: DEFAULT_BACKGROUND_STYLE,
    camera: { style },
  })
  assert(plan.filterComplex != null, 'filter_complex when camera on')
  assert(plan.cameraApplied, 'cameraApplied')
  assert(plan.backgroundApplied, 'backgroundApplied')
  assert(plan.filterComplex!.includes('[1:v]'), 'camera input in graph')
  assert(plan.filterComplex!.includes('alphamerge'), 'camera mask')
  assert(plan.outputLabel === 'vout', 'final label vout')
  console.log('ok composite with camera')
}

async function runFfmpeg(args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => {
      if (stderr.length < 32_000) stderr += c.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }))
  })
}

async function testFfmpegCameraEncode(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-cam-'))
  const outPath = path.join(dir, 'out.mp4')
  const style = {
    ...DEFAULT_CAMERA_OVERLAY,
    enabled: true,
    corner: 'bottom-left' as const,
    sizePercent: 25,
    shape: 'circle' as const,
  }
  const plan = planExportFilters({ width: 320, height: 180 }, 1200, {
    camera: { style, inputIndex: 1 },
  })
  assert(plan.filterComplex != null, 'camera graph')
  assert(plan.cameraApplied, 'camera applied')

  const result = await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=gray:s=320x180:d=1.2',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=640x480:d=1.2',
    '-filter_complex',
    plan.filterComplex!,
    '-map',
    `[${plan.outputLabel}]`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    '1.2',
    outPath,
  ])

  assert(result.code === 0, `ffmpeg camera encode failed: ${result.stderr.slice(-600)}`)
  assert(fs.existsSync(outPath) && fs.statSync(outPath).size > 500, 'mp4 written')

  // Rectangle path (no camera alphamerge) must also encode cleanly.
  const rectOut = path.join(dir, 'out-rect.mp4')
  const rectPlan = planExportFilters({ width: 320, height: 180 }, 1200, {
    camera: {
      style: {
        ...style,
        shape: 'rectangle',
        corner: 'top-right',
        sizePercent: 30,
        shadowEnabled: true,
        borderEnabled: true,
        borderWidthPx: 2,
      },
      inputIndex: 1,
    },
  })
  assert(rectPlan.filterComplex != null, 'rectangle graph')
  assert(rectPlan.filterComplex!.includes('boxblur='), 'rectangle shadow blur')
  const rectResult = await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=gray:s=320x180:d=1.2',
    '-f',
    'lavfi',
    '-i',
    'color=c=green:s=640x480:d=1.2',
    '-filter_complex',
    rectPlan.filterComplex!,
    '-map',
    `[${rectPlan.outputLabel}]`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    '1.2',
    rectOut,
  ])
  assert(rectResult.code === 0, `ffmpeg rectangle encode failed: ${rectResult.stderr.slice(-600)}`)
  assert(fs.existsSync(rectOut) && fs.statSync(rectOut).size > 500, 'rectangle mp4 written')

  // Chrome-off path still encodes (no shadow/border stills).
  const bareOut = path.join(dir, 'out-bare.mp4')
  const barePlan = planExportFilters({ width: 320, height: 180 }, 1200, {
    camera: {
      style: { ...style, shadowEnabled: false, borderEnabled: false },
      inputIndex: 1,
    },
  })
  assert(barePlan.filterComplex != null, 'bare graph')
  assert(!barePlan.filterComplex!.includes('boxblur='), 'bare skips shadow')
  const bareResult = await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=gray:s=320x180:d=1.2',
    '-f',
    'lavfi',
    '-i',
    'color=c=red:s=640x480:d=1.2',
    '-filter_complex',
    barePlan.filterComplex!,
    '-map',
    `[${barePlan.outputLabel}]`,
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-pix_fmt',
    'yuv420p',
    '-t',
    '1.2',
    bareOut,
  ])
  assert(bareResult.code === 0, `ffmpeg bare encode failed: ${bareResult.stderr.slice(-600)}`)
  assert(fs.existsSync(bareOut) && fs.statSync(bareOut).size > 500, 'bare mp4 written')
  console.log('ok ffmpeg camera encode')
}

async function main(): Promise<void> {
  testAlphaExprs()
  testCameraPlan()
  testCompositeWithCamera()
  await testFfmpegCameraEncode()
  console.log('smoke-export-camera: all ok')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
