import { describe, expect, mock, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import type { AssistantMessage, Message } from '@kode/engine/message-pipeline'

function createThinkingOnlyMessage(text: string): AssistantMessage {
  const message = createAssistantMessage('')
  return {
    ...message,
    message: {
      ...message.message,
      model: 'mock-model',
      stop_reason: 'end_turn',
      content: [
        {
          type: 'thinking',
          thinking: text,
          signature: '',
        },
      ],
    },
  } as AssistantMessage
}

function createToolUseContext() {
  return {
    abortController: new AbortController(),
    messageId: undefined,
    readFileTimestamps: {},
    setToolJSX: () => {},
    turnCount: 0,
    options: {
      commands: [],
      forkNumber: 0,
      messageLogName: 'unused',
      tools: [],
      verbose: false,
      safeMode: false,
      maxThinkingTokens: 0,
      persistSession: false,
    },
  } as any
}

describe('messagePipeline thinking-only recovery', () => {
  test('continues once when a model returns only internal reasoning', async () => {
    const calls: Array<{ messages: Message[]; systemPrompt: string[] }> = []
    const queryLLM = mock(
      async (messages: Message[], systemPrompt: string[]) => {
        calls.push({ messages, systemPrompt })
        return calls.length === 1
          ? createThinkingOnlyMessage('I should use the weather tool.')
          : createAssistantMessage('I need your location to check weather.')
      },
    )

    mock.module('#core/ai/llm', () => ({
      API_ERROR_MESSAGE_PREFIX: 'API_ERROR: ',
      queryLLM,
    }))

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    const out: Message[] = []
    for await (const message of messagePipeline(
      [createUserMessage('How is the weather today?')],
      [],
      {},
      (async () => ({ result: true })) as any,
      createToolUseContext(),
    )) {
      out.push(message)
    }

    const assistantMessages = out.filter(
      (message): message is AssistantMessage => message.type === 'assistant',
    )
    expect(queryLLM).toHaveBeenCalledTimes(2)
    expect(assistantMessages).toHaveLength(2)
    expect(assistantMessages[0]!.message.content[0]!.type).toBe('thinking')
    expect(assistantMessages[1]!.message.content[0]!.text).toContain('location')
    expect(calls[1]!.systemPrompt.join('\n')).toContain(
      'internal reasoning only',
    )
    expect(calls[1]!.messages).toHaveLength(1)
  })
})
