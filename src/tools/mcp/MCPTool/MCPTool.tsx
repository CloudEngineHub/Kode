import { Box, Text } from 'ink'
import * as React from 'react'
import { z } from 'zod'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { type Tool } from '@tool'
import { getTheme } from '@utils/theme'
import { DESCRIPTION, PROMPT } from './prompt'
import { OutputLine } from '@tools/BashTool/OutputLine'

const inputSchema = z.object({}).passthrough()

function extractSingleResultText(value: unknown): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length === 1 && typeof record.result === 'string') {
    return record.result
  }

  return null
}

function normalizeTextOutput(output: unknown): string {
  if (typeof output === 'string') {
    try {
      const resultText = extractSingleResultText(JSON.parse(output))
      if (resultText !== null) return resultText
    } catch {}

    return output
  }

  const resultText = extractSingleResultText(output)
  if (resultText !== null) return resultText

  return JSON.stringify(output)
}

export const MCPTool = {
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false
  },
  name: 'mcp',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  async *call() {
    yield {
      type: 'result',
      data: '',
      resultForAssistant: '',
    }
  },
  needsPermissions() {
    return true
  },
  renderToolUseMessage(input) {
    return Object.entries(input)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join(', ')
  },
  userFacingName: () => 'mcp',
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output) {
    const verbose = false
    if (Array.isArray(output)) {
      return (
        <Box flexDirection="column">
          {output.map((item, i) => {
            if (item.type === 'image') {
              return (
                <Box
                  key={i}
                  justifyContent="space-between"
                  overflowX="hidden"
                  width="100%"
                >
                  <Box flexDirection="row">
                    <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
                    <Text>[Image]</Text>
                  </Box>
                </Box>
              )
            }
            const content = normalizeTextOutput(item.text ?? item)
            const lines = content.split('\n').length
            return (
              <OutputLine
                key={i}
                content={content}
                lines={lines}
                verbose={verbose}
              />
            )
          })}
        </Box>
      )
    }

    if (!output) {
      return (
        <Box justifyContent="space-between" overflowX="hidden" width="100%">
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            <Text color={getTheme().secondaryText}>(No content)</Text>
          </Box>
        </Box>
      )
    }

    const content = normalizeTextOutput(output)
    const lines = content.split('\n').length
    return <OutputLine content={content} lines={lines} verbose={verbose} />
  },
  renderResultForAssistant(content) {
    return content
  },
} satisfies Tool<typeof inputSchema, string>
