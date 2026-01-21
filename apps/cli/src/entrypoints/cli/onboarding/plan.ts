import type { GlobalConfig } from '#config'

export type OnboardingPlanReason = 'first_run' | 'missing_models'

export type OnboardingPlan = {
  shouldShowOnboarding: boolean
  shouldAutoRunCapabilities: boolean
  reasons: OnboardingPlanReason[]
}

export function computeOnboardingPlan(args: {
  config: GlobalConfig
  isInteractive: boolean
  hasConfiguredModels: boolean
}): OnboardingPlan {
  const reasons: OnboardingPlanReason[] = []

  if (!args.config.hasCompletedOnboarding) reasons.push('first_run')
  if (!args.hasConfiguredModels) reasons.push('missing_models')

  const needsOnboarding = reasons.length > 0
  const shouldShowOnboarding = needsOnboarding && args.isInteractive

  return {
    shouldShowOnboarding,
    shouldAutoRunCapabilities: shouldShowOnboarding,
    reasons,
  }
}
