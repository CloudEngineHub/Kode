import { describe, expect, test } from 'bun:test'
import type { ContentBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'

import type { NormalizedMessage } from '#core/message-utils/normalize'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
  reorderMessages,
} from '#core/utils/messages'

type MessageEntry = {
  message: NormalizedMessage
}

function isToolUseLikeBlock(
  block: unknown,
): block is { id: string; type: string } {
  if (!block || typeof block !== 'object') return false
  const candidate = block as { id?: unknown; type?: unknown }
  return (
    (candidate.type === 'tool_use' ||
      candidate.type === 'server_tool_use' ||
      candidate.type === 'mcp_tool_use') &&
    typeof candidate.id === 'string'
  )
}

function getToolUseRequestID(message: NormalizedMessage): string | null {
  if (message.type !== 'assistant' || !('costUSD' in message)) return null
  return message.message.content.find(isToolUseLikeBlock)?.id ?? null
}

// Intentionally simple and slow: this models the established online insertion
// rules without sharing the production data structure.
function referenceReorderMessages(
  messages: NormalizedMessage[],
): NormalizedMessage[] {
  const entries: MessageEntry[] = []
  const toolUseEntries = new Map<string, MessageEntry>()
  const progressEntries = new Map<string, MessageEntry>()

  const rememberEntry = (entry: MessageEntry) => {
    const { message } = entry
    if (message.type === 'progress') {
      progressEntries.set(message.toolUseID, entry)
      return
    }

    const toolUseID = getToolUseRequestID(message)
    if (toolUseID) toolUseEntries.set(toolUseID, entry)
  }

  const append = (message: NormalizedMessage) => {
    const entry = { message }
    entries.push(entry)
    rememberEntry(entry)
  }

  const insertAfter = (anchor: MessageEntry, message: NormalizedMessage) => {
    const entry = { message }
    entries.splice(entries.indexOf(anchor) + 1, 0, entry)
    rememberEntry(entry)
  }

  for (const message of messages) {
    if (message.type === 'progress') {
      const existingProgress = progressEntries.get(message.toolUseID)
      if (existingProgress) {
        existingProgress.message = message
        continue
      }

      const toolUse = toolUseEntries.get(message.toolUseID)
      if (toolUse) {
        insertAfter(toolUse, message)
        continue
      }
    }

    if (
      message.type === 'user' &&
      Array.isArray(message.message.content) &&
      message.message.content[0]?.type === 'tool_result'
    ) {
      const toolUseID = message.message.content[0].tool_use_id
      const progress = progressEntries.get(toolUseID)
      if (progress) {
        insertAfter(progress, message)
        continue
      }

      const toolUse = toolUseEntries.get(toolUseID)
      if (toolUse) insertAfter(toolUse, message)
    } else {
      append(message)
    }
  }

  return entries.map(entry => entry.message)
}

function makeToolUse(
  toolUseID: string,
  label: string,
  type: 'tool_use' | 'server_tool_use' | 'mcp_tool_use' = 'tool_use',
): NormalizedMessage {
  const message = createAssistantMessage(label)
  message.message.content = [
    { type, id: toolUseID, name: 'Echo', input: { label } } as any,
  ]
  return message
}

function makeToolResult(toolUseID: string, label: string): NormalizedMessage {
  return createUserMessage([
    { type: 'tool_result', tool_use_id: toolUseID, content: label },
  ] satisfies ContentBlockParam[]) as NormalizedMessage
}

function makeProgress(toolUseID: string, label: string): NormalizedMessage {
  return createProgressMessage(
    toolUseID,
    new Set([toolUseID]),
    createAssistantMessage(label),
    [],
    [],
  )
}

function countMapEntryVisits<T>(run: () => T): {
  result: T
  visits: number
} {
  const mapPrototype = Map.prototype as any
  const originalIterator = mapPrototype[Symbol.iterator]
  let visits = 0

  mapPrototype[Symbol.iterator] = function () {
    const iterator = originalIterator.call(this)
    const next = iterator.next.bind(iterator)
    iterator.next = () => {
      const value = next()
      if (!value.done) visits++
      return value
    }
    return iterator
  }

  try {
    return { result: run(), visits }
  } finally {
    mapPrototype[Symbol.iterator] = originalIterator
  }
}

function buildLargeFixture(groupCount: number): {
  labels: Map<NormalizedMessage, string>
  messages: NormalizedMessage[]
} {
  const labels = new Map<NormalizedMessage, string>()
  const messages: NormalizedMessage[] = []

  const add = (message: NormalizedMessage, label: string) => {
    labels.set(message, label)
    return message
  }

  for (let index = 0; index < groupCount; index++) {
    const toolUseID =
      index % 23 === 0
        ? 'duplicate-global'
        : index % 19 === 0
          ? `duplicate-${index % 4}`
          : `tool-${index}`
    const progressOnlyID = `progress-only-${index}`
    const absentID = `absent-${index}`
    const blockType = (
      ['tool_use', 'server_tool_use', 'mcp_tool_use'] as const
    )[index % 3]!

    const toolUse = add(
      makeToolUse(toolUseID, `use-${index}`, blockType),
      `use-${index}`,
    )
    const result1 = add(
      makeToolResult(toolUseID, `result-1-${index}`),
      `result-1-${index}`,
    )
    const result2 = add(
      makeToolResult(toolUseID, `result-2-${index}`),
      `result-2-${index}`,
    )
    const progress1 = add(
      makeProgress(toolUseID, `progress-1-${index}`),
      `progress-1-${index}`,
    )
    const progress2 = add(
      makeProgress(toolUseID, `progress-2-${index}`),
      `progress-2-${index}`,
    )
    const orphanResult = add(
      makeToolResult(absentID, `orphan-result-${index}`),
      `orphan-result-${index}`,
    )
    const orphanProgress = add(
      makeProgress(progressOnlyID, `orphan-progress-${index}`),
      `orphan-progress-${index}`,
    )
    const progressOnlyResult = add(
      makeToolResult(progressOnlyID, `progress-only-result-${index}`),
      `progress-only-result-${index}`,
    )
    const plain = add(
      createAssistantMessage(`plain-${index}`),
      `plain-${index}`,
    )

    switch (index % 4) {
      case 0:
        messages.push(
          toolUse,
          result1,
          progress1,
          result2,
          progress2,
          plain,
          orphanResult,
          orphanProgress,
          progressOnlyResult,
        )
        break
      case 1:
        messages.push(
          result1,
          toolUse,
          progress1,
          result2,
          progress2,
          orphanResult,
          plain,
          orphanProgress,
          progressOnlyResult,
        )
        break
      case 2:
        messages.push(
          progress1,
          result1,
          toolUse,
          progress2,
          result2,
          orphanProgress,
          progressOnlyResult,
          orphanResult,
          plain,
        )
        break
      case 3:
        messages.push(
          orphanResult,
          toolUse,
          result1,
          plain,
          result2,
          progress1,
          progress2,
          orphanProgress,
          progressOnlyResult,
        )
        break
    }
  }

  return { labels, messages }
}

describe('reorderMessages', () => {
  test('preserves online insertion order and message references', () => {
    const plainBefore = createAssistantMessage('plain-before')
    const orphanResult = makeToolResult('absent', 'orphan-result')
    const earlyProgress = makeProgress('late', 'early-progress')
    const lateResult1 = makeToolResult('late', 'late-result-1')
    const lateUse = makeToolUse('late', 'late-use')
    const lateProgressReplacement = makeProgress(
      'late',
      'late-progress-replacement',
    )
    const lateResult2 = makeToolResult('late', 'late-result-2')
    const firstUse = makeToolUse('duplicate', 'first-use')
    const firstResult1 = makeToolResult('duplicate', 'first-result-1')
    const firstResult2 = makeToolResult('duplicate', 'first-result-2')
    const secondUse = makeToolUse('duplicate', 'second-use')
    const secondResult = makeToolResult('duplicate', 'second-result')
    const progress1 = makeProgress('duplicate', 'progress-1')
    const progressResult1 = makeToolResult('duplicate', 'progress-result-1')
    const progress2 = makeProgress('duplicate', 'progress-2')
    const progressResult2 = makeToolResult('duplicate', 'progress-result-2')
    const tail = createAssistantMessage('tail')

    const reordered = reorderMessages([
      plainBefore,
      orphanResult,
      earlyProgress,
      lateResult1,
      lateUse,
      lateProgressReplacement,
      lateResult2,
      firstUse,
      firstResult1,
      firstResult2,
      secondUse,
      secondResult,
      progress1,
      progressResult1,
      progress2,
      progressResult2,
      tail,
    ])

    expect(reordered).toEqual([
      plainBefore,
      lateProgressReplacement,
      lateResult2,
      lateResult1,
      lateUse,
      firstUse,
      firstResult2,
      firstResult1,
      secondUse,
      progress2,
      progressResult2,
      progressResult1,
      secondResult,
      tail,
    ])
    expect(reordered.includes(orphanResult)).toBe(false)
    expect(reordered.includes(earlyProgress)).toBe(false)
    expect(reordered.includes(progress1)).toBe(false)
  })

  test(
    'matches established semantics for 1000 out-of-order, missing, and duplicate tool IDs with linear anchor work',
    () => {
      const { labels, messages } = buildLargeFixture(1_000)
      const expected = referenceReorderMessages(messages)
      const { result: reordered, visits } = countMapEntryVisits(() =>
        reorderMessages(messages),
      )

      expect(visits).toBeLessThanOrEqual(messages.length * 4)
      expect(reordered.map(message => labels.get(message))).toEqual(
        expected.map(message => labels.get(message)),
      )
      expect(
        reordered.every((message, index) => message === expected[index]),
      ).toBe(true)
    },
    { timeout: 20_000 },
  )
})
