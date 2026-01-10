import { beforeEach, describe, expect, test } from 'bun:test'
import { EnterPlanModeTool } from '#tools/tools/interaction/PlanModeTool/EnterPlanModeTool'
import {
  __resetPlanModeForTests,
  isPlanModeEnabled,
} from '#core/utils/planMode'
import {
  __resetPermissionModeStateForTests,
  getPermissionMode,
} from '#core/utils/permissionModeState'
import type { ToolUseContext } from '#core/tooling/Tool'

const makeContext = (
  overrides: Partial<ToolUseContext> = {},
): ToolUseContext => ({
  abortController: new AbortController(),
  messageId: 'test',
  readFileTimestamps: {},
  options: {
    messageLogName: 'test',
    forkNumber: 0,
  },
  ...overrides,
})

describe('EnterPlanModeTool', () => {
  beforeEach(() => {
    __resetPlanModeForTests()
    __resetPermissionModeStateForTests()
  })

  test('rejects agent contexts', async () => {
    const ctx = makeContext({ agentId: 'agent-1' })
    const gen = EnterPlanModeTool.call({}, ctx)
    await expect(gen.next()).rejects.toThrow(
      'EnterPlanMode tool cannot be used in agent contexts',
    )
  })

  test('enables plan mode and sets permission mode to plan', async () => {
    const ctx = makeContext()

    expect(isPlanModeEnabled(ctx)).toBe(false)
    expect(getPermissionMode(ctx)).toBe('default')

    const gen = EnterPlanModeTool.call({}, ctx)
    const first = await gen.next()

    expect(first.done).toBe(false)
    if (first.done || !first.value) {
      throw new Error('Expected EnterPlanModeTool to yield a result')
    }
    expect(first.value.type).toBe('result')

    expect(isPlanModeEnabled(ctx)).toBe(true)
    expect(getPermissionMode(ctx)).toBe('plan')
  })
})
