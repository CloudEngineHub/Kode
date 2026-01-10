import { describe, expect, test } from 'bun:test'
import { __getExitPlanModeOptionsForTests } from '#ui-ink/components/permissions/PlanModePermissionRequest/ExitPlanModePermissionRequest'

describe('ExitPlanMode options', () => {
  test('uses bypass option when available', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: true,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-bypass',
      'yes-default',
      'no',
    ])
  })

  test('uses accept edits option when bypass is unavailable', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: false,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-accept',
      'yes-default',
      'no',
    ])
  })
})
