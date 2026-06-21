import React from 'react'
import { ModelSelector } from '#ui-ink/components/ModelSelector'

type Props = {
  onDone(result?: { skipped: boolean }): void
}

export function OnboardingScreen({ onDone }: Props): React.ReactNode {
  // Skip theme selection, go directly to model selector
  return (
    <ModelSelector
      onDone={() => onDone({ skipped: false })}
      skipModelType={true}
      isOnboarding={true}
    />
  )
}
