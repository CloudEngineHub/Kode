import type {
  ImageBlockParam,
  ToolResultBlockParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import type { RequestOptions } from '@modelcontextprotocol/sdk/shared/protocol.js'
import {
  CallToolResultSchema,
  type ListToolsResult,
  ListToolsResultSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { memoize } from 'lodash-es'
import { z } from 'zod'

import type { Tool } from '#core/tooling/Tool'
import { logMCPError } from '#core/utils/log'
import { createAssistantMessage } from '#core/utils/messages'

import {
  IDE_MCP_TOOL_ALLOWLIST,
  getMcpToolTimeoutMs,
  sanitizeMcpIdentifierPart,
} from './settings'
import { requestAllPages } from './request'
import { createTimeoutSignal, mergeAbortSignals } from './timeouts'
import type { ConnectedClient } from './types'
import { isRecord } from './utils'
import { getMcpListChangedVersion } from './listChanged'

type AnthropicImageMediaType = Extract<
  ImageBlockParam['source'],
  { type: 'base64' }
>['media_type']

function isTextBlock(value: unknown): value is { type: 'text'; text: string } {
  return (
    isRecord(value) && value.type === 'text' && typeof value.text === 'string'
  )
}

function isImageBlock(value: unknown): value is { type: 'image' } {
  return isRecord(value) && value.type === 'image'
}

function renderToolUseMessage(input: unknown): string {
  if (!isRecord(input)) return String(input ?? '')
  return Object.entries(input)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join(', ')
}

function renderToolResultMessage(output: unknown): string {
  if (Array.isArray(output)) {
    return output
      .map(item => {
        if (!item || typeof item !== 'object') return String(item ?? '')
        if (isImageBlock(item)) return '[Image]'
        if (isTextBlock(item)) return item.text
        return JSON.stringify(item)
      })
      .join('\n')
  }
  if (!output) return '(No content)'
  return typeof output === 'string' ? output : JSON.stringify(output)
}

function renderResultForAssistant(content: unknown): string | unknown[] {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content
  if (!content) return ''
  try {
    return JSON.stringify(content)
  } catch {
    return String(content)
  }
}

function formatProgressNumber(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(2)))
}

function formatMcpToolProgress(args: {
  server: string
  tool: string
  progress: unknown
}): string {
  const record = isRecord(args.progress) ? args.progress : null
  const message =
    typeof record?.message === 'string' && record.message.trim()
      ? record.message.trim()
      : ''
  const current = formatProgressNumber(record?.progress)
  const total = formatProgressNumber(record?.total)
  const ratio = current && total ? `${current}/${total}` : current
  const detail = [message, ratio ? `(${ratio})` : ''].filter(Boolean).join(' ')

  return detail
    ? `MCP ${args.server}/${args.tool}: ${detail}`
    : `MCP ${args.server}/${args.tool}: progress update`
}

export const getMCPTools = memoize(
  async (): Promise<Tool[]> => {
    const toolsList = await requestAllPages<
      ListToolsResult,
      typeof ListToolsResultSchema
    >({ method: 'tools/list' }, ListToolsResultSchema, 'tools')

    const inputSchema = z.object({}).passthrough()

    return toolsList.flatMap(({ client, results }) => {
      const serverPart = sanitizeMcpIdentifierPart(client.name)
      const tools = results.flatMap(result => result.tools ?? [])

      return tools
        .map((tool): Tool | null => {
          const toolPart = sanitizeMcpIdentifierPart(tool.name)
          const name = `mcp__${serverPart}__${toolPart}`

          if (
            name.startsWith('mcp__ide__') &&
            !IDE_MCP_TOOL_ALLOWLIST.has(name)
          ) {
            return null
          }

          return {
            name,
            isMcp: true,
            cachedDescription: tool.description ?? '',
            async isEnabled() {
              return true
            },
            isConcurrencySafe() {
              return tool.annotations?.readOnlyHint ?? false
            },
            isReadOnly() {
              return tool.annotations?.readOnlyHint ?? false
            },
            async description() {
              return tool.description ?? ''
            },
            async prompt() {
              return tool.description ?? ''
            },
            inputSchema,
            inputJSONSchema: tool.inputSchema as Tool['inputJSONSchema'],
            needsPermissions() {
              return true
            },
            async validateInput() {
              return { result: true }
            },
            renderToolUseMessage,
            renderToolUseRejectedMessage() {
              return null
            },
            renderToolResultMessage,
            renderResultForAssistant,
            async *call(args: Record<string, unknown>, context) {
              let pendingProgressText: string | null = null
              let lastProgressText: string | null = null
              let progressAvailableResolve: (() => void) | null = null
              let data: ToolResultBlockParam['content'] | undefined
              let callError: unknown
              let callDone = false

              const wakeProgressLoop = () => {
                const resolve = progressAvailableResolve
                if (!resolve) return
                progressAvailableResolve = null
                resolve()
              }

              const callPromise = callMcpTool({
                client,
                tool: tool.name,
                args,
                toolUseId: context.toolUseId,
                signal: context.abortController.signal,
                onProgress: progress => {
                  context.options?.onStreamEvent?.({
                    type: 'mcp_progress',
                    server: client.name,
                    tool: tool.name,
                    toolUseId: context.toolUseId,
                    progress,
                  })

                  const progressText = formatMcpToolProgress({
                    server: client.name,
                    tool: tool.name,
                    progress,
                  })
                  if (progressText === lastProgressText) return
                  lastProgressText = progressText
                  pendingProgressText = progressText
                  wakeProgressLoop()
                },
              })
                .then(result => {
                  data = result
                })
                .catch(error => {
                  callError = error
                })
                .finally(() => {
                  callDone = true
                  wakeProgressLoop()
                })

              while (!callDone || pendingProgressText) {
                while (pendingProgressText) {
                  const progressText = pendingProgressText
                  pendingProgressText = null
                  yield {
                    type: 'progress' as const,
                    content: createAssistantMessage(
                      `<tool-progress>${progressText}</tool-progress>`,
                    ),
                  }
                }

                if (callDone) break

                await new Promise<void>(resolve => {
                  progressAvailableResolve = resolve
                })
              }

              await callPromise

              if (callError) throw callError

              yield {
                type: 'result' as const,
                data,
                resultForAssistant: data,
              }
            },
            userFacingName() {
              const title = tool.title?.trim() || tool.name
              return `${client.name} - ${title} (MCP)`
            },
          }
        })
        .filter((tool): tool is Tool => tool !== null)
    })
  },
  () => `tools@${getMcpListChangedVersion('tools')}`,
)

async function callMcpTool({
  client: { client, name },
  tool,
  args,
  toolUseId,
  signal,
  onProgress,
}: {
  client: ConnectedClient
  tool: string
  args: Record<string, unknown>
  toolUseId?: string
  signal?: AbortSignal
  onProgress?: (progress: unknown) => void
}): Promise<ToolResultBlockParam['content']> {
  const timeoutMs = getMcpToolTimeoutMs()
  const timeoutSignal = timeoutMs ? createTimeoutSignal(timeoutMs) : null
  const merged = mergeAbortSignals([signal, timeoutSignal?.signal])

  const meta =
    toolUseId && toolUseId.trim()
      ? { 'kode/toolUseId': toolUseId, 'claudecode/toolUseId': toolUseId }
      : undefined

  try {
    const options: RequestOptions | undefined =
      merged?.signal || onProgress
        ? {
            ...(merged?.signal ? { signal: merged.signal } : {}),
            onprogress: onProgress,
          }
        : undefined

    const rawResult = await client.callTool(
      {
        name: tool,
        arguments: args,
        ...(meta ? { _meta: meta } : {}),
      },
      CallToolResultSchema,
      options,
    )

    const result = CallToolResultSchema.parse(rawResult)

    if (result.isError) {
      const contentText = result.content.find(item => item.type === 'text')

      const extraError =
        isRecord(rawResult) && typeof rawResult.error === 'string'
          ? rawResult.error
          : isRecord(result) && typeof result.error === 'string'
            ? result.error
            : ''

      const message =
        contentText?.text?.trim() || extraError || `Error calling tool ${tool}`

      logMCPError(name, `Error calling tool ${tool}: ${message}`)
      throw new Error(message)
    }

    const toolResult =
      isRecord(rawResult) && rawResult.toolResult !== undefined
        ? rawResult.toolResult
        : isRecord(result) && result.toolResult !== undefined
          ? result.toolResult
          : undefined
    if (toolResult !== undefined) return String(toolResult)

    if (result.structuredContent !== undefined) {
      return JSON.stringify(result.structuredContent)
    }

    const blocks: Array<{ type: 'text'; text: string } | ImageBlockParam> = []

    for (const item of result.content) {
      switch (item.type) {
        case 'text':
          blocks.push({ type: 'text', text: item.text })
          break
        case 'image':
          blocks.push({
            type: 'image',
            source: {
              type: 'base64',
              data: item.data,
              media_type: item.mimeType as AnthropicImageMediaType,
            },
          })
          break
        default: {
          let text = ''
          try {
            text = JSON.stringify(item)
          } catch {
            text = String(item)
          }
          blocks.push({ type: 'text', text })
          break
        }
      }
    }

    return blocks.length > 0 ? blocks : '(No content)'
  } finally {
    merged?.cleanup()
    timeoutSignal?.cleanup()
  }
}
