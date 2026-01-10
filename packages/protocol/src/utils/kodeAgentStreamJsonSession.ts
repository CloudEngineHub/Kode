import type { SdkMessage } from '../streamJson'
import {
  makeSdkResultMessage,
  kodeMessageToSdkMessage,
} from './kodeAgentStreamJson'
import type { KodeAgentStructuredStdio } from './kodeAgentStructuredStdio'

type MessageWithUuid = { type: string; uuid: string }

type QueryFn<
  M extends MessageWithUuid,
  C extends { abortController: AbortController },
> = (
  messages: M[],
  systemPrompt: string[],
  context: { [k: string]: string },
  canUseTool: unknown,
  toolUseContext: C,
) => AsyncGenerator<M, void>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function extractAssistantTextFromMessage(message: unknown): string {
  if (!isRecord(message) || message.type !== 'assistant') return ''
  const msg = isRecord(message.message) ? message.message : null
  const content = msg?.content
  if (!Array.isArray(content)) return ''

  for (const block of content) {
    const record = isRecord(block) ? block : null
    if (!record) continue
    if (record.type === 'text' && typeof record.text === 'string') {
      return record.text
    }
  }

  return ''
}

function extractAssistantUsage(message: unknown): unknown {
  if (!isRecord(message) || message.type !== 'assistant') return undefined
  const msg = isRecord(message.message) ? message.message : null
  return msg?.usage
}

export async function runKodeAgentStreamJsonSession<
  M extends MessageWithUuid,
  C extends { abortController: AbortController },
>(args: {
  structured: KodeAgentStructuredStdio
  query: QueryFn<M, C>
  makeUserMessage: (
    content: string | unknown[],
    uuidOverride: string | null,
  ) => M
  writeSdkLine: (obj: SdkMessage) => void
  sessionId: string
  systemPrompt: string[]
  jsonSchema?: Record<string, unknown> | null
  context: { [k: string]: string }
  canUseTool: unknown
  toolUseContextBase: Omit<C, 'abortController'> & {
    abortController?: never
  }
  replayUserMessages: boolean
  getTotalCostUsd: () => number
  onActiveTurnAbortControllerChanged?: (
    controller: AbortController | null,
  ) => void
  initialMessages?: M[]
}): Promise<void> {
  const conversation: M[] = [...(args.initialMessages ?? [])]
  const seenUserUuids = new Set<string>()

  while (true) {
    let sdkUser: unknown
    try {
      sdkUser = await args.structured.nextUserMessage()
    } catch {
      return
    }

    const sdkUserRecord = isRecord(sdkUser) ? sdkUser : null
    const sdkMessage = isRecord(sdkUserRecord?.message)
      ? sdkUserRecord?.message
      : null
    const sdkContent = sdkMessage?.content
    if (typeof sdkContent !== 'string' && !Array.isArray(sdkContent)) {
      throw new Error('Error: Invalid stream-json user message content')
    }

    const providedUuid =
      typeof sdkUserRecord?.uuid === 'string' && sdkUserRecord.uuid
        ? String(sdkUserRecord.uuid)
        : null

    const isDuplicate = Boolean(providedUuid && seenUserUuids.has(providedUuid))

    const userMsg = args.makeUserMessage(sdkContent, providedUuid)

    if (args.replayUserMessages) {
      const sdkUserOut = kodeMessageToSdkMessage(userMsg, args.sessionId)
      if (sdkUserOut) args.writeSdkLine(sdkUserOut)
    }

    if (isDuplicate) {
      continue
    }

    if (providedUuid) seenUserUuids.add(providedUuid)

    conversation.push(userMsg)

    const costBefore = args.getTotalCostUsd()
    const startedAt = Date.now()
    const turnAbortController = new AbortController()
    args.onActiveTurnAbortControllerChanged?.(turnAbortController)

    let lastAssistant: M | null = null
    let queryError: unknown = null
    const toAppend: M[] = []

    try {
      const inputForTurn = [...conversation]
      const toolUseContext = {
        ...args.toolUseContextBase,
        abortController: turnAbortController,
      } as C

      for await (const m of args.query(
        inputForTurn,
        args.systemPrompt,
        args.context,
        args.canUseTool,
        toolUseContext,
      )) {
        if (m.type === 'assistant') lastAssistant = m
        if (m.type !== 'progress') {
          toAppend.push(m)
        }

        const sdk = kodeMessageToSdkMessage(m, args.sessionId)
        if (sdk) args.writeSdkLine(sdk)
      }
    } catch (e) {
      queryError = e
      try {
        turnAbortController.abort()
      } catch {}
    } finally {
      args.onActiveTurnAbortControllerChanged?.(null)
    }

    conversation.push(...toAppend)

    const textFromAssistant = extractAssistantTextFromMessage(lastAssistant)
    const resultText =
      typeof textFromAssistant === 'string' && textFromAssistant
        ? textFromAssistant
        : queryError instanceof Error
          ? queryError.message
          : queryError
            ? String(queryError)
            : ''

    let structuredOutput: Record<string, unknown> | undefined
    if (args.jsonSchema && !queryError) {
      try {
        const fenced = String(resultText).trim()
        const unfenced = (() => {
          const m = fenced.match(/^```(?:json)?\\s*([\\s\\S]*?)\\s*```$/i)
          return m ? m[1]!.trim() : fenced
        })()

        const parsed = JSON.parse(unfenced) as unknown
        const { default: Ajv } = await import('ajv')
        const ajv = new Ajv({ allErrors: true, strict: false })
        const validate = ajv.compile(args.jsonSchema)
        const ok = validate(parsed)
        if (!ok) {
          const errorText =
            typeof ajv.errorsText === 'function'
              ? ajv.errorsText(validate.errors, { separator: '; ' })
              : JSON.stringify(validate.errors ?? [])
          throw new Error(
            `Structured output failed JSON schema validation: ${errorText}`,
          )
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('Structured output must be a JSON object')
        }
        structuredOutput = parsed as Record<string, unknown>
      } catch (e) {
        queryError = e
      }
    }

    const usage = extractAssistantUsage(lastAssistant)
    const durationMs = Date.now() - startedAt
    const totalCostUsd = Math.max(0, args.getTotalCostUsd() - costBefore)
    const isError = Boolean(queryError) || turnAbortController.signal.aborted

    args.writeSdkLine(
      makeSdkResultMessage({
        sessionId: args.sessionId,
        result: String(resultText),
        structuredOutput,
        numTurns: 1,
        usage,
        totalCostUsd,
        durationMs,
        durationApiMs: 0,
        isError,
      }),
    )
  }
}
