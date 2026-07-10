/**
 * Smoke checks for first-run onboarding helpers (no Electron / DOM Storage).
 */
import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  hasCompletedOnboarding,
  markOnboardingComplete,
} from '../src/lib/onboarding.ts'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return map.has(key) ? map.get(key)! : null
    },
    setItem(key: string, value: string) {
      map.set(key, value)
    },
  }
}

function testSteps(): void {
  assert(ONBOARDING_STEPS.length === 3, 'three steps')
  assert(ONBOARDING_STEPS[0]!.id === 'record', 'first record')
  assert(ONBOARDING_STEPS[2]!.id === 'export', 'last export')
  console.log('ok steps')
}

function testStorage(): void {
  const store = memoryStorage()
  assert(hasCompletedOnboarding(store) === false, 'fresh = not done')
  markOnboardingComplete(store)
  assert(store.getItem(ONBOARDING_STORAGE_KEY) === '1', 'flag written')
  assert(hasCompletedOnboarding(store) === true, 'done after mark')
  console.log('ok storage')
}

testSteps()
testStorage()
console.log('smoke-onboarding: all ok')
