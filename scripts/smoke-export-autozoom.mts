/**
 * Smoke checks for ffmpeg auto-zoom sendcmd generation (+ optional lavfi encode).
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CursorEvent } from '../shared/cursor.ts'
import { buildZoomSegments } from '../dist-electron/shared/autozoom.js'
import {
  buildZoomSendCmd,
  computeCropRect,
  evenDimension,
  planAutoZoomExport,
} from '../dist-electron/shared/ffmpegZoom.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testCropMath(): void {
  const rect = computeCropRect(1.6, 0.5, 0.5, 1920, 1080)
  assert(rect.w === evenDimension(1920 / 1.6), 'crop width at peak')
  assert(rect.h === evenDimension(1080 / 1.6), 'crop height at peak')
  assert(rect.x >= 0 && rect.y >= 0, 'crop origin in bounds')
  console.log('ok crop math')
}

function testSendCmd(): void {
  const events: CursorEvent[] = [
    { t: 500, x: 960, y: 540, kind: 'click', button: 0 },
  ]
  const videoSize = { width: 1920, height: 1080 }
  const segments = buildZoomSegments(events, videoSize)
  const cmd = buildZoomSendCmd(segments, videoSize, 3000)
  assert(cmd.includes('crop w'), 'sendcmd crop width')
  assert(cmd.split('\n').length >= 3, 'multiple keyframes for zoom ramp')
  console.log('ok sendcmd')
}

function testPlan(): void {
  const plan = planAutoZoomExport(
    [{ t: 100, x: 100, y: 100, kind: 'click', button: 0 }],
    { width: 1280, height: 720 },
    5000,
  )
  assert(plan.hasZoom, 'plan has zoom')
  assert(plan.videoFilter.includes('crop@z='), 'filter names crop')
  assert(plan.videoFilter.includes('sendcmd=f=__SENDCMD_PATH__'), 'filter placeholder path')
  const idle = planAutoZoomExport([], { width: 1280, height: 720 }, 1000)
  assert(!idle.hasZoom, 'no events → no zoom')
  console.log('ok plan')
}

async function testFfmpegSendcmdFilter(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-zoom-'))
  const cmdPath = path.join(dir, 'zoom.txt')
  const outPath = path.join(dir, 'out.mp4')

  const events: CursorEvent[] = [{ t: 200, x: 160, y: 90, kind: 'click', button: 0 }]
  const plan = planAutoZoomExport(events, { width: 320, height: 180 }, 2000)
  fs.writeFileSync(cmdPath, plan.sendCmd, 'utf8')
  const vf = plan.videoFilter.replace('__SENDCMD_PATH__', cmdPath.replace(/:/g, '\\:'))

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:d=2',
        '-vf',
        vf,
        '-t',
        '2',
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
      console.log('skip ffmpeg encode (ffmpeg not installed)')
      resolve()
    })
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        console.log('ok ffmpeg sendcmd encode')
        resolve()
        return
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg zoom filter failed: ${stderr.slice(-600)}`))
        return
      }
      resolve()
    })
  })
}

testCropMath()
testSendCmd()
testPlan()
await testFfmpegSendcmdFilter()
console.log('smoke:export-autozoom ok')
