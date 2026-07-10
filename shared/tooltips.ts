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
  | 'export-ready'
  | 'beautify'
  | 'discard-review'

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
  'export-ready': {
    id: 'export-ready',
    title: 'E · Export polished MP4',
  },
  beautify: {
    id: 'beautify',
    title: 'B — Apply Tutorial look: zoom, spotlight cursor, Aurora frame',
  },
  'discard-review': {
    id: 'discard-review',
    title: 'Esc · Discard and record again',
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
