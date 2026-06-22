import type { Message as ApiMessage } from '@anthropic-ai/sdk/resources/index.mjs'

import {
  createUserMessage,
  createAssistantMessage,
  REJECT_MESSAGE,
  REJECT_MESSAGE_WITH_FEEDBACK_PREFIX,
} from '@kode/core/utils/messages'
import {
  buildSystemPromptForSession,
  getSessionContext,
  runTurn,
} from '@kode/core/engine'
import type { AssistantMessage, Message } from '@kode/core/query'
import type { CanUseToolFn } from '@kode/core/permissions/canUseTool'
import { hasPermissionsToUseTool, savePermission } from '@kode/core/permissions'
import { getTotalCost } from '@kode/core/cost-tracker'
import {
  kodeMessageToSdkMessage,
  makeSdkResultMessage,
} from '#protocol/utils/kodeAgentStreamJson'
import { setSessionId } from '@kode/core/utils/sessionId'
import { setKodeAgentSessionForkInfo } from '#protocol/utils/kodeAgentSessionForkInfo'
import { setCwd, setOriginalCwd } from '@kode/core/utils/state'
import { grantReadPermissionForOriginalDir } from '@kode/core/utils/permissions/filesystem'
import {
  resolveToolDescription,
  type Tool,
  type ToolUseContext,
} from '@kode/core/tooling/Tool'
import type { InflightPermissionDecision } from '../ws/types'
import type { DaemonSession } from '../ws/types'

type WsSend = (payload: unknown) => void

type PermissionRequest = {
  type: 'permission_request'
  request_id: string
  tool_name: string
  tool_description: string
  input: Record<string, unknown>
}

function extractFirstAssistantText(message: ApiMessage): string | null {
  const blocks = Array.isArray(message.content) ? message.content : []
  for (const block of blocks) {
    if (block && typeof block === 'object' && block.type === 'text') {
      const maybeText = (block as { text?: unknown }).text
      if (typeof maybeText === 'string') return maybeText
    }
  }
  return null
}

export async function handleChatPrompt(args: {
  wsSend: WsSend
  session: DaemonSession
  prompt: string
  echo: boolean
  commands: unknown[]
  tools: Tool[]
  toolNames: string[]
  slashCommands: string[]
}): Promise<void> {
  const {
    wsSend,
    session,
    prompt,
    echo,
    commands,
    tools,
    toolNames,
    slashCommands,
  } = args

  setOriginalCwd(session.cwd)
  await setCwd(session.cwd)
  grantReadPermissionForOriginalDir()

  setKodeAgentSessionForkInfo(null)
  setSessionId(session.sessionId)

  const abortController = new AbortController()
  session.activeAbortController = abortController

  const startedAt = Date.now()
  const costBefore = getTotalCost()

  const userMsg = createUserMessage(prompt)
  session.messages.push(userMsg)
  const sdkUser = kodeMessageToSdkMessage(userMsg, session.sessionId)
  if (sdkUser) wsSend(sdkUser)

  if (echo) {
    const assistant = createAssistantMessage(prompt)
    session.messages.push(assistant)
    const sdkAssistant = kodeMessageToSdkMessage(assistant, session.sessionId)
    if (sdkAssistant) wsSend(sdkAssistant)

    wsSend(
      makeSdkResultMessage({
        sessionId: session.sessionId,
        result: prompt,
        numTurns: 1,
        usage: undefined,
        totalCostUsd: 0,
        durationMs: Date.now() - startedAt,
        durationApiMs: 0,
        isError: false,
      }),
    )

    session.activeAbortController = null
    return
  }

  const requestToolPermission = async (params: {
    tool: Tool
    input: Record<string, unknown>
    toolUseContext: ToolUseContext
    assistantMessage: AssistantMessage
  }): Promise<
    | { result: true }
    | {
        result: false
        message: string
        shouldPromptUser?: boolean
      }
  > => {
    const base = await hasPermissionsToUseTool(
      params.tool,
      params.input,
      params.toolUseContext,
      params.assistantMessage,
    )
    if (base.result === true) return { result: true }

    if (base.shouldPromptUser === false) {
      return {
        result: false,
        message: base.message,
        shouldPromptUser: false,
      }
    }

    if (params.toolUseContext.abortController.signal.aborted) {
      return {
        result: false,
        message: REJECT_MESSAGE,
        shouldPromptUser: false,
      }
    }

    const requestId =
      typeof params.toolUseContext.toolUseId === 'string' &&
      params.toolUseContext.toolUseId
        ? params.toolUseContext.toolUseId
        : crypto.randomUUID()

    const toolDescription = await resolveToolDescription(
      params.tool,
      params.input as never,
    )

    const request: PermissionRequest = {
      type: 'permission_request',
      request_id: requestId,
      tool_name: params.tool.name,
      tool_description: toolDescription,
      input: params.input,
    }
    wsSend(request)

    const decision = await new Promise<InflightPermissionDecision>(resolve => {
      session.inflightPermissionRequests.set(requestId, resolve)
    })

    if (params.toolUseContext.abortController.signal.aborted) {
      return {
        result: false,
        message: REJECT_MESSAGE,
        shouldPromptUser: false,
      }
    }

    if (decision.updatedInput && typeof decision.updatedInput === 'object') {
      Object.assign(params.input, decision.updatedInput)
    }

    if (decision.decision === 'deny') {
      try {
        params.toolUseContext.abortController.abort()
      } catch {}
      const message =
        decision.rejectionMessage && decision.rejectionMessage.trim()
          ? `${REJECT_MESSAGE_WITH_FEEDBACK_PREFIX}${decision.rejectionMessage.trim()}`
          : REJECT_MESSAGE
      return { result: false, message, shouldPromptUser: false }
    }

    if (decision.decision === 'allow_always') {
      try {
        await savePermission(
          params.tool,
          params.input,
          null,
          params.toolUseContext,
        )
      } catch {}
    }

    return { result: true }
  }

  const canUseTool: CanUseToolFn = async (
    tool,
    input,
    toolUseContext,
    assistantMessage,
  ) => {
    return await requestToolPermission({
      tool,
      input,
      toolUseContext,
      assistantMessage,
    })
  }

  const [context, systemPrompt] = await Promise.all([
    getSessionContext(),
    buildSystemPromptForSession({ disableSlashCommands: false }),
  ])

  const options = {
    commands,
    tools,
    verbose: true,
    safeMode: false,
    forkNumber: 0,
    messageLogName: session.sessionId,
    maxThinkingTokens: 0,
    persistSession: true,
    toolPermissionContext: session.toolPermissionContext,
    mcpClients: [],
    shouldAvoidPermissionPrompts: false,
  }

  let lastAssistant: AssistantMessage | null = null
  let queryError: unknown = null

  try {
    const baseMessages: Message[] = [...session.messages]

    for await (const m of runTurn({
      messages: baseMessages,
      systemPrompt,
      context,
      canUseTool,
      toolUseContext: {
        options,
        abortController,
        messageId: undefined,
        readFileTimestamps: session.readFileTimestamps,
        setToolJSX: () => {},
        agentId: 'main',
        responseState: session.responseState,
      },
    })) {
      if (abortController.signal.aborted) break

      if (m.type === 'assistant') lastAssistant = m
      if (m.type !== 'progress') {
        session.messages.push(m)
      }
      const sdk = kodeMessageToSdkMessage(m, session.sessionId)
      if (sdk) wsSend(sdk)
    }
  } catch (err) {
    queryError = err
    try {
      abortController.abort()
    } catch {}
  } finally {
    session.activeAbortController = null
  }

  const resultFromAssistant = lastAssistant
    ? extractFirstAssistantText(lastAssistant.message as ApiMessage)
    : null
  const resultText =
    typeof resultFromAssistant === 'string'
      ? resultFromAssistant
      : queryError instanceof Error
        ? queryError.message
        : queryError
          ? String(queryError)
          : ''

  const usage = lastAssistant?.message?.usage
  const durationMs = Date.now() - startedAt
  const totalCostUsd = Math.max(0, getTotalCost() - costBefore)
  const isError = Boolean(queryError) || abortController.signal.aborted

  wsSend(
    makeSdkResultMessage({
      sessionId: session.sessionId,
      result: String(resultText),
      numTurns: 1,
      usage,
      totalCostUsd,
      durationMs,
      durationApiMs: 0,
      isError,
    }),
  )
}
