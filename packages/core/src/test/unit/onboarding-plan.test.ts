import { describe, expect, test } from 'bun:test'

import { DEFAULT_GLOBAL_CONFIG, type GlobalConfig } from '#config'
import { computeOnboardingPlan } from '#host-cli/entrypoints/cli/onboarding/plan'

function makeConfig(overrides: Partial<GlobalConfig>): GlobalConfig {
  return {
    ...DEFAULT_GLOBAL_CONFIG,
    ...overrides,
  }
}

describe('computeOnboardingPlan', () => {
  test('no config: first run + missing models => onboarding + auto capabilities', () => {
    const config = makeConfig({ hasCompletedOnboarding: false })
    const plan = computeOnboardingPlan({
      config,
      isInteractive: true,
      hasConfiguredModels: false,
    })

    expect(plan.shouldShowOnboarding).toBe(true)
    expect(plan.shouldAutoRunCapabilities).toBe(true)
    expect(plan.reasons).toContain('first_run')
    expect(plan.reasons).toContain('missing_models')
  })

  test('partial config: onboarding done but missing models => onboarding', () => {
    const config = makeConfig({ hasCompletedOnboarding: true })
    const plan = computeOnboardingPlan({
      config,
      isInteractive: true,
      hasConfiguredModels: false,
    })

    expect(plan.shouldShowOnboarding).toBe(true)
    expect(plan.reasons).not.toContain('first_run')
    expect(plan.reasons).toContain('missing_models')
  })

  test('configured: onboarding done + models => no onboarding', () => {
    const config = makeConfig({ hasCompletedOnboarding: true })
    const plan = computeOnboardingPlan({
      config,
      isInteractive: true,
      hasConfiguredModels: true,
    })

    expect(plan.shouldShowOnboarding).toBe(false)
    expect(plan.shouldAutoRunCapabilities).toBe(false)
    expect(plan.reasons).toEqual([])
  })

  test('non-interactive: never show onboarding screens', () => {
    const config = makeConfig({ hasCompletedOnboarding: false })
    const plan = computeOnboardingPlan({
      config,
      isInteractive: false,
      hasConfiguredModels: false,
    })

    expect(plan.shouldShowOnboarding).toBe(false)
    expect(plan.shouldAutoRunCapabilities).toBe(false)
  })
})
