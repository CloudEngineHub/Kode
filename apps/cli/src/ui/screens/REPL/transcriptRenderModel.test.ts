import { describe, expect, test } from 'bun:test'
import type { TextBlock } from '@anthropic-ai/sdk/resources/index.mjs'
import { createAssistantMessage, normalizeMessages } from '#core/utils/messages'
import {
  buildTranscriptRenderModel,
  type TranscriptChunkState,
} from './transcriptRenderModel'

function getText(
  message: ReturnType<typeof normalizeMessages>[number],
): string {
  if (message.type !== 'assistant') return ''
  const block = message.message.content[0] as TextBlock | undefined
  return block?.type === 'text' ? block.text : ''
}

describe('transcript render model', () => {
  test('promotes long transient assistant prefixes into static chunks', () => {
    const text = `${'chunk '.repeat(600)}tail`
    const [message] = normalizeMessages([createAssistantMessage(text)])
    const chunkState = new Map<string, TranscriptChunkState>()

    const model = buildTranscriptRenderModel({
      orderedMessages: [message!],
      replStaticPrefixLength: 0,
      chunkState,
    })

    expect(model.renderMessages.length).toBeGreaterThan(1)
    expect(model.replStaticPrefixLength).toBeGreaterThan(0)
    expect(model.renderMessages[0]?.isTransient).toBe(false)
    expect(model.renderMessages.at(-1)?.isTransient).toBe(true)
    expect(
      model.renderMessages.map(item => getText(item.message)).join(''),
    ).toBe(text)
  })

  test('leaves static-prefix messages as static render items', () => {
    const [message] = normalizeMessages([createAssistantMessage('done')])
    const chunkState = new Map<string, TranscriptChunkState>([
      [message!.uuid, { chunks: ['old'], prefixText: 'old' }],
    ])

    const model = buildTranscriptRenderModel({
      orderedMessages: [message!],
      replStaticPrefixLength: 1,
      chunkState,
    })

    expect(model.renderMessages).toHaveLength(1)
    expect(model.renderMessages[0]).toMatchObject({
      key: message!.uuid,
      isTransient: false,
    })
    expect(chunkState.has(message!.uuid)).toBe(false)
  })
})
