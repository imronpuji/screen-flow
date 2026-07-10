/**
 * Persist export format + quality prefs across sessions (renderer localStorage).
 * Users often pick WebM/GIF or Draft/High once; restore on the next review.
 */

import {
  DEFAULT_EXPORT_FORMAT,
  normalizeExportFormat,
  type ExportFormatId,
} from './exportFormat.js'
import {
  DEFAULT_EXPORT_QUALITY,
  normalizeExportQuality,
  type ExportQualityId,
} from './exportQuality.js'

export const EXPORT_PREFS_STORAGE_KEY = 'screen-flow:export-prefs'

export interface ExportPrefs {
  format: ExportFormatId
  quality: ExportQualityId
}

export const DEFAULT_EXPORT_PREFS: ExportPrefs = {
  format: DEFAULT_EXPORT_FORMAT,
  quality: DEFAULT_EXPORT_QUALITY,
}

export function normalizeExportPrefs(
  prefs: Partial<ExportPrefs> | null | undefined,
): ExportPrefs {
  return {
    format: normalizeExportFormat(prefs?.format ?? DEFAULT_EXPORT_FORMAT),
    quality: normalizeExportQuality(prefs?.quality ?? DEFAULT_EXPORT_QUALITY),
  }
}

export function loadExportPrefs(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ExportPrefs {
  try {
    const raw = storage.getItem(EXPORT_PREFS_STORAGE_KEY)
    if (!raw) return { ...DEFAULT_EXPORT_PREFS }
    const parsed = JSON.parse(raw) as Partial<ExportPrefs>
    return normalizeExportPrefs({
      ...DEFAULT_EXPORT_PREFS,
      ...parsed,
    })
  } catch {
    return { ...DEFAULT_EXPORT_PREFS }
  }
}

export function saveExportPrefs(
  prefs: ExportPrefs,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    const normalized = normalizeExportPrefs(prefs)
    storage.setItem(EXPORT_PREFS_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    /* private mode / quota — ignore */
  }
}

/** Clear saved prefs (tests / reset). */
export function clearExportPrefs(
  storage: Pick<Storage, 'removeItem'> = localStorage,
): void {
  try {
    storage.removeItem(EXPORT_PREFS_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}
