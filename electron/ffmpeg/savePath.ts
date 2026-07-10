/**
 * Pure helpers for post-export Save As paths (no Electron dependency).
 * Keep dialog/copy in saveExport.ts so CI can smoke-test naming/validation.
 */

import path from 'node:path'
import {
  DEFAULT_EXPORT_FORMAT,
  defaultExportFileName,
  exportFormatExtension,
  getExportFormatPreset,
  normalizeExportFormat,
  type ExportFormatId,
} from '../../shared/exportFormat.js'

/** ScreenFlow-YYYYMMDD-HHMMSS.<ext> for the given format (default mp4). */
export function defaultExportBasename(
  now: Date = new Date(),
  formatId: ExportFormatId | string | undefined | null = DEFAULT_EXPORT_FORMAT,
): string {
  return defaultExportFileName(formatId, now)
}

/** Strip path separators / nulls from a user-facing basename. */
export function sanitizeExportBasename(
  name: string,
  formatId: ExportFormatId | string | undefined | null = DEFAULT_EXPORT_FORMAT,
): string {
  const format = normalizeExportFormat(formatId)
  const base = path.basename(name).replace(/[\0<>:"|?*]/g, '_').trim()
  if (!base || base === '.' || base === '..') {
    return defaultExportBasename(new Date(), format)
  }
  return ensureExportExtension(base, format)
}

export function ensureMp4Extension(filePath: string): string {
  return ensureExportExtension(filePath, 'mp4')
}

export function ensureExportExtension(
  filePath: string,
  formatId: ExportFormatId | string | undefined | null,
): string {
  const ext = exportFormatExtension(formatId)
  const lower = filePath.toLowerCase()
  if (lower.endsWith(`.${ext}`)) return filePath
  // Replace a known export extension, otherwise append.
  const known = EXPORT_EXTENSIONS.find((e) => lower.endsWith(`.${e}`))
  if (known) {
    return `${filePath.slice(0, -(known.length + 1))}.${ext}`
  }
  return `${filePath}.${ext}`
}

const EXPORT_EXTENSIONS = ['mp4', 'webm', 'gif'] as const

/**
 * Default Save As location: <Documents>/Screen Flow/<basename>.
 * Caller creates the folder before showing the dialog when needed.
 */
export function resolveDocumentsDefaultPath(
  documentsDir: string,
  now: Date = new Date(),
  fileName?: string,
  formatId: ExportFormatId | string | undefined | null = DEFAULT_EXPORT_FORMAT,
): string {
  const format = normalizeExportFormat(formatId)
  const basename = sanitizeExportBasename(
    fileName ?? defaultExportBasename(now, format),
    format,
  )
  return path.join(documentsDir, 'Screen Flow', basename)
}

/**
 * Validate a user-chosen absolute destination for the final export file.
 * Does not restrict to Documents — Save As may pick any writable folder.
 */
export function assertSafeSaveDestination(
  filePath: string,
  formatId: ExportFormatId | string | undefined | null = DEFAULT_EXPORT_FORMAT,
): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Save destination path is required')
  }
  const format = normalizeExportFormat(formatId)
  const ext = exportFormatExtension(format)
  const resolved = path.resolve(filePath.trim())
  if (!path.isAbsolute(resolved)) {
    throw new Error('Save destination must be an absolute path')
  }
  const base = path.basename(resolved)
  if (!base || base === '.' || base === '..') {
    throw new Error('Save destination must include a file name')
  }
  if (!resolved.toLowerCase().endsWith(`.${ext}`)) {
    throw new Error(`Save destination must end with .${ext}`)
  }
  return resolved
}

export function saveDialogFilterForFormat(
  formatId: ExportFormatId | string | undefined | null,
): { name: string; extensions: string[] } {
  const preset = getExportFormatPreset(formatId)
  return { name: preset.dialogFilterName, extensions: [preset.extension] }
}
