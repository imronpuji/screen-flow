/**
 * Keyboard shortcut catalog + pure matcher (no DOM).
 * Used by renderer for setup/recording/review polish.
 */

export type ShortcutContext = 'setup' | 'recording' | 'review' | 'exporting'

export type ShortcutAction =
  | 'toggle-record'
  | 'toggle-play'
  | 'export'
  | 'cancel-export'
  | 'beautify'
  | 'add-zoom'
  | 'scrub-back'
  | 'scrub-forward'
  | 'discard'
  | 'undo'
  | 'redo'
  | 'mark-in'
  | 'mark-out'
  | 'cut-after'
  | 'cut-before'
  | 'split-segment'
  | 'delete-segment'
  | 'timeline-zoom-in'
  | 'timeline-zoom-out'
  | 'timeline-zoom-fit'

export interface ShortcutBinding {
  id: ShortcutAction
  /** Keys shown in UI hints (e.g. "Space", "← / →"). */
  keys: string
  contexts: readonly ShortcutContext[]
  description: string
}

export const SHORTCUTS: readonly ShortcutBinding[] = [
  {
    id: 'toggle-record',
    keys: 'R',
    contexts: ['setup', 'recording'],
    description: 'Start or stop recording',
  },
  {
    id: 'toggle-play',
    keys: 'Space',
    contexts: ['review'],
    description: 'Play or pause preview',
  },
  {
    id: 'export',
    keys: 'E',
    contexts: ['review'],
    description: 'Export MP4',
  },
  {
    id: 'beautify',
    keys: 'B',
    contexts: ['review'],
    description: 'Apply Beautify (Tutorial)',
  },
  {
    id: 'add-zoom',
    keys: 'Z',
    contexts: ['review'],
    description: 'Add zoom at playhead',
  },
  {
    id: 'scrub-back',
    keys: '←',
    contexts: ['review'],
    description: 'Scrub back 1s (Shift 5s)',
  },
  {
    id: 'scrub-forward',
    keys: '→',
    contexts: ['review'],
    description: 'Scrub forward 1s (Shift 5s)',
  },
  {
    id: 'cancel-export',
    keys: 'Esc',
    contexts: ['exporting'],
    description: 'Cancel export',
  },
  {
    id: 'discard',
    keys: 'Esc',
    contexts: ['review'],
    description: 'Back to new recording',
  },
  {
    id: 'undo',
    keys: '⌘Z / Ctrl+Z',
    contexts: ['review'],
    description: 'Undo last edit',
  },
  {
    id: 'redo',
    keys: '⌘⇧Z / Ctrl+Shift+Z',
    contexts: ['review'],
    description: 'Redo last edit',
  },
  {
    id: 'mark-in',
    keys: '[',
    contexts: ['review'],
    description: 'Mark In — trim start at playhead',
  },
  {
    id: 'mark-out',
    keys: ']',
    contexts: ['review'],
    description: 'Mark Out — trim end at playhead',
  },
  {
    id: 'cut-after',
    keys: 'S',
    contexts: ['review'],
    description: 'Cut after playhead (keep before)',
  },
  {
    id: 'cut-before',
    keys: '⇧S',
    contexts: ['review'],
    description: 'Cut before playhead (keep after)',
  },
  {
    id: 'split-segment',
    keys: 'X',
    contexts: ['review'],
    description: 'Razor split keep-range at playhead',
  },
  {
    id: 'delete-segment',
    keys: 'Delete',
    contexts: ['review'],
    description: 'Delete keep-range under playhead',
  },
  {
    id: 'timeline-zoom-in',
    keys: '=',
    contexts: ['review'],
    description: 'Zoom timeline in',
  },
  {
    id: 'timeline-zoom-out',
    keys: '-',
    contexts: ['review'],
    description: 'Zoom timeline out',
  },
  {
    id: 'timeline-zoom-fit',
    keys: '0',
    contexts: ['review'],
    description: 'Fit timeline (1×)',
  },
] as const

export const SCRUB_STEP_MS = 1000
export const SCRUB_STEP_SHIFT_MS = 5000

/** True when the event target is a text field / select — shortcuts should not fire. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false
  const el = target as {
    tagName?: string
    isContentEditable?: boolean
    closest?: (selector: string) => unknown
  }
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  if (typeof el.closest === 'function') {
    return Boolean(el.closest('[contenteditable="true"]'))
  }
  return false
}

export interface KeyLike {
  key: string
  code?: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
}

function hasModifier(event: KeyLike): boolean {
  return Boolean(event.metaKey || event.ctrlKey || event.altKey)
}

/**
 * Map a keydown to a shortcut action for the current app context.
 * Returns null when no binding matches (or modifiers would conflict).
 * Undo/redo are the only review actions that require ⌘/Ctrl.
 */
export function matchShortcut(
  event: KeyLike,
  context: ShortcutContext,
): ShortcutAction | null {
  const key = event.key
  const lower = key.length === 1 ? key.toLowerCase() : key
  const mod = Boolean(event.metaKey || event.ctrlKey)

  // Undo / redo (review only) — allow primary modifier; reject Alt.
  if (context === 'review' && mod && !event.altKey && lower === 'z') {
    if (event.shiftKey) return 'redo'
    return 'undo'
  }
  if (
    context === 'review' &&
    mod &&
    !event.altKey &&
    !event.shiftKey &&
    lower === 'y'
  ) {
    // Ctrl+Y redo (Windows/Linux habit); Meta+Y ignored on macOS menus usually.
    if (event.ctrlKey && !event.metaKey) return 'redo'
  }

  if (hasModifier(event)) return null

  if (context === 'exporting') {
    if (key === 'Escape') return 'cancel-export'
    return null
  }

  if (context === 'setup' || context === 'recording') {
    if (lower === 'r') return 'toggle-record'
    // Space also toggles record in setup/recording (not review — Space = play there).
    if (key === ' ' || key === 'Spacebar' || event.code === 'Space') {
      return 'toggle-record'
    }
    if (context === 'recording' && key === 'Escape') return 'toggle-record'
    return null
  }

  // review
  if (key === ' ' || key === 'Spacebar' || event.code === 'Space') return 'toggle-play'
  if (lower === 'e') return 'export'
  if (lower === 'b') return 'beautify'
  if (lower === 'z') return 'add-zoom'
  if (key === 'ArrowLeft') return 'scrub-back'
  if (key === 'ArrowRight') return 'scrub-forward'
  if (key === '[') return 'mark-in'
  if (key === ']') return 'mark-out'
  // S = cut after (keep before); Shift+S = cut before (keep after).
  if (lower === 's') return event.shiftKey ? 'cut-before' : 'cut-after'
  // X = razor split into multi-segment keep-ranges (S stays keep-before).
  if (lower === 'x') return 'split-segment'
  if (key === 'Delete' || key === 'Backspace') return 'delete-segment'
  // Timeline scrubber zoom (= / + zoom in, - zoom out, 0 fit).
  if (key === '=' || key === '+') return 'timeline-zoom-in'
  if (key === '-' || key === '_') return 'timeline-zoom-out'
  if (key === '0') return 'timeline-zoom-fit'
  if (key === 'Escape') return 'discard'
  return null
}

export function shortcutsForContext(
  context: ShortcutContext,
): readonly ShortcutBinding[] {
  return SHORTCUTS.filter((s) => s.contexts.includes(context))
}

export function scrubDeltaMs(shiftKey: boolean): number {
  return shiftKey ? SCRUB_STEP_SHIFT_MS : SCRUB_STEP_MS
}
