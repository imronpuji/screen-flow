/**
 * Smoke checks for export format presets (MP4 / WebM / GIF) + save-path helpers.
 * Pure Node — no Electron / GUI required. Optional live ffmpeg encode for GIF/WebM.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_EXPORT_FORMAT,
  EXPORT_FORMAT_PRESETS,
  appendGifPaletteFilters,
  buildGifFilterFromInput,
  defaultExportFileName,
  exportFormatExtension,
  getExportFormatPreset,
  gifEncoderArgs,
  gifOptionsForQuality,
  normalizeExportFormat,
  webmEncoderArgsForQuality,
} from '../dist-electron/shared/exportFormat.js'
import {
  assertSafeSaveDestination,
  defaultExportBasename,
  ensureExportExtension,
  ensureMp4Extension,
  resolveDocumentsDefaultPath,
  sanitizeExportBasename,
  saveDialogFilterForFormat,
} from '../dist-electron/electron/ffmpeg/savePath.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPresets(): void {
  assert(EXPORT_FORMAT_PRESETS.length === 3, 'three formats')
  const ids = EXPORT_FORMAT_PRESETS.map((p) => p.id)
  assert(ids.includes('mp4') && ids.includes('webm') && ids.includes('gif'), 'ids')
  assert(DEFAULT_EXPORT_FORMAT === 'mp4', 'default mp4')
  assert(normalizeExportFormat('nope') === 'mp4', 'unknown → mp4')
  assert(normalizeExportFormat('gif') === 'gif', 'gif ok')
  assert(exportFormatExtension('webm') === 'webm', 'webm ext')
  assert(getExportFormatPreset('gif').supportsAudio === false, 'gif no audio')
  assert(getExportFormatPreset('mp4').supportsAudio === true, 'mp4 audio')
  console.log('ok presets')
}

function testGifOptions(): void {
  assert(gifOptionsForQuality('draft').fps === 8, 'draft fps')
  assert(gifOptionsForQuality('draft').maxWidth === 480, 'draft width')
  assert(gifOptionsForQuality('good').fps === 12, 'good fps')
  assert(gifOptionsForQuality('high').maxWidth === 1080, 'high width')
  const gif = appendGifPaletteFilters('vout', { fps: 12, maxWidth: 720 })
  assert(gif.filter.includes('palettegen'), 'palettegen')
  assert(gif.filter.includes('paletteuse'), 'paletteuse')
  assert(gif.filter.includes('[vout]'), 'reads vout')
  assert(gif.outputLabel === 'vgif', 'vgif label')
  const fromInput = buildGifFilterFromInput(0, { fps: 8, maxWidth: 480 })
  assert(fromInput.filterComplex.startsWith('[0:v]'), 'from input 0')
  assert(gifEncoderArgs().codec === 'gif', 'gif codec')
  console.log('ok gif options')
}

function testWebmEncoder(): void {
  const draft = webmEncoderArgsForQuality('draft')
  assert(draft.codec === 'libvpx-vp9', 'vp9')
  assert(draft.extraArgs.includes('40'), 'draft crf 40')
  const high = webmEncoderArgsForQuality('high')
  assert(high.extraArgs.includes('28'), 'high crf 28')
  console.log('ok webm encoder')
}

function testSavePaths(): void {
  const fixed = new Date(Date.UTC(2026, 6, 10, 4, 55, 30))
  const mp4 = defaultExportBasename(fixed, 'mp4')
  assert(/^ScreenFlow-\d{8}-\d{6}\.mp4$/.test(mp4), `mp4 basename: ${mp4}`)
  const webm = defaultExportFileName('webm', fixed)
  assert(webm.endsWith('.webm'), 'webm name')
  const gif = defaultExportBasename(fixed, 'gif')
  assert(gif.endsWith('.gif'), 'gif name')

  assert(ensureMp4Extension('clip') === 'clip.mp4', 'ensure mp4')
  assert(ensureExportExtension('clip.mp4', 'gif') === 'clip.gif', 'swap ext')
  assert(ensureExportExtension('clip', 'webm') === 'clip.webm', 'add webm')
  assert(sanitizeExportBasename('../../evil.gif', 'gif') === 'evil.gif', 'strip')
  assert(sanitizeExportBasename('plain', 'webm') === 'plain.webm', 'add on sanitize')

  const dest = resolveDocumentsDefaultPath(
    path.join(os.tmpdir(), 'sf-docs'),
    fixed,
    'demo',
    'gif',
  )
  assert(dest.endsWith('.gif'), 'docs gif')
  assert(path.basename(dest) === 'demo.gif', 'basename gif')

  assertSafeSaveDestination(path.join(os.tmpdir(), 'out.webm'), 'webm')
  let threw = false
  try {
    assertSafeSaveDestination(path.join(os.tmpdir(), 'out.mp4'), 'gif')
  } catch {
    threw = true
  }
  assert(threw, 'reject wrong ext for format')

  const filter = saveDialogFilterForFormat('gif')
  assert(filter.extensions[0] === 'gif', 'dialog filter')
  console.log('ok save paths')
}

function runFfmpeg(args: string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', (c: Buffer) => {
      stderr += c.toString('utf8')
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg ${code}: ${stderr.slice(-400)}`))
        return
      }
      resolve(code ?? 1)
    })
  })
}

async function testLiveEncode(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sf-export-format-'))
  const src = path.join(root, 'src.mp4')
  // Tiny synthetic source (0.4s color bars).
  await runFfmpeg([
    '-y',
    '-f',
    'lavfi',
    '-i',
    'color=c=blue:s=320x180:d=0.4',
    '-pix_fmt',
    'yuv420p',
    src,
  ])

  const gifOut = path.join(root, 'out.gif')
  const gif = buildGifFilterFromInput(0, gifOptionsForQuality('draft'))
  await runFfmpeg([
    '-y',
    '-i',
    src,
    '-filter_complex',
    gif.filterComplex,
    '-map',
    `[${gif.outputLabel}]`,
    '-c:v',
    'gif',
    '-an',
    gifOut,
  ])
  assert(fs.existsSync(gifOut) && fs.statSync(gifOut).size > 100, 'gif bytes')

  const webmOut = path.join(root, 'out.webm')
  const webm = webmEncoderArgsForQuality('draft')
  await runFfmpeg([
    '-y',
    '-i',
    src,
    '-c:v',
    webm.codec,
    ...webm.extraArgs,
    '-pix_fmt',
    'yuv420p',
    '-an',
    webmOut,
  ])
  assert(fs.existsSync(webmOut) && fs.statSync(webmOut).size > 100, 'webm bytes')

  fs.rmSync(root, { recursive: true, force: true })
  console.log('ok live encode gif+webm')
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  testPresets()
  testGifOptions()
  testWebmEncoder()
  testSavePaths()
  await testLiveEncode()
  console.log('smoke export format passed')
}
