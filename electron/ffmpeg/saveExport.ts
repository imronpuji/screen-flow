/**
 * After ffmpeg writes temp export.<ext>, offer Save As (Documents/Screen Flow)
 * and copy out of the temp tree. Heavy I/O stays in main.
 */

import { app, dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import {
  DEFAULT_EXPORT_FORMAT,
  normalizeExportFormat,
} from '../../shared/exportFormat.js'
import type { SaveExportRequest, SaveExportResult } from '../../shared/ipc.js'
import { assertUnderScreenFlowTemp } from './transcode.js'
import {
  assertSafeSaveDestination,
  defaultExportBasename,
  resolveDocumentsDefaultPath,
  sanitizeExportBasename,
  saveDialogFilterForFormat,
} from './savePath.js'

function copyFileSync(src: string, dest: string): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(src, dest)
}

/** Best-effort: remove the export file and empty session dir under temp/screen-flow. */
function cleanupTempExport(sourcePath: string): void {
  try {
    if (fs.existsSync(sourcePath)) fs.unlinkSync(sourcePath)
  } catch {
    /* ignore */
  }
  const sessionDir = path.dirname(sourcePath)
  try {
    const left = fs.readdirSync(sessionDir)
    if (left.length === 0) {
      fs.rmdirSync(sessionDir)
    }
  } catch {
    /* ignore */
  }
}

/**
 * Show Save As (or use destinationPath for tests) and copy the temp export out.
 */
export async function saveExportedMp4(
  request: SaveExportRequest,
): Promise<SaveExportResult> {
  const format = normalizeExportFormat(request.format ?? DEFAULT_EXPORT_FORMAT)
  const sourcePath = assertUnderScreenFlowTemp(request.sourcePath)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Export file not found: ${sourcePath}`)
  }
  const stat = fs.statSync(sourcePath)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error('Export file is empty or not a file')
  }

  let destination: string

  if (request.destinationPath != null && request.destinationPath.trim()) {
    // Programmatic path — smoke/tests / automation without a GUI dialog.
    destination = assertSafeSaveDestination(request.destinationPath, format)
  } else {
    const documentsDir = app.getPath('documents')
    const screenFlowDocs = path.join(documentsDir, 'Screen Flow')
    fs.mkdirSync(screenFlowDocs, { recursive: true })

    const defaultPath = resolveDocumentsDefaultPath(
      documentsDir,
      new Date(),
      request.defaultFileName
        ? sanitizeExportBasename(request.defaultFileName, format)
        : defaultExportBasename(new Date(), format),
      format,
    )

    const result = await dialog.showSaveDialog({
      title: 'Save Screen Flow export',
      defaultPath,
      filters: [saveDialogFilterForFormat(format)],
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    })

    if (result.canceled || !result.filePath) {
      return { ok: true, cancelled: true }
    }
    destination = assertSafeSaveDestination(result.filePath, format)
  }

  // Never overwrite the temp source in-place via a confused destination.
  if (path.resolve(destination) === path.resolve(sourcePath)) {
    return {
      ok: true,
      cancelled: false,
      outputPath: sourcePath,
      bytesWritten: stat.size,
    }
  }

  copyFileSync(sourcePath, destination)

  const outStat = fs.statSync(destination)
  if (!outStat.isFile() || outStat.size === 0) {
    throw new Error('Failed to write saved export')
  }

  const cleanupSource = request.cleanupSource !== false
  if (cleanupSource) {
    cleanupTempExport(sourcePath)
  }

  return {
    ok: true,
    cancelled: false,
    outputPath: destination,
    bytesWritten: outStat.size,
  }
}
