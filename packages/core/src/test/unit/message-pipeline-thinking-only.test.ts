import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test'
import { createAssistantMessage, createUserMessage } from '#core/utils/messages'
import type { AssistantMessage, Message } from '@kode/engine/message-pipeline'
import { __setLlmLazyQueryLLMLoaderForTests } from '#core/ai/llmLazy'
import { handleMessageStream } from '#core/ai/llm/openai/stream'
import { convertOpenAIResponseToAnthropic } from '#core/ai/llm/openai/conversion'

type QueryLLMImplementation = (
  messages: Message[],
  systemPrompt: string[],
) => Promise<AssistantMessage>

let queryLLMImplementation: QueryLLMImplementation = async () => {
  throw new Error('queryLLM implementation was not configured')
}

const queryLLM = mock(async (messages: Message[], systemPrompt: string[]) =>
  queryLLMImplementation(messages, systemPrompt),
)

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

async function createCompletedLegacyReasoningOnlyMessage(): Promise<AssistantMessage> {
  async function* stream() {
    yield {
      id: 'chatcmpl_reasoning_only',
      model: 'reasoning-model',
      created: 1,
      object: 'chat.completion.chunk',
      choices: [
        {
          index: 0,
          delta: { reasoning_content: 'Plan the next step' },
          finish_reason: null,
        },
      ],
    }
  }

  const completion = await handleMessageStream(stream() as any)
  const message = convertOpenAIResponseToAnthropic(completion, [])
  const base = createAssistantMessage('')
  return { ...base, message } as AssistantMessage
}

function createToolUseContext(maxTurns?: number) {
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
      maxTurns,
      persistSession: false,
    },
  } as any
}

describe('messagePipeline thinking-only recovery', () => {
  beforeEach(() => {
    __setLlmLazyQueryLLMLoaderForTests(async () => queryLLM)
  })

  afterEach(() => {
    __setLlmLazyQueryLLMLoaderForTests(null)
  })

  test('recovers within the same turn until the model returns a final response', async () => {
    const calls: Array<{ messages: Message[]; systemPrompt: string[] }> = []
    queryLLM.mockClear()
    queryLLMImplementation = async (messages, systemPrompt) => {
      calls.push({ messages, systemPrompt })
      return calls.length <= 3
        ? createThinkingOnlyMessage(`Reasoning attempt ${calls.length}`)
        : createAssistantMessage('I need your location to check weather.')
    }

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    const toolUseContext = createToolUseContext(1)
    const out: Message[] = []
    for await (const message of messagePipeline(
      [createUserMessage('How is the weather today?')],
      [],
      {},
      (async () => ({ result: true })) as any,
      toolUseContext,
    )) {
      out.push(message)
    }

    const assistantMessages = out.filter(
      (message): message is AssistantMessage => message.type === 'assistant',
    )
    expect(queryLLM).toHaveBeenCalledTimes(4)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]!.message.content[0]!.text).toContain('location')
    expect(calls[1]!.systemPrompt.join('\n')).toContain(
      'internal reasoning only',
    )
    expect(calls[3]!.systemPrompt.join('\n')).toContain(
      'Recovery attempt 3 of 3',
    )
    expect(calls.every(call => call.messages.length === 1)).toBe(true)
    const recoveryMessage = calls[1]!.messages[0]
    expect(recoveryMessage?.type).toBe('user')
    if (!recoveryMessage || recoveryMessage.type !== 'user') {
      throw new Error('thinking-only recovery must remain a user message')
    }
    expect(JSON.stringify(recoveryMessage.message.content)).toContain(
      '<thinking-only-recovery>',
    )
    expect(toolUseContext.turnCount).toBe(1)
  })

  test('returns an explicit error after bounded recovery is exhausted', async () => {
    queryLLM.mockClear()
    queryLLMImplementation = async () =>
      createThinkingOnlyMessage('Reasoning without a final response')

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    const toolUseContext = createToolUseContext(1)
    const out: Message[] = []
    for await (const message of messagePipeline(
      [createUserMessage('Complete this task.')],
      [],
      {},
      (async () => ({ result: true })) as any,
      toolUseContext,
    )) {
      out.push(message)
    }

    const assistantMessages = out.filter(
      (message): message is AssistantMessage => message.type === 'assistant',
    )
    const lastMessage = assistantMessages.at(-1)

    expect(queryLLM).toHaveBeenCalledTimes(4)
    expect(assistantMessages).toHaveLength(1)
    expect(lastMessage?.isApiErrorMessage).toBe(true)
    expect(lastMessage?.message.content[0]?.text).toContain(
      '4 consecutive attempts',
    )
    expect(toolUseContext.turnCount).toBe(1)
  })

  test('continues after a completed legacy OpenAI reasoning-only stream', async () => {
    queryLLM.mockClear()
    let callCount = 0
    queryLLMImplementation = async () => {
      callCount += 1
      if (callCount === 1) {
        return createCompletedLegacyReasoningOnlyMessage()
      }
      return createAssistantMessage('Recovered final response.')
    }

    const { messagePipeline } = await import('@kode/engine/message-pipeline')
    const out: Message[] = []
    for await (const message of messagePipeline(
      [createUserMessage('Continue the task.')],
      [],
      {},
      (async () => ({ result: true })) as any,
      createToolUseContext(1),
    )) {
      out.push(message)
    }

    const assistantMessages = out.filter(
      (message): message is AssistantMessage => message.type === 'assistant',
    )
    expect(queryLLM).toHaveBeenCalledTimes(2)
    expect(assistantMessages).toHaveLength(1)
    expect(assistantMessages[0]?.message.content[0]?.text).toBe(
      'Recovered final response.',
    )
  })
})
