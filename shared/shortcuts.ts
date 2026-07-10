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
 */
export function matchShortcut(
  event: KeyLike,
  context: ShortcutContext,
): ShortcutAction | null {
  if (hasModifier(event)) return null

  const key = event.key
  const lower = key.length === 1 ? key.toLowerCase() : key

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
