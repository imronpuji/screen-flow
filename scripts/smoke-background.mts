/**
 * Smoke checks for aesthetic background frame (no Electron).
 */
import {
  BACKGROUND_FRAME_LAYOUTS,
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_STYLE,
  applyBackgroundFrameLayout,
  getBackgroundFrameLayout,
  getBackgroundPreset,
  matchBackgroundFrameLayout,
  normalizeBackgroundStyle,
  resolveBackgroundFrame,
} from '../shared/background.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function testPresets(): void {
  assert(BACKGROUND_PRESETS.length >= 4, 'has presets')
  for (const preset of BACKGROUND_PRESETS) {
    assert(preset.css.includes('gradient'), `${preset.id} has gradient`)
  }
  const fallback = getBackgroundPreset('unknown-id')
  assert(fallback.id === BACKGROUND_PRESETS[0]!.id, 'unknown falls back to first')
  console.log('ok presets')
}

function testFrameLayouts(): void {
  assert(BACKGROUND_FRAME_LAYOUTS.length === 4, 'four frame layouts')
  const standard = getBackgroundFrameLayout('standard')
  assert(standard.paddingPercent === 10, 'standard padding')
  assert(standard.cornerRadiusPx === 14, 'standard radius')
  assert(standard.shadowEnabled === true, 'standard shadow')

  const unknown = getBackgroundFrameLayout('nope')
  assert(unknown.id === 'standard', 'unknown layout → standard')

  const applied = applyBackgroundFrameLayout(
    { ...DEFAULT_BACKGROUND_STYLE, presetId: 'sunset', enabled: true },
    'wide',
  )
  assert(applied.presetId === 'sunset', 'layout keeps color preset')
  assert(applied.enabled === true, 'layout keeps enabled')
  assert(applied.paddingPercent === 16, 'wide padding')
  assert(applied.cornerRadiusPx === 20, 'wide radius')
  assert(matchBackgroundFrameLayout(applied) === 'wide', 'match wide')

  const flat = applyBackgroundFrameLayout(DEFAULT_BACKGROUND_STYLE, 'flat')
  assert(flat.shadowEnabled === false, 'flat no shadow')
  assert(flat.cornerRadiusPx === 0, 'flat square')
  assert(matchBackgroundFrameLayout(flat) === 'flat', 'match flat')

  const custom = normalizeBackgroundStyle({
    ...DEFAULT_BACKGROUND_STYLE,
    paddingPercent: 11,
  })
  assert(matchBackgroundFrameLayout(custom) === null, 'custom ≠ preset')

  const compact = applyBackgroundFrameLayout(DEFAULT_BACKGROUND_STYLE, 'compact')
  assert(matchBackgroundFrameLayout(compact) === 'compact', 'match compact')
  console.log('ok frame layouts')
}

function testNormalize(): void {
  const clamped = normalizeBackgroundStyle({
    enabled: true,
    presetId: 'nope',
    paddingPercent: 99,
    cornerRadiusPx: 100,
    shadowEnabled: true,
  })
  assert(clamped.paddingPercent === 24, 'padding clamped')
  assert(clamped.cornerRadiusPx === 32, 'radius clamped')
  assert(clamped.presetId === BACKGROUND_PRESETS[0]!.id, 'preset fallback')
  console.log('ok normalize')
}

function testResolve(): void {
  const off = resolveBackgroundFrame({ ...DEFAULT_BACKGROUND_STYLE, enabled: false })
  assert(off === null, 'disabled returns null')

  const on = resolveBackgroundFrame(DEFAULT_BACKGROUND_STYLE)
  assert(on !== null, 'enabled resolves')
  assert(on.backgroundCss.includes('gradient'), 'has gradient css')
  assert(on.paddingPercent === DEFAULT_BACKGROUND_STYLE.paddingPercent, 'padding kept')
  assert(typeof on.boxShadow === 'string', 'shadow when enabled')
  assert(
    matchBackgroundFrameLayout(DEFAULT_BACKGROUND_STYLE) === 'standard',
    'default matches standard layout',
  )

  const noShadow = resolveBackgroundFrame({
    ...DEFAULT_BACKGROUND_STYLE,
    shadowEnabled: false,
  })
  assert(noShadow?.boxShadow === undefined, 'no shadow when disabled')
  console.log('ok resolve')
}

testPresets()
testFrameLayouts()
testNormalize()
testResolve()
console.log('smoke:background ok')
