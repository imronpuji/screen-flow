/**
 * Pure helpers for post-export Save As paths (no Electron dependency).
 * Keep dialog/copy in saveExport.ts so CI can smoke-test naming/validation.
 */

import path from 'node:path'

/** ScreenFlow-YYYYMMDD-HHMMSS.mp4 */
export function defaultExportBasename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `ScreenFlow-${y}${m}${d}-${hh}${mm}${ss}.mp4`
}

/** Strip path separators / nulls from a user-facing basename. */
export function sanitizeExportBasename(name: string): string {
  const base = path.basename(name).replace(/[\0<>:"|?*]/g, '_').trim()
  if (!base || base === '.' || base === '..') {
    return defaultExportBasename()
  }
  return ensureMp4Extension(base)
}

export function ensureMp4Extension(filePath: string): string {
  return filePath.toLowerCase().endsWith('.mp4') ? filePath : `${filePath}.mp4`
}

/**
 * Default Save As location: <Documents>/Screen Flow/<basename>.
 * Caller creates the folder before showing the dialog when needed.
 */
export function resolveDocumentsDefaultPath(
  documentsDir: string,
  now: Date = new Date(),
  fileName?: string,
): string {
  const basename = sanitizeExportBasename(fileName ?? defaultExportBasename(now))
  return path.join(documentsDir, 'Screen Flow', basename)
}

/**
 * Validate a user-chosen absolute destination for the final MP4.
 * Does not restrict to Documents — Save As may pick any writable folder.
 */
export function assertSafeSaveDestination(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Save destination path is required')
  }
  const resolved = path.resolve(filePath.trim())
  if (!path.isAbsolute(resolved)) {
    throw new Error('Save destination must be an absolute path')
  }
  const base = path.basename(resolved)
  if (!base || base === '.' || base === '..') {
    throw new Error('Save destination must include a file name')
  }
  if (!resolved.toLowerCase().endsWith('.mp4')) {
    throw new Error('Save destination must end with .mp4')
  }
  return resolved
}
