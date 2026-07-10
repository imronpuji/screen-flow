/**
 * Empty-state & disabled-control copy for Screen Flow.
 * Keep messages short, non-technical, and actionable for first-time users.
 */

export type TooltipId =
  | 'start-disabled-no-electron'
  | 'start-disabled-no-source'
  | 'start-disabled-permission'
  | 'start-disabled-busy'
  | 'start-ready'
  | 'stop-recording'
  | 'refresh-sources'
  | 'sources-empty'
  | 'sources-browser'
  | 'permission-denied'
  | 'camera-off'
  | 'camera-no-device'
  | 'camera-review-empty'
  | 'zoom-empty'
  | 'export-ready'
  | 'export-size'
  | 'beautify'
  | 'discard-review'
  | 'discard-confirm'
  | 'edit-undo'
  | 'edit-redo'
  | 'trim-mark-in'
  | 'trim-mark-out'
  | 'trim-cut-after'
  | 'trim-cut-before'
  | 'trim-split'
  | 'trim-delete-segment'
  | 'trim-ripple-delete'
  | 'trim-magnetic-snap'
  | 'trim-timeline-zoom'
  | 'trim-zoom-drag'
  | 'trim-zoom-edge'

export interface TooltipCopy {
  id: TooltipId
  /** Short label shown on hover/focus. */
  title: string
  /** Optional longer hint under empty states. */
  body?: string
}

export const TOOLTIPS: Record<TooltipId, TooltipCopy> = {
  'start-disabled-no-electron': {
    id: 'start-disabled-no-electron',
    title: 'Open Screen Flow as a desktop app to record',
    body: 'Browser preview cannot capture your screen. Launch via Electron.',
  },
  'start-disabled-no-source': {
    id: 'start-disabled-no-source',
    title: 'Pick a screen or window first',
    body: 'Choose a source on the right, then press Start (or R).',
  },
  'start-disabled-permission': {
    id: 'start-disabled-permission',
    title: 'Screen Recording permission needed',
    body: 'On macOS: System Settings → Privacy & Security → Screen Recording → enable Screen Flow, then Refresh sources.',
  },
  'start-disabled-busy': {
    id: 'start-disabled-busy',
    title: 'Hang on — finishing the last action',
  },
  'start-ready': {
    id: 'start-ready',
    title: 'R or Space · Start recording',
  },
  'stop-recording': {
    id: 'stop-recording',
    title: 'R or Esc · Stop recording',
  },
  'refresh-sources': {
    id: 'refresh-sources',
    title: 'Reload displays and windows',
    body: 'Use after granting Screen Recording permission.',
  },
  'sources-empty': {
    id: 'sources-empty',
    title: 'No screens found yet',
    body: 'Grant Screen Recording on macOS, then tap Refresh sources.',
  },
  'sources-browser': {
    id: 'sources-browser',
    title: 'Desktop app required',
    body: 'Open via Electron to list displays with desktopCapturer.',
  },
  'permission-denied': {
    id: 'permission-denied',
    title: 'Screen access blocked',
    body: 'Enable Screen Recording for Screen Flow in System Settings, then refresh.',
  },
  'camera-off': {
    id: 'camera-off',
    title: 'Add a FaceTime bubble to your recording',
    body: 'Turn on before you hit Start so the camera track is saved.',
  },
  'camera-no-device': {
    id: 'camera-no-device',
    title: 'No camera detected',
    body: 'Plug in a webcam or allow camera access, then try again.',
  },
  'camera-review-empty': {
    id: 'camera-review-empty',
    title: 'No camera on this clip',
    body: 'Enable FaceTime overlay before recording to add a bubble next time.',
  },
  'zoom-empty': {
    id: 'zoom-empty',
    title: 'No zoom points yet',
    body: 'Record with clicks for auto-zoom, or add one at the playhead (Z).',
  },
  'export-ready': {
    id: 'export-ready',
    title: 'E · Export polished MP4',
  },
  'export-size': {
    id: 'export-size',
    title: 'Estimated file size',
    body: 'Rough range from format, quality, and kept length. Actual size depends on motion.',
  },
  beautify: {
    id: 'beautify',
    title: 'B — Apply Tutorial look: zoom, spotlight cursor, Aurora frame',
  },
  'discard-review': {
    id: 'discard-review',
    title: 'Esc · Discard and record again',
    body: 'Asks for confirmation so you do not lose edits by accident.',
  },
  'discard-confirm': {
    id: 'discard-confirm',
    title: 'Discard this recording?',
    body: 'Edits stay in this session only. Discard returns to setup so you can record again.',
  },
  'edit-undo': {
    id: 'edit-undo',
    title: '⌘Z / Ctrl+Z · Undo last edit',
  },
  'edit-redo': {
    id: 'edit-redo',
    title: '⌘⇧Z / Ctrl+Shift+Z · Redo',
  },
  'trim-mark-in': {
    id: 'trim-mark-in',
    title: '[ · Mark In — start export here',
  },
  'trim-mark-out': {
    id: 'trim-mark-out',
    title: '] · Mark Out — end export here',
  },
  'trim-cut-after': {
    id: 'trim-cut-after',
    title: 'S · Cut after playhead (keep before)',
  },
  'trim-cut-before': {
    id: 'trim-cut-before',
    title: '⇧S · Cut before playhead (keep after)',
  },
  'trim-split': {
    id: 'trim-split',
    title: 'X · Razor split at playhead (multi-segment)',
  },
  'trim-delete-segment': {
    id: 'trim-delete-segment',
    title: 'Delete · Remove keep-range under playhead',
  },
  'trim-ripple-delete': {
    id: 'trim-ripple-delete',
    title: 'Ripple delete · Merge touching clips after Delete',
    body: 'When on, deleting a segment pulls the neighbors together (razor edit points collapse). When off, survivors stay separate for fine edits.',
  },
  'trim-magnetic-snap': {
    id: 'trim-magnetic-snap',
    title: 'Magnetic snap · Stick playhead & clip edges to edit points',
    body: 'When on, scrubbing, keep-clip edge drags, and zoom-event drags snap to keep edges, trim, zooms, clicks, and camera windows. Turn off for free scrubbing and free edge drag.',
  },
  'trim-timeline-zoom': {
    id: 'trim-timeline-zoom',
    title: 'Timeline zoom · Magnify the scrubber (= / −, Fit 0)',
    body: 'Zoom in to edit fine cuts on long clips. Ctrl/⌘+scroll zooms; Shift+scroll pans. Click the zoom label to fit the full clip.',
  },
  'trim-zoom-drag': {
    id: 'trim-zoom-drag',
    title: 'Drag zoom events · Move peaks on the timeline',
    body: 'Drag a teal zoom span to retarget when the zoom hits. Magnetic snap sticks to cuts, clicks, and camera windows. Preview and export stay in sync.',
  },
  'trim-zoom-edge': {
    id: 'trim-zoom-edge',
    title: 'Zoom edges · Trim zoom-in / zoom-out',
    body: 'Drag the start or end handle on a teal zoom span to lengthen or shorten the ease-in and ease-out. Peak and hold stay put. Preview and export stay in sync.',
  },
}

/** Resolve start-button tooltip from setup state. */
export function startRecordingTooltip(opts: {
  isRecording: boolean
  inElectron: boolean
  hasSource: boolean
  permissionDenied: boolean
  busy: boolean
}): TooltipCopy {
  if (opts.isRecording) return TOOLTIPS['stop-recording']
  if (!opts.inElectron) return TOOLTIPS['start-disabled-no-electron']
  if (opts.permissionDenied) return TOOLTIPS['start-disabled-permission']
  if (!opts.hasSource) return TOOLTIPS['start-disabled-no-source']
  if (opts.busy) return TOOLTIPS['start-disabled-busy']
  return TOOLTIPS['start-ready']
}

export function sourcesEmptyTooltip(inElectron: boolean): TooltipCopy {
  return inElectron ? TOOLTIPS['sources-empty'] : TOOLTIPS['sources-browser']
}
