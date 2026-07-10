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
  console.log('ok background layout')
}

function testBackgroundPlan(): void {
  const plan = planBackgroundExport(DEFAULT_BACKGROUND_STYLE, { width: 320, height: 180 })
  assert(plan.hasBackground, 'background enabled')
  assert(plan.filterComplex.includes('gradients='), 'uses gradients filter')
  assert(plan.filterComplex.includes('overlay='), 'composites card')
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

testBackgroundLayout()
testBackgroundPlan()
testCursorPlan()
testCompositePlan()
await testFfmpegBackgroundEncode()
console.log('smoke:export-effects ok')
