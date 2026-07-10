import { useState } from 'react'
import {
  ONBOARDING_STEPS,
  markOnboardingComplete,
  type OnboardingStep,
} from '../lib/onboarding'

export interface OnboardingOverlayProps {
  onDone: () => void
  steps?: readonly OnboardingStep[]
}

export function OnboardingOverlay({
  onDone,
  steps = ONBOARDING_STEPS,
}: OnboardingOverlayProps) {
  const [index, setIndex] = useState(0)
  const step = steps[index]!
  const isLast = index >= steps.length - 1

  function finish() {
    markOnboardingComplete()
    onDone()
  }

  function next() {
    if (isLast) {
      finish()
      return
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1))
  }

  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding__panel">
        <p className="onboarding__brand">Screen Flow</p>
        <p className="onboarding__step" aria-live="polite">
          Step {index + 1} of {steps.length}
        </p>
        <h2 id="onboarding-title" className="onboarding__title">
          {step.title}
        </h2>
        <p className="onboarding__body">{step.body}</p>
        <div className="onboarding__dots" aria-hidden="true">
          {steps.map((s, i) => (
            <span
              key={s.id}
              className={
                i === index ? 'onboarding__dot onboarding__dot--active' : 'onboarding__dot'
              }
            />
          ))}
        </div>
        <div className="onboarding__actions">
          <button type="button" className="btn btn--ghost" onClick={finish}>
            Skip
          </button>
          <button type="button" className="btn btn--primary" onClick={next}>
            {isLast ? 'Start recording' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  )
}
