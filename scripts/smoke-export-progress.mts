/**
 * Smoke checks for ffmpeg progress parsers + cancel-via-SIGTERM behavior.
 * Runs without Electron (pure Node) so CI/Linux agents stay green.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  clampPercent,
  parseFfmpegDurationSec,
  parseFfmpegTimeSec,
} from '../electron/ffmpeg/progress.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testParsers(): void {
  assert(parseFfmpegDurationSec('Duration: 00:01:30.50, start:') === 90.5, 'duration parse')
  assert(parseFfmpegDurationSec('no duration here') === undefined, 'duration miss')
  assert(parseFfmpegTimeSec('out_time_ms=2500000\n') === 2.5, 'out_time_ms (µs)')
  assert(parseFfmpegTimeSec('frame= 10 time=00:00:05.00 bitrate=') === 5, 'time= fallback')
  assert(clampPercent(150) === 100, 'clamp high')
  assert(clampPercent(-3) === 0, 'clamp low')
  assert(clampPercent(42.4) === 42, 'clamp round')
  console.log('ok parsers')
}

async function testCancelSigterm(): Promise<void> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-cancel-'))
  const out = path.join(dir, 'slow.mp4')

  // Long synthetic encode so we have time to SIGTERM mid-flight.
  const child = spawn(
    'ffmpeg',
    [
      '-y',
      '-f',
      'lavfi',
      '-i',
      'testsrc=size=640x360:rate=30',
      '-t',
      '30',
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-progress',
      'pipe:2',
      '-nostats',
      out,
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )

  let sawProgress = false
  child.stderr?.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8')
    if (parseFfmpegTimeSec(text) != null) sawProgress = true
  })

  await new Promise((r) => setTimeout(r, 400))
  const killed = child.kill('SIGTERM')
  assert(killed, 'SIGTERM sent')

  const closeResult = await new Promise<{
    code: number | null
    signal: NodeJS.Signals | null
  }>((resolve) => {
    child.on('close', (code, sig) => resolve({ code, signal: sig }))
  })

  // Success = process stopped early (signal or non-zero), not a clean 30s encode.
  const stoppedEarly =
    closeResult.signal === 'SIGTERM' ||
    closeResult.signal === 'SIGKILL' ||
    (closeResult.code != null && closeResult.code !== 0)
  assert(stoppedEarly, `expected early stop, got code=${closeResult.code} signal=${closeResult.signal}`)
  console.log(
    `ok cancel (code=${closeResult.code}, signal=${closeResult.signal}, progressSeen=${sawProgress})`,
  )

  fs.rmSync(dir, { recursive: true, force: true })
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  testParsers()
  await testCancelSigterm()
  console.log('smoke export progress/cancel passed')
}
