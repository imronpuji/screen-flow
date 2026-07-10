/**
 * Smoke checks for one-click beautify presets (no Electron).
 */
import { defaultReviewEdit } from '../dist-electron/shared/edit.js'
import {
  BEAUTIFY_PRESETS,
  applyBeautifyPreset,
  getBeautifyPreset,
} from '../dist-electron/shared/beautify.js'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPresets(): void {
  assert(BEAUTIFY_PRESETS.length === 3, 'three presets')
  for (const preset of BEAUTIFY_PRESETS) {
    assert(preset.label.length > 0, `${preset.id} label`)
    assert(preset.background.enabled, `${preset.id} bg on`)
    assert(preset.autoZoomEnabled, `${preset.id} zoom on`)
    assert(preset.cursorSmoothingEnabled, `${preset.id} cursor on`)
  }
  const fallback = getBeautifyPreset('unknown')
  assert(fallback.id === 'tutorial', 'unknown falls back to tutorial')
  console.log('ok presets')
}

function testApplyPreservesTrim(): void {
  const base = defaultReviewEdit(10_000)
  base.trimStartMs = 500
  base.trimEndMs = 8_000
  const next = applyBeautifyPreset(base, 'demo', { hasCameraTrack: false })
  assert(next.trimStartMs === 500, 'trim start kept')
  assert(next.trimEndMs === 8_000, 'trim end kept')
  assert(next.background.presetId === 'midnight', 'demo midnight')
  assert(next.exportQuality === 'high', 'demo high quality')
  assert(next.cameraOverlay.enabled === false, 'no camera track → stay off')
  console.log('ok apply preserves trim')
}

function testApplyCameraLayout(): void {
  const base = defaultReviewEdit(5_000, { enabled: false, corner: 'top-left', sizePercent: 18 })
  const next = applyBeautifyPreset(base, 'social', { hasCameraTrack: true })
  assert(next.cameraOverlay.enabled === true, 'beautify enables camera when track exists')
  assert(next.cameraOverlay.corner === 'bottom-right', 'social corner')
  assert(next.cameraOverlay.sizePercent === 28, 'social size')
  assert(next.cameraOverlay.borderEnabled === true, 'social border on')
  assert(next.cameraOverlay.borderWidthPx === 3, 'social border width')
  assert(next.cameraOverlay.borderColor === '#F0A05A', 'social amber outline')
  assert(next.cameraOverlay.shadowEnabled === true, 'social shadow on')
  assert(next.cameraOverlay.mirrored === true, 'social mirrored')
  assert(next.cameraOverlay.opacity === 0.92, 'social soft opacity')
  assert(next.cursorAppearance.style === 'crosshair', 'social crosshair')
  assert(next.cursorAppearance.spotlightEnabled === true, 'social spotlight')
  assert(next.exportQuality === 'draft', 'social draft')
  console.log('ok apply camera layout')
}

function testDemoBorderColor(): void {
  const base = defaultReviewEdit(4_000)
  const next = applyBeautifyPreset(base, 'demo', { hasCameraTrack: true })
  assert(next.cameraOverlay.borderColor === '#3DD6C6', 'demo teal outline')
  assert(next.cameraOverlay.shape === 'rectangle', 'demo rectangle')
  assert(next.cameraOverlay.mirrored === false, 'demo natural (no mirror)')
  assert(next.cameraOverlay.opacity === 1, 'demo full opacity')
  console.log('ok demo border color')
}

function testTutorialSpotlight(): void {
  const base = defaultReviewEdit(3_000)
  const next = applyBeautifyPreset(base, 'tutorial')
  assert(next.cursorAppearance.spotlightEnabled === true, 'tutorial spotlight')
  assert(next.cursorAppearance.sizeScale === 1.35, 'tutorial size')
  assert(next.background.presetId === 'aurora', 'tutorial aurora')
  console.log('ok tutorial')
}

testPresets()
testApplyPreservesTrim()
testApplyCameraLayout()
testDemoBorderColor()
testTutorialSpotlight()
console.log('smoke-beautify: all ok')
