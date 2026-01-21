import { describe, expect, test } from 'bun:test'
import { __getExitPlanModeOptionsForTests } from '#ui-ink/components/permissions/PlanModePermissionRequest/ExitPlanModePermissionRequest'

describe('ExitPlanMode options', () => {
  test('includes bypass option when available', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: true,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-bypass-permissions',
      'yes-default',
      'yes-accept-edits-keep-context',
      'yes-default-keep-context',
      'no',
    ])
  })

  test('omits bypass option when unavailable', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: false,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-accept-edits',
      'yes-default',
      'yes-accept-edits-keep-context',
      'yes-default-keep-context',
      'no',
    ])
  })
})
