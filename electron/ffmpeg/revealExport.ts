/**
 * Validate a path before shell.showItemInFolder (FOKUS 4 export polish).
 * Pure enough for smoke tests — no Electron import.
 */

import fs from 'node:fs'
import path from 'node:path'

export function assertRevealableExportPath(filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Reveal path required')
  }
  const resolved = path.resolve(filePath.trim())
  if (!path.isAbsolute(resolved)) {
    throw new Error('Reveal path must be absolute')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Export file not found')
  }
  const stat = fs.statSync(resolved)
  if (!stat.isFile()) {
    throw new Error('Reveal path must be a file')
  }
  return resolved
}
