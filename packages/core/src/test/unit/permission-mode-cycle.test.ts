import { beforeEach, describe, expect, test } from 'bun:test'
import { getNextPermissionMode } from '#core/types/PermissionMode'
import { __applyPermissionModeSideEffectsForTests } from '#ui-ink/contexts/PermissionContext'
import {
  __resetPermissionModeStateForTests,
  getPermissionModeForConversationKey,
} from '#core/utils/permissionModeState'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'
import type { ToolUseContext } from '#core/tooling/Tool'
import {
  getPlanModeSystemPromptAdditions,
  isPlanModeEnabled,
} from '#core/utils/planMode'

function makeContext(
  messageLogName: string,
  forkNumber: number,
): ToolUseContext {
  return {
    messageId: undefined,
    abortController: new AbortController(),
    readFileTimestamps: {},
    options: { messageLogName, forkNumber },
  }
}

describe('permission mode cycle parity (cycle order + side effects)', () => {
  beforeEach(() => {
    __resetPermissionModeStateForTests()
  })

  test('getNextPermissionMode matches expected ordering', () => {
    // New cycle: yolo -> plan -> acceptEdits -> cautious -> bypassPermissions -> yolo
    expect(getNextPermissionMode('yolo', true)).toBe('plan')
    expect(getNextPermissionMode('plan', true)).toBe('acceptEdits')
    expect(getNextPermissionMode('acceptEdits', true)).toBe('cautious')
    expect(getNextPermissionMode('cautious', true)).toBe('bypassPermissions')
    expect(getNextPermissionMode('cautious', false)).toBe('yolo')
    expect(getNextPermissionMode('bypassPermissions', true)).toBe('yolo')
    expect(getNextPermissionMode('dontAsk', true)).toBe('yolo')
    // Legacy 'default' is normalized to 'cautious'
    expect(getNextPermissionMode('default', true)).toBe('bypassPermissions')
  })

  test('cycle into plan records lastPlanModeUse + enables plan mode', () => {
    const messageLogName = 'perm-cycle-plan'
    const forkNumber = 0
    const conversationKey = `${messageLogName}:${forkNumber}`

    saveGlobalConfig({ ...getGlobalConfig(), lastPlanModeUse: 0 })

    __applyPermissionModeSideEffectsForTests({
      conversationKey,
      previousMode: 'acceptEdits',
      nextMode: 'plan',
      recordPlanModeUse: true,
      now: () => 12345,
    })

    expect(
      getPermissionModeForConversationKey({
        conversationKey,
        isBypassPermissionsModeAvailable: true,
      }),
    ).toBe('plan')
    expect(isPlanModeEnabled(makeContext(messageLogName, forkNumber))).toBe(
      true,
    )
    expect(getGlobalConfig().lastPlanModeUse).toBe(12345)
  })

  test('setMode into plan does NOT record lastPlanModeUse (only shortcut cycle does)', () => {
    const messageLogName = 'perm-set-plan'
    const forkNumber = 0
    const conversationKey = `${messageLogName}:${forkNumber}`

    saveGlobalConfig({ ...getGlobalConfig(), lastPlanModeUse: 0 })

    __applyPermissionModeSideEffectsForTests({
      conversationKey,
      previousMode: 'acceptEdits',
      nextMode: 'plan',
      recordPlanModeUse: false,
      now: () => 999,
    })

    expect(isPlanModeEnabled(makeContext(messageLogName, forkNumber))).toBe(
      true,
    )
    expect(getGlobalConfig().lastPlanModeUse).toBe(0)
  })

  test('leaving plan sets plan_mode_exit attachment flags (one-shot reminder)', () => {
    const messageLogName = 'perm-exit-plan'
    const forkNumber = 0
    const conversationKey = `${messageLogName}:${forkNumber}`
    const ctx = makeContext(messageLogName, forkNumber)

    __applyPermissionModeSideEffectsForTests({
      conversationKey,
      previousMode: 'acceptEdits',
      nextMode: 'plan',
      recordPlanModeUse: false,
    })

    expect(isPlanModeEnabled(ctx)).toBe(true)

    __applyPermissionModeSideEffectsForTests({
      conversationKey,
      previousMode: 'plan',
      nextMode: 'yolo',
      recordPlanModeUse: false,
    })

    expect(isPlanModeEnabled(ctx)).toBe(false)

    const first = getPlanModeSystemPromptAdditions([], ctx)
    expect(first.length).toBeGreaterThan(0)
    expect(first.join('\n')).toContain('Exited Plan Mode')

    const second = getPlanModeSystemPromptAdditions([], ctx)
    expect(second).toEqual([])
  })
})
