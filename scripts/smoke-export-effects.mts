/**
 * Smoke checks for export filter planning (background + cursor + auto-zoom).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CursorEvent } from '../shared/cursor.ts'
import { DEFAULT_BACKGROUND_STYLE } from '../shared/background.ts'
import {
  computeBackgroundCardLayout,
  planBackgroundExport,
  roundedRectAlphaExpr,
} from '../dist-electron/shared/ffmpegBackground.js'
import { buildCursorSendCmd, planCursorExport } from '../dist-electron/shared/ffmpegCursor.js'
import {
  EXPORT_SENDCMD_PLACEHOLDERS,
  planExportFilters,
} from '../dist-electron/shared/ffmpegExport.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testBackgroundLayout(): void {
  const layout = computeBackgroundCardLayout(DEFAULT_BACKGROUND_STYLE, {
    width: 1920,
    height: 1080,
  })
  assert(layout.cardW < layout.frameW, 'card narrower than frame')
  assert(layout.padX > 0, 'horizontal padding')
  const alpha = roundedRectAlphaExpr(14)
  assert(alpha.includes('hypot'), 'rounded alpha uses corner circles')
  assert(roundedRectAlphaExpr(0) === '255', 'zero radius is fully opaque')
  assert(roundedRectAlphaExpr(0, 160) === '160', 'zero radius respects opaque arg')
  console.log('ok background layout')
}

function testBackgroundPlan(): void {
  const plan = planBackgroundExport(DEFAULT_BACKGROUND_STYLE, { width: 320, height: 180 })
  assert(plan.hasBackground, 'background enabled')
  assert(plan.filterComplex.includes('gradients='), 'uses gradients filter')
  assert(plan.filterComplex.includes('overlay='), 'composites card')
  // Default style has radius + shadow → 1-frame mask path (not per-frame geq on video).
  assert(plan.filterComplex.includes('alphamerge'), 'rounded via alphamerge')
  assert(plan.filterComplex.includes('loop=loop=-1:size=1'), 'mask/shadow still is looped')
  assert(plan.filterComplex.includes('boxblur='), 'soft shadow via still boxblur')
  assert(
    !plan.filterComplex.match(/\[vsrc\][^;]*geq=/),
    'geq must not run on the video input',
  )

  const plain = planBackgroundExport(
    { ...DEFAULT_BACKGROUND_STYLE, cornerRadiusPx: 0, shadowEnabled: false },
    { width: 320, height: 180 },
  )
  assert(plain.hasBackground, 'plain background enabled')
  assert(!plain.filterComplex.includes('alphamerge'), 'plain skips mask')
  assert(!plain.filterComplex.includes('boxblur='), 'plain skips shadow')

  const off = planBackgroundExport(
    { ...DEFAULT_BACKGROUND_STYLE, enabled: false },
    { width: 320, height: 180 },
  )
  assert(!off.hasBackground, 'disabled skips background')
  console.log('ok background plan')
}

function testCursorPlan(): void {
  const events: CursorEvent[] = [
    { t: 0, x: 0, y: 0, kind: 'move' },
    { t: 200, x: 160, y: 90, kind: 'click', button: 0 },
  ]
  const cmd = buildCursorSendCmd(events, { width: 320, height: 180 }, 1000, null)
  assert(cmd.includes('drawbox@cursor'), 'cursor sendcmd')
  const plan = planCursorExport(events, { width: 320, height: 180 }, 1000, null)
  assert(plan.hasCursor, 'cursor plan active')
  assert(plan.filterComplex.includes('drawbox@ring'), 'click ring filter')
  console.log('ok cursor plan')
}

function testCompositePlan(): void {
  const events: CursorEvent[] = [{ t: 100, x: 160, y: 90, kind: 'click', button: 0 }]
  const all = planExportFilters(
    { width: 320, height: 180 },
    2000,
    {
      autoZoom: { events },
      background: DEFAULT_BACKGROUND_STYLE,
      cursorSmoothing: { events },
    },
  )
  assert(all.filterComplex != null, 'uses filter_complex')
  assert(all.autoZoomApplied, 'zoom baked')
  assert(all.backgroundApplied, 'background baked')
  assert(all.cursorApplied, 'cursor baked')
  assert(all.filterComplex!.includes('gradients='), 'gradient in graph')
  assert(all.filterComplex!.includes(EXPORT_SENDCMD_PLACEHOLDERS.cursor), 'cursor path placeholder')
  console.log('ok composite plan')
}

async function testFfmpegBackgroundEncode(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-bg-'))
  const outPath = path.join(dir, 'out.mp4')
  const plan = planExportFilters(
    { width: 320, height: 180 },
    1500,
    { background: DEFAULT_BACKGROUND_STYLE },
  )
  assert(plan.filterComplex != null, 'filter graph for background')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=gray:s=320x180:d=1.5',
        '-filter_complex',
        plan.filterComplex!,
        '-map',
        `[${plan.outputLabel}]`,
        '-t',
        '1.5',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        outPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', () => {
      console.log('skip ffmpeg background encode (ffmpeg not installed)')
      resolve()
    })
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        console.log('ok ffmpeg background encode')
        resolve()
        return
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg background filter failed: ${stderr.slice(-800)}`))
        return
      }
      resolve()
    })
  })
}

/**
 * Encode the FULL composite graph (auto-zoom + background + cursor) through ffmpeg.
 * The cursor tail attaches its output pad to the last filter — a stray comma there
 * makes ffmpeg fail with "No such filter: ''". This guards that regression.
 */
async function testFfmpegCompositeEncode(): Promise<void> {
  const events: CursorEvent[] = [
    { t: 0, x: 0.1, y: 0.1, kind: 'move' },
    { t: 300, x: 0.5, y: 0.5, kind: 'click', button: 0 },
    { t: 900, x: 0.8, y: 0.6, kind: 'move' },
  ]
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-composite-'))
  const outPath = path.join(dir, 'out.mp4')
  const plan = planExportFilters(
    { width: 320, height: 180 },
    1500,
    { autoZoom: { events }, background: DEFAULT_BACKGROUND_STYLE, cursorSmoothing: { events } },
  )
  assert(plan.filterComplex != null, 'filter graph for composite')
  assert(plan.cursorApplied, 'cursor baked into composite')

  let graph = plan.filterComplex!
  const esc = (p: string) => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'")
  if (plan.zoomSendCmd) {
    const zp = path.join(dir, 'zoom.txt')
    fs.writeFileSync(zp, plan.zoomSendCmd)
    graph = graph.replace(EXPORT_SENDCMD_PLACEHOLDERS.zoom, esc(zp))
  }
  if (plan.cursorSendCmd) {
    const cp = path.join(dir, 'cursor.txt')
    fs.writeFileSync(cp, plan.cursorSendCmd)
    graph = graph.replace(EXPORT_SENDCMD_PLACEHOLDERS.cursor, esc(cp))
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-f', 'lavfi',
        '-i', 'color=c=gray:s=320x180:d=1.5',
        '-filter_complex', graph,
        '-map', `[${plan.outputLabel}]`,
        '-t', '1.5',
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        outPath,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )
    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', () => {
      console.log('skip ffmpeg composite encode (ffmpeg not installed)')
      resolve()
    })
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        console.log('ok ffmpeg composite encode')
        resolve()
        return
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg composite filter failed: ${stderr.slice(-800)}`))
        return
      }
      resolve()
    })
  })
}

testBackgroundLayout()
testBackgroundPlan()
testCursorPlan()
testCompositePlan()
await testFfmpegBackgroundEncode()
await testFfmpegCompositeEncode()
console.log('smoke:export-effects ok')
