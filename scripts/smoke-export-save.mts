/**
 * Smoke checks for Save As path helpers (no Electron / no dialog).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  assertSafeSaveDestination,
  defaultExportBasename,
  ensureExportExtension,
  ensureMp4Extension,
  resolveDocumentsDefaultPath,
  sanitizeExportBasename,
} from '../dist-electron/electron/ffmpeg/savePath.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testNaming(): void {
  const fixed = new Date(Date.UTC(2026, 6, 10, 4, 55, 30))
  // Local timezone may differ from UTC — only assert shape.
  const name = defaultExportBasename(fixed)
  assert(/^ScreenFlow-\d{8}-\d{6}\.mp4$/.test(name), `basename shape: ${name}`)
  assert(ensureMp4Extension('clip') === 'clip.mp4', 'ensure mp4')
  assert(ensureMp4Extension('clip.MP4') === 'clip.MP4', 'ensure keeps existing')
  assert(ensureExportExtension('clip.mp4', 'webm') === 'clip.webm', 'swap to webm')
  assert(sanitizeExportBasename('../../evil.mp4') === 'evil.mp4', 'strip traversal')
  assert(sanitizeExportBasename('a:b|c?.mp4') === 'a_b_c_.mp4', 'sanitize chars')
  assert(sanitizeExportBasename('plain') === 'plain.mp4', 'add extension')
  assert(sanitizeExportBasename('plain', 'gif') === 'plain.gif', 'gif extension')
  console.log('ok naming')
}

function testDocumentsDefault(): void {
  const docs = path.join(os.tmpdir(), 'sf-docs-fake')
  const dest = resolveDocumentsDefaultPath(docs, new Date(2026, 0, 2, 3, 4, 5), 'demo')
  assert(dest.includes(path.join('Screen Flow')), 'Screen Flow folder')
  assert(dest.endsWith('.mp4'), 'mp4 suffix')
  assert(path.basename(dest) === 'demo.mp4', 'basename from suggestion')
  const gif = resolveDocumentsDefaultPath(docs, new Date(), 'demo', 'gif')
  assert(gif.endsWith('.gif'), 'gif suffix')
  console.log('ok documents default')
}

function testSafeDestination(): void {
  const ok = assertSafeSaveDestination(path.join(os.tmpdir(), 'out.mp4'))
  assert(path.isAbsolute(ok), 'absolute')

  let threw = false
  try {
    assertSafeSaveDestination(path.join(os.tmpdir(), 'out.mov'))
  } catch {
    threw = true
  }
  assert(threw, 'reject non-mp4')

  threw = false
  try {
    assertSafeSaveDestination(path.join(os.tmpdir(), 'out.mp4'), 'gif')
  } catch {
    threw = true
  }
  assert(threw, 'reject mp4 when format is gif')

  threw = false
  try {
    assertSafeSaveDestination('')
  } catch {
    threw = true
  }
  assert(threw, 'reject empty')
  console.log('ok safe destination')
}

function testCopySemantics(): void {
  // Mimic saveExport copy without Electron: copy temp → Documents-like folder.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-save-'))
  const tempMp4 = path.join(root, 'session', 'export.mp4')
  fs.mkdirSync(path.dirname(tempMp4), { recursive: true })
  fs.writeFileSync(tempMp4, Buffer.from('fake-mp4-bytes'))

  const dest = resolveDocumentsDefaultPath(path.join(root, 'Documents'), new Date(), 'Saved')
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(tempMp4, dest)
  assert(fs.readFileSync(dest).equals(Buffer.from('fake-mp4-bytes')), 'bytes match')
  fs.unlinkSync(tempMp4)
  assert(!fs.existsSync(tempMp4), 'temp cleaned')
  fs.rmSync(root, { recursive: true, force: true })
  console.log('ok copy semantics')
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  testNaming()
  testDocumentsDefault()
  testSafeDestination()
  testCopySemantics()
  console.log('smoke export save-as passed')
}
