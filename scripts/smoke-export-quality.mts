/**
 * Smoke checks for export quality presets (encoder args + review defaults).
 * Pure Node — no Electron / GUI required.
 */
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_EXPORT_QUALITY,
  EXPORT_QUALITY_PRESETS,
  encoderArgsForQuality,
  getExportQualityPreset,
  libx264FallbackArgs,
  normalizeExportQuality,
} from '../shared/exportQuality.ts'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPresets(): void {
  assert(EXPORT_QUALITY_PRESETS.length === 3, 'three presets')
  const ids = EXPORT_QUALITY_PRESETS.map((p) => p.id)
  assert(ids.includes('draft') && ids.includes('good') && ids.includes('high'), 'ids')
  assert(DEFAULT_EXPORT_QUALITY === 'good', 'default good')
  assert(normalizeExportQuality('nope') === 'good', 'unknown → good')
  assert(normalizeExportQuality('high') === 'high', 'high ok')
  assert(getExportQualityPreset('draft').x264Crf > getExportQualityPreset('high').x264Crf, 'draft crf > high')
  console.log('ok presets')
}

function testEncoderArgs(): void {
  const draftDarwin = encoderArgsForQuality('draft', 'darwin')
  assert(draftDarwin.codec === 'h264_videotoolbox', 'darwin codec')
  assert(draftDarwin.extraArgs.includes('4M'), 'draft bitrate 4M')

  const goodDarwin = encoderArgsForQuality('good', 'darwin')
  assert(goodDarwin.extraArgs.includes('8M'), 'good bitrate 8M')

  const highDarwin = encoderArgsForQuality('high', 'darwin')
  assert(highDarwin.extraArgs.includes('16M'), 'high bitrate 16M')

  const draftLinux = encoderArgsForQuality('draft', 'linux')
  assert(draftLinux.codec === 'libx264', 'linux codec')
  assert(draftLinux.extraArgs.includes('ultrafast'), 'draft preset')
  assert(draftLinux.extraArgs.includes('28'), 'draft crf')

  const goodLinux = encoderArgsForQuality('good', 'linux')
  assert(goodLinux.extraArgs.includes('veryfast') && goodLinux.extraArgs.includes('20'), 'good x264')

  const highLinux = encoderArgsForQuality('high', 'linux')
  assert(highLinux.extraArgs.includes('medium') && highLinux.extraArgs.includes('18'), 'high x264')

  const fallback = libx264FallbackArgs('high')
  assert(fallback.includes('medium') && fallback.includes('18'), 'fallback matches quality')
  console.log('ok encoder args')
}

function testReviewDefault(): void {
  // edit.ts imports .js siblings — load compiled shared after build:electron, or strip-types path.
  // Prefer dist-electron when present (matches other smoke scripts).
  const distEdit = path.join(__dirname, '../dist-electron/shared/edit.js')
  let defaultReviewEdit: (durationMs: number) => {
    exportQuality: string
    exportFormat: string
  }
  try {
    ;({ defaultReviewEdit } = require(distEdit) as typeof import('../dist-electron/shared/edit.js'))
  } catch {
    // Fallback: dynamic import of source via strip-types won't resolve .js — skip if no build.
    console.log('skip review default (run build:electron first)')
    return
  }
  const edit = defaultReviewEdit(5000)
  assert(edit.exportQuality === 'good', 'review default quality')
  assert(edit.exportFormat === 'mp4', 'review default format mp4')
  console.log('ok review default')
}

testPresets()
testEncoderArgs()
testReviewDefault()
console.log('smoke:export-quality passed')
