import { describe, expect, test } from 'bun:test'
import { __getExitPlanModeOptionsForTests } from '#ui-ink/components/permissions/PlanModePermissionRequest/ExitPlanModePermissionRequest'

describe('ExitPlanMode options', () => {
  test('includes bypass option when available', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: true,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-bypass-permissions',
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
      'yes-accept-edits-keep-context',
      'yes-default-keep-context',
      'no',
    ])
  })

  test('includes push-to-remote and swarm options when enabled', () => {
    const options = __getExitPlanModeOptionsForTests({
      bypassAvailable: true,
      pushToRemoteAvailable: true,
      swarmAvailable: true,
      teammateCount: 3,
    })

    expect(options.map(o => o.value)).toEqual([
      'yes-bypass-permissions',
      'yes-push-to-remote',
      'yes-launch-swarm-accept-edits',
      'yes-launch-swarm-bypass',
      'yes-accept-edits-keep-context',
      'yes-default-keep-context',
      'no',
    ])
  })
})
