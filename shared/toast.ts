/**
 * Toast copy helpers for non-blocking success / error feedback (FOKUS 4).
 * Pure — no DOM; renderer owns presentation + auto-dismiss.
 */

export type ToastTone = 'success' | 'info' | 'warn' | 'error'

export type ToastActionId = 'reveal-export'

export interface ToastActionSpec {
  id: ToastActionId
  label: string
  /** Absolute path for reveal-in-folder (export save). */
  filePath?: string
}

export interface ToastSpec {
  tone: ToastTone
  title: string
  body?: string
  /** Auto-dismiss; 0 = sticky until dismissed. */
  durationMs: number
  action?: ToastActionSpec
}

export interface ActiveToast extends ToastSpec {
  id: string
}

export const TOAST_DEFAULT_DURATION_MS = 5200
export const TOAST_ERROR_DURATION_MS = 7200
export const TOAST_INFO_DURATION_MS = 4200

let toastSeq = 0

export function makeToastId(): string {
  toastSeq += 1
  return `toast-${toastSeq}-${Date.now()}`
}

export function makeToast(spec: ToastSpec): ActiveToast {
  return { ...spec, id: makeToastId() }
}

export function exportSavedToast(options: {
  formatLabel: string
  bytesLabel: string
  outputPath: string
}): ToastSpec {
  const base = pathBasename(options.outputPath)
  return {
    tone: 'success',
    title: `Saved ${options.formatLabel}`,
    body: `${options.bytesLabel} · ${base}`,
    durationMs: TOAST_DEFAULT_DURATION_MS,
    action: {
      id: 'reveal-export',
      label: 'Show in folder',
      filePath: options.outputPath,
    },
  }
}

export function exportUnsavedToast(options: {
  formatLabel: string
  bytesLabel: string
}): ToastSpec {
  return {
    tone: 'info',
    title: `Exported ${options.formatLabel}`,
    body: `${options.bytesLabel} · not saved to Documents`,
    durationMs: TOAST_INFO_DURATION_MS,
  }
}

export function exportCancelledToast(): ToastSpec {
  return {
    tone: 'info',
    title: 'Export cancelled',
    durationMs: TOAST_INFO_DURATION_MS,
  }
}

export function exportFailedToast(message: string): ToastSpec {
  const cleaned = message.trim() || 'Export failed'
  return {
    tone: 'error',
    title: 'Export failed',
    body: humanizeExportError(cleaned),
    durationMs: TOAST_ERROR_DURATION_MS,
  }
}

/** Strip stack-ish noise; keep a short actionable line. */
export function humanizeExportError(message: string): string {
  const firstLine = message.split(/\r?\n/)[0]?.trim() ?? message
  if (firstLine.includes('EXPORT_CANCELLED')) {
    return 'Export was cancelled.'
  }
  if (/ENOENT|not found/i.test(firstLine)) {
    return 'Recording file missing — try recording again.'
  }
  if (/permission|EACCES|denied/i.test(firstLine)) {
    return 'Could not write the file — check folder permissions.'
  }
  if (firstLine.length > 160) {
    return `${firstLine.slice(0, 157)}…`
  }
  return firstLine
}

function pathBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || filePath
}
