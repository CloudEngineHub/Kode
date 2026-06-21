import { describe, expect, test } from 'bun:test'
import { getWizardStepSubtitle } from './Wizard'

describe('getWizardStepSubtitle', () => {
  test('uses an open-ended label before the setup path is selected', () => {
    expect(
      getWizardStepSubtitle(
        { stepIndex: 0, totalSteps: 10, wizardData: {} },
        'Choose location',
      ),
    ).toBe('Step 1 - Choose location')
  })

  test('shows the short quick path after generation', () => {
    expect(
      getWizardStepSubtitle(
        {
          stepIndex: 9,
          totalSteps: 10,
          wizardData: { method: 'quickGenerate' },
        },
        'Review and save',
      ),
    ).toBe('Step 4/4 - Review and save')
  })

  test('shows the customization path when settings are exposed', () => {
    expect(
      getWizardStepSubtitle(
        {
          stepIndex: 6,
          totalSteps: 10,
          wizardData: { method: 'customGenerate' },
        },
        'Select tools',
      ),
    ).toBe('Step 4/7 - Select tools')
  })

  test('shows the full manual path for manual setup', () => {
    expect(
      getWizardStepSubtitle(
        {
          stepIndex: 3,
          totalSteps: 10,
          wizardData: { method: 'manual' },
        },
        'Name the agent',
      ),
    ).toBe('Step 3/9 - Name the agent')
  })
})
