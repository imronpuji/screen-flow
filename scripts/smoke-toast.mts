/**
 * Smoke checks for toast copy helpers + reveal path validation (no Electron GUI).
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertRevealableExportPath } from '../electron/ffmpeg/revealExport.ts'
import {
  beautifyAppliedToast,
  exportCancelledToast,
  exportFailedToast,
  exportSavedToast,
  exportUnsavedToast,
  humanizeExportError,
  makeToast,
  TOAST_DEFAULT_DURATION_MS,
  TOAST_INFO_DURATION_MS,
} from '../shared/toast.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testExportToasts(): void {
  const saved = exportSavedToast({
    formatLabel: 'MP4',
    bytesLabel: '12.0 MB',
    outputPath: '/Users/me/Documents/Screen Flow/clip.mp4',
  })
  assert(saved.tone === 'success', 'saved tone')
  assert(saved.title.includes('MP4'), 'saved title')
  assert(saved.body?.includes('clip.mp4'), 'saved basename')
  assert(saved.action?.id === 'reveal-export', 'reveal action')
  assert(saved.action?.filePath?.endsWith('clip.mp4'), 'reveal path')
  assert(saved.durationMs === TOAST_DEFAULT_DURATION_MS, 'duration')

  const active = makeToast(saved)
  assert(typeof active.id === 'string' && active.id.length > 0, 'toast id')
  assert(active.title === saved.title, 'makeToast preserves')

  const unsaved = exportUnsavedToast({ formatLabel: 'WebM', bytesLabel: '1.0 MB' })
  assert(unsaved.tone === 'info', 'unsaved tone')
  assert(unsaved.action == null, 'no reveal when unsaved')

  const cancelled = exportCancelledToast()
  assert(cancelled.tone === 'info', 'cancel tone')
  assert(cancelled.title.toLowerCase().includes('cancel'), 'cancel title')

  const failed = exportFailedToast('ENOENT: no such file')
  assert(failed.tone === 'error', 'fail tone')
  assert(failed.body?.includes('missing'), 'humanized enoent')
  console.log('ok export toasts')
}

function testBeautifyToast(): void {
  const tutorial = beautifyAppliedToast({
    label: 'Tutorial',
    hint: 'Auto-zoom + spotlight cursor · Aurora frame · Good quality',
  })
  assert(tutorial.tone === 'success', 'beautify tone')
  assert(tutorial.title.includes('Tutorial'), 'tutorial title')
  assert((tutorial.body?.length ?? 0) > 0, 'tutorial body')
  assert(tutorial.durationMs === TOAST_INFO_DURATION_MS, 'beautify duration')
  assert(tutorial.action == null, 'no action on beautify')

  const demo = beautifyAppliedToast({ label: 'Product demo' })
  assert(demo.title.includes('Product demo'), 'demo title')
  assert(demo.body == null, 'no hint → no body')

  const blank = beautifyAppliedToast({ label: '  ' })
  assert(blank.title.startsWith('Beautify'), 'blank label fallback')
  console.log('ok beautify toast')
}

function testHumanize(): void {
  assert(
    humanizeExportError('permission denied writing').includes('permissions'),
    'permission',
  )
  assert(humanizeExportError('EXPORT_CANCELLED').includes('cancelled'), 'cancel')
  const long = 'x'.repeat(200)
  assert(humanizeExportError(long).endsWith('…'), 'truncate')
  assert(humanizeExportError(long).length <= 160, 'max len')
  console.log('ok humanize')
}

function testRevealPath(): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'screen-flow-reveal-'))
  const file = path.join(root, 'export.mp4')
  fs.writeFileSync(file, 'fake')

  const ok = assertRevealableExportPath(file)
  assert(ok === path.resolve(file), 'resolve')

  let threw = false
  try {
    assertRevealableExportPath(path.join(root, 'missing.mp4'))
  } catch {
    threw = true
  }
  assert(threw, 'missing file')

  threw = false
  try {
    assertRevealableExportPath(root)
  } catch {
    threw = true
  }
  assert(threw, 'reject directory')

  threw = false
  try {
    assertRevealableExportPath('')
  } catch {
    threw = true
  }
  assert(threw, 'reject empty')

  fs.rmSync(root, { recursive: true, force: true })
  console.log('ok reveal path')
}

testExportToasts()
testBeautifyToast()
testHumanize()
testRevealPath()
console.log('smoke:toast ok')
