/**
 * Smoke checks for export trim helpers + optional ffmpeg -ss/-to encode.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { CursorEvent } from '../shared/cursor.ts'
import {
  applyTrimToCursorEvents,
  normalizeTrim,
  trimDurationMs,
} from '../dist-electron/shared/edit.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testNormalizeTrim(): void {
  const full = 10_000
  const norm = normalizeTrim({ startMs: -500, endMs: 12_000 }, full)
  assert(norm.startMs === 0, 'clamp start')
  assert(norm.endMs === full, 'clamp end')
  assert(trimDurationMs(norm) === full, 'full duration when no trim')
  const inner = normalizeTrim({ startMs: 2000, endMs: 7000 }, full)
  assert(trimDurationMs(inner) === 5000, 'inner trim length')
  console.log('ok normalize trim')
}

function testCursorTrim(): void {
  const events: CursorEvent[] = [
    { t: 100, x: 1, y: 1, kind: 'move' },
    { t: 2500, x: 2, y: 2, kind: 'click', button: 0 },
    { t: 8000, x: 3, y: 3, kind: 'click', button: 0 },
  ]
  const trimmed = applyTrimToCursorEvents(events, { startMs: 2000, endMs: 7000 })
  assert(trimmed.length === 1, 'only in-range click')
  assert(trimmed[0]?.t === 500, 're-based timestamp')
  console.log('ok cursor trim offset')
}

async function testFfmpegTrimEncode(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-trim-'))
  const outPath = path.join(dir, 'trimmed.mp4')

  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      'ffmpeg',
      [
        '-y',
        '-ss',
        '1.000',
        '-f',
        'lavfi',
        '-i',
        'color=c=green:s=320x180:d=4',
        '-to',
        '3.000',
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
      console.log('skip ffmpeg trim encode (ffmpeg not installed)')
      resolve()
    })
    child.on('close', (code) => {
      if (code === 0 && fs.existsSync(outPath) && fs.statSync(outPath).size > 0) {
        console.log('ok ffmpeg trim encode')
        resolve()
        return
      }
      if (code !== 0) {
        reject(new Error(`ffmpeg trim failed: ${stderr.slice(-600)}`))
        return
      }
      resolve()
    })
  })

  fs.rmSync(dir, { recursive: true, force: true })
}

testNormalizeTrim()
testCursorTrim()
await testFfmpegTrimEncode()
console.log('smoke:export-trim ok')
