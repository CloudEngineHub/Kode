import { describe, expect, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import type { Message } from '#core/query'
import { estimateTokens, estimateTokensIncremental } from '#core/utils/tokens'

function makeAssistantText(text: string): Message {
  return createAssistantMessage(text)
}

describe('incremental token estimation', () => {
  test('matches full token estimation while reusing a stable prefix', () => {
    const messages: Message[] = [
      createUserMessage('hello world'),
      makeAssistantText('assistant response'),
      createUserMessage('next prompt'),
      makeAssistantText('second response'),
    ]

    const first = estimateTokensIncremental({
      messages,
      previous: null,
      tailWindow: 2,
    })
    expect(first.totalTokens).toBe(estimateTokens(messages))

    const nextMessages = [...messages, createUserMessage('more input')]
    const next = estimateTokensIncremental({
      messages: nextMessages,
      previous: first,
      tailWindow: 2,
    })

    expect(next.totalTokens).toBe(estimateTokens(nextMessages))
    expect(next.messageBaseTokens[0]).toBe(first.messageBaseTokens[0])
  })

  test('re-estimates the tail when a message object is updated in place', () => {
    const tail = makeAssistantText('short')
    const messages: Message[] = [
      createUserMessage('hello'),
      makeAssistantText('stable prefix'),
      tail,
    ]

    const first = estimateTokensIncremental({
      messages,
      previous: null,
      tailWindow: 2,
    })
    expect(first.totalTokens).toBe(estimateTokens(messages))

    if (tail.type !== 'assistant') throw new Error('expected assistant')
    tail.message.content = [
      { type: 'text', text: 'x'.repeat(400), citations: [] },
    ]

    const nextMessages = [...messages]
    const next = estimateTokensIncremental({
      messages: nextMessages,
      previous: first,
      tailWindow: 2,
    })

    expect(next.totalTokens).toBe(estimateTokens(nextMessages))
    expect(next.totalTokens).toBeGreaterThan(first.totalTokens)
  })
})
