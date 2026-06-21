import type {
  ImageBlockParam,
  MessageParam,
} from '@anthropic-ai/sdk/resources/index.mjs'
import { memoize, zipObject } from 'lodash-es'
import type { ListPromptsResult } from '@modelcontextprotocol/sdk/types.js'
import { ListPromptsResultSchema } from '@modelcontextprotocol/sdk/types.js'

import { logMCPError } from '#core/utils/log'

import { sanitizeMcpIdentifierPart } from './settings'
import { requestAll } from './request'
import type { ConnectedClient } from './types'
import { getMcpListChangedVersion } from './listChanged'

type AnthropicImageMediaType = Extract<
  ImageBlockParam['source'],
  { type: 'base64' }
>['media_type']

export type McpPromptCommand = {
  type: 'prompt'
  name: string
  description: string
  isEnabled: boolean
  isHidden: boolean
  progressMessage: string
  argNames: string[]
  userFacingName(): string
  getPromptForCommand(args: string): Promise<MessageParam[]>
}

export const getMCPCommands = memoize(
  async (): Promise<McpPromptCommand[]> => {
    const results = await requestAll<
      ListPromptsResult,
      typeof ListPromptsResultSchema
    >({ method: 'prompts/list' }, ListPromptsResultSchema, 'prompts')

    return results.flatMap(({ client, result }) =>
      result.prompts?.map(prompt => {
        const serverPart = sanitizeMcpIdentifierPart(client.name)
        const argNames = (prompt.arguments ?? []).map(arg => arg.name)

        return {
          type: 'prompt',
          name: `mcp__${serverPart}__${prompt.name}`,
          description: prompt.description ?? '',
          isEnabled: true,
          isHidden: false,
          progressMessage: 'running',
          userFacingName() {
            const title = prompt.title?.trim() || prompt.name
            return `${client.name}:${title} (MCP)`
          },
          argNames,
          async getPromptForCommand(args: string) {
            const argsArray = args.split(' ')
            return await runCommand(
              { name: prompt.name, client },
              zipObject(argNames, argsArray),
            )
          },
        }
      }),
    )
  },
  () => `prompts@${getMcpListChangedVersion('prompts')}`,
)

export async function runCommand(
  { name, client }: { name: string; client: ConnectedClient },
  args: Record<string, string>,
): Promise<MessageParam[]> {
  try {
    const result = await client.client.getPrompt({ name, arguments: args })

    return result.messages.map((message): MessageParam => {
      const content = message.content
      switch (content.type) {
        case 'text':
          return {
            role: message.role,
            content: [{ type: 'text', text: content.text }],
          }
        case 'image':
          return {
            role: message.role,
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  data: content.data,
                  media_type: content.mimeType as AnthropicImageMediaType,
                },
              },
            ],
          }
        default:
          return {
            role: message.role,
            content: [
              {
                type: 'text',
                text: `Unsupported MCP content type ${content.type}`,
              },
            ],
          }
      }
    })
  } catch (error) {
    logMCPError(
      client.name,
      `Error running command '${name}': ${error instanceof Error ? error.message : String(error)}`,
    )
    throw error
  }
}
