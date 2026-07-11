import { describe, expect, test } from 'bun:test'

import {
  DaemonAgentCreateRequestSchema,
  DaemonAgentDeleteResponseSchema,
  DaemonAgentDetailResponseSchema,
  DaemonAgentUpdateRequestSchema,
} from '../../controlPlane'

const agent = {
  agentType: 'review-agent',
  whenToUse: 'Review a change for correctness and regressions.',
  systemPrompt: 'Review the requested change and report findings.',
  tools: ['Read', 'Grep'],
  model: 'inherit',
  permissionMode: 'plan',
  forkContext: true,
}

describe('daemon Agent control-plane schemas', () => {
  test('accepts only the runtime-backed mutable Agent fields', () => {
    expect(
      DaemonAgentCreateRequestSchema.safeParse({
        source: 'projectSettings',
        agent,
      }).success,
    ).toBe(true)

    expect(
      DaemonAgentCreateRequestSchema.safeParse({
        source: 'projectSettings',
        agent: { ...agent, skills: ['not-runtime-backed'] },
      }).success,
    ).toBe(false)
    expect(
      DaemonAgentCreateRequestSchema.safeParse({
        source: 'built-in',
        agent,
      }).success,
    ).toBe(false)
  })

  test('requires a revision for full-definition updates', () => {
    const revision = 'a'.repeat(64)
    expect(
      DaemonAgentUpdateRequestSchema.safeParse({
        source: 'userSettings',
        expectedRevision: revision,
        agent,
      }).success,
    ).toBe(true)
    expect(
      DaemonAgentUpdateRequestSchema.safeParse({
        source: 'userSettings',
        expectedRevision: 'stale',
        agent,
      }).success,
    ).toBe(false)
  })

  test('does not allow storage paths or loader metadata in responses', () => {
    const revision = 'b'.repeat(64)
    expect(
      DaemonAgentDetailResponseSchema.safeParse({
        agent: {
          ...agent,
          source: 'projectSettings',
          revision,
          baseDir: 'C:/private/path',
        },
      }).success,
    ).toBe(false)
  })

  test('requires an exact delete response', () => {
    expect(
      DaemonAgentDeleteResponseSchema.safeParse({ deleted: true }).success,
    ).toBe(true)
    expect(
      DaemonAgentDeleteResponseSchema.safeParse({
        deleted: true,
        leaked: 'unexpected',
      }).success,
    ).toBe(false)
  })
})
