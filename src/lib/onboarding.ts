/** First-run onboarding persistence (renderer localStorage). */

export const ONBOARDING_STORAGE_KEY = 'screen-flow:onboarding-done'

export function hasCompletedOnboarding(
  storage: Pick<Storage, 'getItem'> = localStorage,
): boolean {
  try {
    return storage.getItem(ONBOARDING_STORAGE_KEY) === '1'
  } catch {
    return true
  }
}

export function markOnboardingComplete(
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  try {
    storage.setItem(ONBOARDING_STORAGE_KEY, '1')
  } catch {
    /* private mode / quota — treat as done for this session */
  }
}

export interface OnboardingStep {
  id: string
  title: string
  body: string
}

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: 'record',
    title: 'Pick a screen & record',
    body: 'Grant Screen Recording if asked, choose a display or window, then hit Start (or press R / Space). Optionally turn on the FaceTime camera bubble.',
  },
  {
    id: 'polish',
    title: 'Polish in one click',
    body: 'After you stop, use Beautify presets (Tutorial, Product demo, Social) or press B. Tweak zoom, cursor, and background yourself — Space plays the preview.',
  },
  {
    id: 'export',
    title: 'Export MP4',
    body: 'Pick Draft, Good, or High quality and export (E). Screen Flow saves an H.264 MP4 you can share right away.',
  },
] as const
