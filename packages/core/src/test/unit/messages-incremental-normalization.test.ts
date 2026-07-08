import { describe, expect, test } from 'bun:test'
import type { TextBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  createAssistantMessage,
  createUserMessage,
  normalizeMessages,
  normalizeMessagesIncremental,
} from '#core/utils/messages'
import type { Message } from '#core/query'

function makeAssistantText(text: string): Message {
  return createAssistantMessage(text)
}

function getFirstAssistantText(messages: ReturnType<typeof normalizeMessages>) {
  const assistant = messages.find(message => message.type === 'assistant')
  const block = assistant?.message.content[0] as TextBlockParam | undefined
  return block?.type === 'text' ? block.text : ''
}

describe('incremental message normalization', () => {
  test('matches full normalization and reuses stable prefix slices', () => {
    const messages: Message[] = [
      createUserMessage('hello'),
      makeAssistantText('one'),
      makeAssistantText('two'),
      makeAssistantText('three'),
      makeAssistantText('four'),
    ]

    const first = normalizeMessagesIncremental({
      messages,
      previous: null,
      tailWindow: 2,
    })
    expect(first.normalizedMessages).toEqual(normalizeMessages(messages))

    const nextMessages = [...messages, makeAssistantText('five')]
    const next = normalizeMessagesIncremental({
      messages: nextMessages,
      previous: first,
      tailWindow: 2,
    })

    expect(next.normalizedMessages).toEqual(normalizeMessages(nextMessages))
    expect(next.normalizedBySourceIndex[0]).toBe(
      first.normalizedBySourceIndex[0],
    )
    expect(next.normalizedBySourceIndex[1]).toBe(
      first.normalizedBySourceIndex[1],
    )
  })

  test('reprocesses tail messages even when the source object identity is stable', () => {
    const tail = makeAssistantText('tail before')
    const messages: Message[] = [
      createUserMessage('hello'),
      makeAssistantText('stable prefix'),
      tail,
    ]

    const first = normalizeMessagesIncremental({
      messages,
      previous: null,
      tailWindow: 2,
    })
    expect(getFirstAssistantText(first.normalizedMessages)).toBe(
      'stable prefix',
    )

    if (tail.type !== 'assistant') throw new Error('expected assistant')
    tail.message.content = [{ type: 'text', text: 'tail after', citations: [] }]

    const nextMessages = [...messages]
    const next = normalizeMessagesIncremental({
      messages: nextMessages,
      previous: first,
      tailWindow: 2,
    })

    expect(next.normalizedMessages).toEqual(normalizeMessages(nextMessages))
    const last = next.normalizedMessages.at(-1)
    const block = last?.type === 'assistant' ? last.message.content[0] : null
    expect(block?.type === 'text' ? block.text : '').toBe('tail after')
  })
})
