/**
 * Debounced auto-save for non-destructive review edits (FOKUS 5).
 * One slot in renderer localStorage, keyed by the session WebM path.
 * Source media stays untouched — only edit metadata is persisted.
 */

import {
  defaultReviewEdit,
  withKeepRanges,
  type ReviewEditState,
} from './edit.js'
import {
  normalizeBackgroundStyle,
  DEFAULT_BACKGROUND_STYLE,
} from './background.js'
import {
  normalizeCameraOverlay,
  DEFAULT_CAMERA_OVERLAY,
} from './camera.js'
import { normalizeCameraActiveRanges } from './cameraSync.js'
import {
  normalizeCursorAppearance,
  DEFAULT_CURSOR_APPEARANCE,
} from './cursorAppearance.js'
import { normalizeExportFormat, DEFAULT_EXPORT_FORMAT } from './exportFormat.js'
import { normalizeExportQuality, DEFAULT_EXPORT_QUALITY } from './exportQuality.js'
import { defaultKeepRanges, normalizeKeepRanges } from './keepRanges.js'
import {
  clampZoomPeakScale,
  normalizeManualZoomPoint,
  type ManualZoomPoint,
  type ZoomPointOverride,
} from './zoomPoints.js'

export const PROJECT_AUTOSAVE_STORAGE_KEY = 'screen-flow:project-autosave'
/** Debounce window for slider/drag coalescing before write. */
export const PROJECT_AUTOSAVE_DEBOUNCE_MS = 800
export const PROJECT_AUTOSAVE_VERSION = 1 as const

export interface ProjectAutosaveSnapshot {
  version: typeof PROJECT_AUTOSAVE_VERSION
  /** Absolute path to the session capture.webm — identity for restore. */
  webmPath: string
  /** Wall ms when the snapshot was written. */
  savedAt: number
  /** Duration used to clamp keep/trim ranges. */
  durationMs: number
  edit: ReviewEditState
}

function clamp01(value: number, fallback = 0.5): number {
  if (!Number.isFinite(value)) return fallback
  return Math.max(0, Math.min(1, value))
}

function normalizeZoomPointOverrides(raw: unknown): ZoomPointOverride[] {
  if (!Array.isArray(raw)) return []
  const out: ZoomPointOverride[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const index = Number(o.index)
    if (!Number.isInteger(index) || index < 0) continue
    const cleaned: ZoomPointOverride = {
      index,
      enabled: o.enabled !== false,
    }
    if (o.peakScale != null && Number.isFinite(Number(o.peakScale))) {
      cleaned.peakScale = clampZoomPeakScale(Number(o.peakScale))
    }
    if (o.focusX != null) cleaned.focusX = clamp01(Number(o.focusX))
    if (o.focusY != null) cleaned.focusY = clamp01(Number(o.focusY))
    out.push(cleaned)
  }
  return out
}

function normalizeManualZoomPoints(raw: unknown): ManualZoomPoint[] {
  if (!Array.isArray(raw)) return []
  const out: ManualZoomPoint[] = []
  for (const item of raw) {
    const cleaned = normalizeManualZoomPoint(item as ManualZoomPoint)
    if (cleaned) out.push(cleaned)
  }
  return out
}

/**
 * Coerce a partial / untrusted edit blob into a valid ReviewEditState.
 * Falls back field-by-field so corrupt slots never break the editor.
 */
export function normalizeReviewEditState(
  raw: Partial<ReviewEditState> | null | undefined,
  durationMs: number,
): ReviewEditState {
  const base = defaultReviewEdit(durationMs)
  if (!raw || typeof raw !== 'object') return base

  const keepSource =
    Array.isArray(raw.keepRanges) && raw.keepRanges.length > 0
      ? raw.keepRanges
      : raw.trimStartMs != null || raw.trimEndMs != null
        ? [
            {
              startMs: Number(raw.trimStartMs) || 0,
              endMs: Number(raw.trimEndMs) || durationMs,
            },
          ]
        : defaultKeepRanges(durationMs)

  const withKeep = withKeepRanges(
    base,
    normalizeKeepRanges(keepSource, durationMs),
    durationMs,
  )

  let cameraActiveRangesOverride: ReviewEditState['cameraActiveRangesOverride'] = null
  if (raw.cameraActiveRangesOverride === null) {
    cameraActiveRangesOverride = null
  } else if (Array.isArray(raw.cameraActiveRangesOverride)) {
    cameraActiveRangesOverride = normalizeCameraActiveRanges(raw.cameraActiveRangesOverride)
  }

  return {
    ...withKeep,
    autoZoomEnabled: raw.autoZoomEnabled !== false,
    zoomPointOverrides: normalizeZoomPointOverrides(raw.zoomPointOverrides),
    manualZoomPoints: normalizeManualZoomPoints(raw.manualZoomPoints),
    cursorSmoothingEnabled: raw.cursorSmoothingEnabled !== false,
    cursorAppearance: normalizeCursorAppearance(
      raw.cursorAppearance
        ? { ...DEFAULT_CURSOR_APPEARANCE, ...raw.cursorAppearance }
        : { ...DEFAULT_CURSOR_APPEARANCE },
    ),
    background: normalizeBackgroundStyle(
      raw.background
        ? { ...DEFAULT_BACKGROUND_STYLE, ...raw.background }
        : { ...DEFAULT_BACKGROUND_STYLE },
    ),
    cameraOverlay: normalizeCameraOverlay(
      raw.cameraOverlay
        ? { ...DEFAULT_CAMERA_OVERLAY, ...raw.cameraOverlay }
        : DEFAULT_CAMERA_OVERLAY,
    ),
    cameraActiveRangesOverride,
    exportQuality: normalizeExportQuality(
      raw.exportQuality ?? DEFAULT_EXPORT_QUALITY,
    ),
    exportFormat: normalizeExportFormat(raw.exportFormat ?? DEFAULT_EXPORT_FORMAT),
  }
}

export function normalizeProjectAutosaveSnapshot(
  raw: unknown,
  expectedWebmPath?: string,
): ProjectAutosaveSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  if (o.version !== PROJECT_AUTOSAVE_VERSION) return null
  if (typeof o.webmPath !== 'string' || !o.webmPath) return null
  if (expectedWebmPath != null && o.webmPath !== expectedWebmPath) return null
  const durationMs = Number(o.durationMs)
  if (!Number.isFinite(durationMs) || durationMs < 0) return null
  const savedAt = Number(o.savedAt)
  const edit = normalizeReviewEditState(
    o.edit as Partial<ReviewEditState> | null | undefined,
    durationMs,
  )
  return {
    version: PROJECT_AUTOSAVE_VERSION,
    webmPath: o.webmPath,
    savedAt: Number.isFinite(savedAt) ? savedAt : 0,
    durationMs,
    edit,
  }
}

export function loadProjectAutosave(
  webmPath: string,
  durationMs: number,
  storage: Pick<Storage, 'getItem'> = localStorage,
): ReviewEditState | null {
  if (!webmPath) return null
  try {
    const raw = storage.getItem(PROJECT_AUTOSAVE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as unknown
    const snap = normalizeProjectAutosaveSnapshot(parsed, webmPath)
    if (!snap) return null
    // Re-clamp against the live duration (probe may refine after first open).
    return normalizeReviewEditState(snap.edit, durationMs)
  } catch {
    return null
  }
}

export function saveProjectAutosave(
  webmPath: string,
  durationMs: number,
  edit: ReviewEditState,
  storage: Pick<Storage, 'setItem'> = localStorage,
  now = Date.now(),
): ProjectAutosaveSnapshot | null {
  if (!webmPath) return null
  try {
    const snapshot: ProjectAutosaveSnapshot = {
      version: PROJECT_AUTOSAVE_VERSION,
      webmPath,
      savedAt: now,
      durationMs: Math.max(0, durationMs),
      edit: normalizeReviewEditState(edit, durationMs),
    }
    storage.setItem(PROJECT_AUTOSAVE_STORAGE_KEY, JSON.stringify(snapshot))
    return snapshot
  } catch {
    return null
  }
}

/** Remove autosave when it matches this session (discard / export done). */
export function clearProjectAutosave(
  webmPath?: string | null,
  storage: Pick<Storage, 'getItem' | 'removeItem'> = localStorage,
): void {
  try {
    if (webmPath) {
      const raw = storage.getItem(PROJECT_AUTOSAVE_STORAGE_KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as { webmPath?: string }
          if (parsed?.webmPath && parsed.webmPath !== webmPath) return
        } catch {
          /* clear corrupt slot anyway */
        }
      }
    }
    storage.removeItem(PROJECT_AUTOSAVE_STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/** Human-friendly relative label for the subtitle (calm, not a toast). */
export function formatAutosaveLabel(savedAt: number, now = Date.now()): string {
  if (!Number.isFinite(savedAt) || savedAt <= 0) return 'Saved'
  const agoSec = Math.max(0, Math.floor((now - savedAt) / 1000))
  if (agoSec < 3) return 'Saved just now'
  if (agoSec < 60) return `Saved ${agoSec}s ago`
  const agoMin = Math.floor(agoSec / 60)
  if (agoMin < 60) return `Saved ${agoMin}m ago`
  return 'Saved'
}
