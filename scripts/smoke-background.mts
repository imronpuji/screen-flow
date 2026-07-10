/**
 * Smoke checks for aesthetic background frame (no Electron).
 */
import {
  BACKGROUND_PRESETS,
  DEFAULT_BACKGROUND_STYLE,
  getBackgroundPreset,
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

  const noShadow = resolveBackgroundFrame({
    ...DEFAULT_BACKGROUND_STYLE,
    shadowEnabled: false,
  })
  assert(noShadow?.boxShadow === undefined, 'no shadow when disabled')
  console.log('ok resolve')
}

testPresets()
testNormalize()
testResolve()
console.log('smoke:background ok')
