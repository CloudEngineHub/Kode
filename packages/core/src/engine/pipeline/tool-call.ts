import type { CanUseToolFn } from '#core/permissions/canUseTool'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getCwd } from '#core/utils/state'
import { logError } from '#core/utils/log'
import type { ToolResultBlockParam } from '@anthropic-ai/sdk/resources/index.mjs'
import {
  createAssistantMessage,
  createProgressMessage,
  createUserMessage,
} from '#core/utils/messages'
import { maybePersistOversizedToolResult } from '#core/utils/toolResultPersistence'
import {
  getHookTranscriptPath,
  queueHookAdditionalContexts,
  queueHookSystemMessages,
  runPostToolUseHooks,
  runPreToolUseHooks,
} from '#core/utils/kodeHooks'
import { runBuiltinPreToolUseGuards } from '#core/hooks/builtin/preToolUse'

import type { AssistantMessage, Message } from './types'
import { normalizeToolInput, preprocessToolInput } from './tool-input'

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, unknown>
}

function isPipelineMessage(value: unknown): value is Message {
  const record = asRecord(value)
  if (!record) return false
  return (
    record.type === 'user' ||
    record.type === 'assistant' ||
    record.type === 'progress'
  )
}

function toToolResultContent(value: unknown): ToolResultBlockParam['content'] {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value as ToolResultBlockParam['content']
  return String(value)
}

export async function* checkPermissionsAndCallTool(
  tool: Tool,
  toolUseID: string,
  siblingToolUseIDs: Set<string>,
  input: Record<string, unknown>,
  context: ToolUseContext,
  canUseTool: CanUseToolFn,
  assistantMessage: AssistantMessage,
  shouldSkipPermissionCheck?: boolean,
): AsyncGenerator<Message, void> {
  const preprocessedInput = preprocessToolInput(tool, input)
  const isValidInput = tool.inputSchema.safeParse(preprocessedInput)
  if (!isValidInput.success) {
    let errorMessage = `InputValidationError: ${isValidInput.error.message}`

    if (tool.name === 'Read' && Object.keys(preprocessedInput).length === 0) {
      errorMessage =
        'Error: The Read tool requires a \'file_path\' parameter to specify which file to read. Please provide the absolute path to the file you want to read. For example: {"file_path": "/path/to/file.txt"}'
    }

    yield createUserMessage([
      {
        type: 'tool_result',
        content: errorMessage,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  let normalizedInput = normalizeToolInput(tool, isValidInput.data)

  const builtinOutcome = runBuiltinPreToolUseGuards({
    toolName: tool.name,
    toolInput: normalizedInput,
    cwd: getCwd(),
  })
  if (builtinOutcome?.kind === 'block') {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: builtinOutcome.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  const isValidCall = await tool.validateInput?.(
    normalizedInput as never,
    context,
  )
  if (isValidCall?.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: isValidCall.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  const hookOutcome = await runPreToolUseHooks({
    toolName: tool.name,
    toolInput: normalizedInput,
    toolUseId: toolUseID,
    permissionMode: context.options?.toolPermissionContext?.mode,
    cwd: getCwd(),
    transcriptPath: getHookTranscriptPath(context),
    safeMode: context.options?.safeMode ?? false,
    signal: context.abortController.signal,
  })
  if (hookOutcome.kind === 'block') {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: hookOutcome.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }
  if (hookOutcome.warnings.length > 0) {
    const warningText = hookOutcome.warnings.join('\n')
    yield createProgressMessage(
      toolUseID,
      siblingToolUseIDs,
      createAssistantMessage(warningText),
      [],
      context.options?.tools ?? [],
    )
  }

  if (hookOutcome.systemMessages && hookOutcome.systemMessages.length > 0) {
    queueHookSystemMessages(context, hookOutcome.systemMessages)
  }
  if (
    hookOutcome.additionalContexts &&
    hookOutcome.additionalContexts.length > 0
  ) {
    queueHookAdditionalContexts(context, hookOutcome.additionalContexts)
  }

  if (hookOutcome.updatedInput) {
    const merged = { ...normalizedInput, ...hookOutcome.updatedInput }
    const parsed = tool.inputSchema.safeParse(merged)
    if (!parsed.success) {
      yield createUserMessage([
        {
          type: 'tool_result',
          content: `Hook updatedInput failed validation: ${parsed.error.message}`,
          is_error: true,
          tool_use_id: toolUseID,
        },
      ])
      return
    }
    normalizedInput = normalizeToolInput(tool, parsed.data)
    const isValidUpdate = await tool.validateInput?.(
      normalizedInput as never,
      context,
    )
    if (isValidUpdate?.result === false) {
      yield createUserMessage([
        {
          type: 'tool_result',
          content: isValidUpdate.message,
          is_error: true,
          tool_use_id: toolUseID,
        },
      ])
      return
    }
  }

  const hookPermissionDecision =
    hookOutcome.kind === 'allow' ? hookOutcome.permissionDecision : undefined

  const effectiveShouldSkipPermissionCheck =
    hookPermissionDecision === 'allow'
      ? true
      : hookPermissionDecision === 'ask'
        ? false
        : shouldSkipPermissionCheck

  const permissionContextForCall =
    hookPermissionDecision === 'ask' &&
    context.options?.toolPermissionContext &&
    context.options.toolPermissionContext.mode !== 'default'
      ? ({
          ...context,
          options: {
            ...context.options,
            toolPermissionContext: {
              ...context.options.toolPermissionContext,
              mode: 'default',
            },
          },
        } as const)
      : context

  const permissionResult = effectiveShouldSkipPermissionCheck
    ? ({ result: true } as const)
    : await canUseTool(
        tool,
        normalizedInput,
        { ...permissionContextForCall, toolUseId: toolUseID },
        assistantMessage,
      )

  if (permissionResult.result === false) {
    yield createUserMessage([
      {
        type: 'tool_result',
        content: permissionResult.message,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
    return
  }

  const updatedInput =
    'updatedInput' in permissionResult
      ? permissionResult.updatedInput
      : undefined

  if (updatedInput) {
    const parsed = tool.inputSchema.safeParse(updatedInput)
    if (!parsed.success) {
      yield createUserMessage([
        {
          type: 'tool_result',
          content: `Permission updatedInput failed validation: ${parsed.error.message}`,
          is_error: true,
          tool_use_id: toolUseID,
        },
      ])
      return
    }
    normalizedInput = normalizeToolInput(tool, parsed.data)
    const isValidUpdate = await tool.validateInput?.(
      normalizedInput as never,
      context,
    )
    if (isValidUpdate?.result === false) {
      yield createUserMessage([
        {
          type: 'tool_result',
          content: isValidUpdate.message,
          is_error: true,
          tool_use_id: toolUseID,
        },
      ])
      return
    }
  }

  try {
    const generator = tool.call(normalizedInput as never, {
      ...context,
      toolUseId: toolUseID,
    })

    for await (const result of generator) {
      switch (result.type) {
        case 'result': {
          const rawContent =
            result.resultForAssistant ??
            tool.renderResultForAssistant(result.data as never)
          const content = maybePersistOversizedToolResult({
            cwd: getCwd(),
            toolUseId: toolUseID,
            content: toToolResultContent(rawContent),
            maxResultSizeChars: tool.maxResultSizeChars,
          })
          const newMessages = Array.isArray(result.newMessages)
            ? result.newMessages.filter(isPipelineMessage)
            : []

          const postOutcome = await runPostToolUseHooks({
            toolName: tool.name,
            toolInput: normalizedInput,
            toolResult: result.data,
            toolUseId: toolUseID,
            permissionMode: context.options?.toolPermissionContext?.mode,
            cwd: getCwd(),
            transcriptPath: getHookTranscriptPath(context),
            safeMode: context.options?.safeMode ?? false,
            signal: context.abortController.signal,
          })

          if (postOutcome.systemMessages.length > 0) {
            queueHookSystemMessages(context, postOutcome.systemMessages)
          }
          if (postOutcome.additionalContexts.length > 0) {
            queueHookAdditionalContexts(context, postOutcome.additionalContexts)
          }
          if (postOutcome.warnings.length > 0) {
            const warningText = postOutcome.warnings.join('\n')
            yield createProgressMessage(
              toolUseID,
              siblingToolUseIDs,
              createAssistantMessage(warningText),
              [],
              context.options?.tools ?? [],
            )
          }

          yield createUserMessage(
            [
              {
                type: 'tool_result',
                content,
                tool_use_id: toolUseID,
              },
            ],
            {
              data: result.data,
              resultForAssistant: content,
              ...(newMessages.length > 0 ? { newMessages } : {}),
              ...(result.contextModifier
                ? { contextModifier: result.contextModifier }
                : {}),
            },
          )

          for (const message of newMessages) {
            yield message
          }

          return
        }
        case 'progress':
          yield createProgressMessage(
            toolUseID,
            siblingToolUseIDs,
            result.content,
            result.normalizedMessages || [],
            result.tools || [],
          )
          break
      }
    }
  } catch (error) {
    const content = formatError(error)
    logError(error)

    yield createUserMessage([
      {
        type: 'tool_result',
        content,
        is_error: true,
        tool_use_id: toolUseID,
      },
    ])
  }
}

function formatError(error: unknown): string {
  if (!(error instanceof Error)) return String(error)

  const parts = [error.message]
  if ('stderr' in error && typeof error.stderr === 'string') {
    parts.push(error.stderr)
  }
  if ('stdout' in error && typeof error.stdout === 'string') {
    parts.push(error.stdout)
  }

  const fullMessage = parts.filter(Boolean).join('\n')
  if (fullMessage.length <= 10000) return fullMessage

  const halfLength = 5000
  const start = fullMessage.slice(0, halfLength)
  const end = fullMessage.slice(-halfLength)
  return `${start}\n\n... [${fullMessage.length - 10000} characters truncated] ...\n\n${end}`
}
