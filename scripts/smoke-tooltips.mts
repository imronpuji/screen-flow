/**
 * Smoke checks for empty-state tooltip catalog (no Electron / DOM).
 */
import {
  TOOLTIPS,
  sourcesEmptyTooltip,
  startRecordingTooltip,
  type TooltipId,
} from '../shared/tooltips.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testCatalog(): void {
  const ids = Object.keys(TOOLTIPS) as TooltipId[]
  assert(ids.length >= 12, `expected many tooltips, got ${ids.length}`)
  for (const id of ids) {
    const tip = TOOLTIPS[id]
    assert(tip.id === id, `id mismatch ${id}`)
    assert(tip.title.trim().length > 0, `empty title ${id}`)
    assert(!tip.title.includes('undefined'), `bad title ${id}`)
  }
  console.log('ok catalog', ids.length)
}

function testStartResolver(): void {
  assert(
    startRecordingTooltip({
      isRecording: true,
      inElectron: true,
      hasSource: true,
      permissionDenied: false,
      busy: false,
    }).id === 'stop-recording',
    'recording → stop',
  )
  assert(
    startRecordingTooltip({
      isRecording: false,
      inElectron: false,
      hasSource: false,
      permissionDenied: false,
      busy: false,
    }).id === 'start-disabled-no-electron',
    'browser → no electron',
  )
  assert(
    startRecordingTooltip({
      isRecording: false,
      inElectron: true,
      hasSource: false,
      permissionDenied: true,
      busy: false,
    }).id === 'start-disabled-permission',
    'denied beats missing source',
  )
  assert(
    startRecordingTooltip({
      isRecording: false,
      inElectron: true,
      hasSource: false,
      permissionDenied: false,
      busy: false,
    }).id === 'start-disabled-no-source',
    'no source',
  )
  assert(
    startRecordingTooltip({
      isRecording: false,
      inElectron: true,
      hasSource: true,
      permissionDenied: false,
      busy: true,
    }).id === 'start-disabled-busy',
    'busy',
  )
  assert(
    startRecordingTooltip({
      isRecording: false,
      inElectron: true,
      hasSource: true,
      permissionDenied: false,
      busy: false,
    }).id === 'start-ready',
    'ready',
  )
  console.log('ok start resolver')
}

function testSourcesEmpty(): void {
  assert(sourcesEmptyTooltip(true).id === 'sources-empty', 'electron empty')
  assert(sourcesEmptyTooltip(false).id === 'sources-browser', 'browser empty')
  assert(Boolean(TOOLTIPS['sources-empty'].body), 'empty has body')
  assert(Boolean(TOOLTIPS['camera-review-empty'].body), 'camera empty has body')
  assert(Boolean(TOOLTIPS['zoom-empty'].body), 'zoom empty has body')
  assert(Boolean(TOOLTIPS['discard-confirm'].body), 'discard confirm has body')
  assert(
    TOOLTIPS['discard-review'].body?.includes('confirmation'),
    'discard tip mentions confirmation',
  )
  console.log('ok sources empty')
}

testCatalog()
testStartResolver()
testSourcesEmpty()
console.log('smoke-tooltips: all ok')
