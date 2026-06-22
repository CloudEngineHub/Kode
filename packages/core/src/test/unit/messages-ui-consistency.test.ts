import { describe, expect, test } from 'bun:test'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
  extractTag,
  getInProgressToolUseIDs,
  getUnresolvedToolUseIDs,
  normalizeMessages,
  reorderMessages,
} from '#core/utils/messages'
import { getReplStaticPrefixLength } from '#cli-utils/replStaticSplit'
import type { Message as KodeMessage, AssistantMessage } from '#core/query'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import type { ToolUseLikeBlockParam } from '#core/utils/anthropic'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function makeToolUseAssistantWithSiblings(
  toolUseIDs: string[],
): AssistantMessage {
  const base = createAssistantMessage('ignored')
  const blocks: ToolUseLikeBlockParam[] = toolUseIDs.map(id => ({
    type: 'tool_use',
    id,
    name: 'Bash',
    input: { command: `echo ${id}` },
  }))
  base.message.content = blocks
  return base
}

function makeToolResult(toolUseID: string, content = 'ok') {
  return createUserMessage([
    { type: 'tool_result', tool_use_id: toolUseID, content },
  ] satisfies ToolResultBlockParam[])
}

function makeProgress(
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  text: string,
) {
  return createProgressMessage(
    toolUseID,
    siblingToolUseIDs,
    createAssistantMessage(`<tool-progress>${text}</tool-progress>`),
    [],
    [],
  )
}

function getStaticPrefixUuids(messages: KodeMessage[]): string[] {
  const normalized = normalizeMessages(messages)
  const ordered = reorderMessages(normalized)
  const unresolved = getUnresolvedToolUseIDs(normalized)
  const prefixLen = getReplStaticPrefixLength(ordered, normalized, unresolved)
  return ordered.slice(0, prefixLen).map(m => String(m.uuid))
}

function expectPrefix(prefix: string[], full: string[]) {
  expect(full.slice(0, prefix.length)).toEqual(prefix)
}

describe('UI messages consistency (no duplicate tool rendering)', () => {
  test('reorderMessages replaces multiple progress messages for the same tool_use_id', () => {
    const toolUse = makeToolUseAssistantWithSiblings(['t1'])
    const siblings = new Set(['t1'])

    const p1 = makeProgress('t1', siblings, 'Running…')
    const p2 = makeProgress('t1', siblings, 'Still running…')

    const normalized = normalizeMessages([toolUse, p1, p2])
    const ordered = reorderMessages(normalized)

    const progress = ordered.filter(
      (m): m is Extract<(typeof ordered)[number], { type: 'progress' }> =>
        m.type === 'progress',
    )
    expect(progress).toHaveLength(1)

    const firstBlock = progress[0]?.content.message.content[0]
    const firstRecord = asRecord(firstBlock)
    const rawText = String(firstRecord?.text ?? '')
    expect(extractTag(rawText, 'tool-progress')).toBe('Still running…')
  })

  test('queued Waiting… progress does not count as in-progress for non-first tools', () => {
    const t1 = makeToolUseAssistantWithSiblings(['t1'])
    const t2 = makeToolUseAssistantWithSiblings(['t2'])
    const siblings = new Set(['t1', 't2'])

    const waitingT2 = makeProgress('t2', siblings, 'Waiting…')
    const normalized1 = normalizeMessages([t1, t2, waitingT2])
    expect(getUnresolvedToolUseIDs(normalized1)).toEqual(new Set(['t1', 't2']))
    expect(getInProgressToolUseIDs(normalized1)).toEqual(new Set(['t1']))

    const runningT2 = makeProgress('t2', siblings, 'Running…')
    const normalized2 = normalizeMessages([t1, t2, waitingT2, runningT2])
    expect(getInProgressToolUseIDs(normalized2)).toEqual(new Set(['t1', 't2']))
  })

  test('Static prefix remains append-only across queued→running progress replacement', () => {
    const user = createUserMessage('hi')
    const toolUse = makeToolUseAssistantWithSiblings(['t1', 't2'])
    const siblings = new Set(['t1', 't2'])

    const runningT1 = makeProgress('t1', siblings, 'Running…')
    const waitingT2 = makeProgress('t2', siblings, 'Waiting…')
    const runningT2 = makeProgress('t2', siblings, 'Running…')

    const timeline: KodeMessage[][] = [
      [user, toolUse],
      [user, toolUse, runningT1],
      [user, toolUse, runningT1, waitingT2],
      [user, toolUse, runningT1, waitingT2, makeToolResult('t1', 'done')],
      // When tool 2 starts, a new progress message is appended; UI must replace it.
      [
        user,
        toolUse,
        runningT1,
        waitingT2,
        makeToolResult('t1', 'done'),
        runningT2,
      ],
      [
        user,
        toolUse,
        runningT1,
        waitingT2,
        makeToolResult('t1', 'done'),
        runningT2,
        makeToolResult('t2', 'done'),
      ],
    ]

    let prev: string[] | null = null
    for (const step of timeline) {
      const next = getStaticPrefixUuids(step)
      if (prev) expectPrefix(prev, next)
      prev = next
    }
  })
})
