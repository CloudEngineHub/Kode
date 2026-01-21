import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { getAbsolutePath } from '#core/utils/file'
import { hasReadPermission } from '#core/utils/permissions/filesystem'
import { getCwd } from '#core/utils/state'
import { maybeTruncateVerboseToolOutput } from '#core/utils/toolOutputDisplay'
import { existsSync, readFileSync, statSync } from 'fs'
import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { OPERATIONS } from './constants'
import { extractSymbolAtPosition, toProjectRelativeIfPossible } from './format'
import { summarizeToolResult } from './summary'
import { callLspTool, ensureLspManagerInitialized } from './call'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'

export const inputSchema = z.strictObject({
  operation: z.enum(OPERATIONS).describe('The LSP operation to perform'),
  filePath: z.string().describe('The absolute or relative path to the file'),
  line: z
    .number()
    .int()
    .positive()
    .describe('The line number (1-based, as shown in editors)'),
  character: z
    .number()
    .int()
    .positive()
    .describe('The character offset (1-based, as shown in editors)'),
})

export const outputSchema = z.object({
  operation: z
    .enum(OPERATIONS)
    .describe('The LSP operation that was performed'),
  result: z.string().describe('The formatted result of the LSP operation'),
  filePath: z.string().describe('The file path the operation was performed on'),
  resultCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of results (definitions, references, symbols)'),
  fileCount: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe('Number of files containing results'),
})

export type Input = z.infer<typeof inputSchema>
export type Output = z.infer<typeof outputSchema>

export const LspTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'LSP'
  },
  async isEnabled() {
    const manager = await ensureLspManagerInitialized()
    if (!manager) return false
    const servers = manager.getAllServers()
    if (servers.size === 0) return false
    return Array.from(servers.values()).some(s => s.state !== 'error')
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions({ filePath }: Input) {
    const abs = getAbsolutePath(filePath) ?? filePath
    return !hasReadPermission(abs || getCwd())
  },
  async validateInput(input: Input) {
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        result: false,
        message: `Invalid input: ${parsed.error.message}`,
        errorCode: 3,
      }
    }

    const absPath = getAbsolutePath(input.filePath) ?? input.filePath
    if (!existsSync(absPath)) {
      return {
        result: false,
        message: `File does not exist: ${input.filePath}`,
        errorCode: 1,
      }
    }
    try {
      if (!statSync(absPath).isFile()) {
        return {
          result: false,
          message: `Path is not a file: ${input.filePath}`,
          errorCode: 2,
        }
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      return {
        result: false,
        message: `Cannot access file: ${input.filePath}. ${e.message}`,
        errorCode: 4,
      }
    }

    return { result: true }
  },
  renderToolUseMessage(input: Input, { verbose }: { verbose: boolean }) {
    const abs = getAbsolutePath(input.filePath) ?? input.filePath
    const filePathForDisplay = verbose ? abs : toProjectRelativeIfPossible(abs)
    const parts: string[] = []

    if (
      (input.operation === 'goToDefinition' ||
        input.operation === 'findReferences' ||
        input.operation === 'hover' ||
        input.operation === 'goToImplementation') &&
      input.filePath &&
      input.line !== undefined &&
      input.character !== undefined
    ) {
      try {
        const content = readFileSync(abs, 'utf8')
        const symbol = extractSymbolAtPosition(
          content.split('\n'),
          input.line - 1,
          input.character - 1,
        )
        if (symbol) {
          parts.push(`operation: "${input.operation}"`)
          parts.push(`symbol: "${symbol}"`)
          parts.push(`in: "${filePathForDisplay}"`)
          return parts.join(', ')
        }
      } catch {
        // fall through
      }

      parts.push(`operation: "${input.operation}"`)
      parts.push(`file: "${filePathForDisplay}"`)
      parts.push(`position: ${input.line}:${input.character}`)
      return parts.join(', ')
    }

    parts.push(`operation: "${input.operation}"`)
    if (input.filePath) parts.push(`file: "${filePathForDisplay}"`)
    return parts.join(', ')
  },
  renderToolResultMessage(output: Output, { verbose }: { verbose: boolean }) {
    if (output.resultCount !== undefined && output.fileCount !== undefined) {
      const display = verbose
        ? maybeTruncateVerboseToolOutput(output.result, {
            maxLines: 120,
            maxChars: 20_000,
          })
        : null
      return (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
            {summarizeToolResult(
              output.operation,
              output.resultCount,
              output.fileCount,
            )}
          </Box>
          {display ? (
            <Box marginLeft={5}>
              <Text>{display.text}</Text>
            </Box>
          ) : null}
        </Box>
      )
    }

    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text>{output.result}</Text>
        </Box>
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return output.result
  },
  async *call(input: Input, context: ToolUseContext) {
    yield* callLspTool(input, context)
  },
} satisfies Tool<typeof inputSchema, Output>
