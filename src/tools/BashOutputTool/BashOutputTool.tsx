import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '@components/Cost'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { Tool } from '@tool'
import { BunShell } from '@utils/BunShell'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'
import { formatOutput } from '@tools/BashTool/utils'

const inputSchema = z.strictObject({
  bash_id: z
    .string()
    .describe('The ID of the background shell to retrieve output from'),
  filter: z
    .string()
    .optional()
    .describe(
      'Optional regular expression to filter the output lines. Only lines matching this regex will be included in the result. Any lines that do not match will no longer be available to read.',
    ),
})

type Input = z.infer<typeof inputSchema>

type Output = {
  shellId: string
  stdout: string
  stderr: string
  command: string
  status: 'running' | 'completed' | 'failed' | 'killed'
  exitCode: number | null
  stdoutLines: number
  stderrLines: number
  error?: string
  filterPattern?: string
  timestamp: string
}

export const BashOutputTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'BashOutput'
  },
  inputSchema,
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  async isEnabled() {
    return true
  },
  needsPermissions() {
    return false
  },
  async prompt() {
    return PROMPT
  },
  renderToolUseMessage({ bash_id, filter }: Input) {
    return filter
      ? `Reading shell output (filtered: ${filter})`
      : 'Reading shell output'
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output: Output) {
    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text bold>
            {output.status === 'running'
              ? 'Background command running'
              : 'Background command finished'}
          </Text>
        </Box>
        <Cost costUSD={0} durationMs={0} debug={false} />
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    const parts: string[] = []
    parts.push(`<status>${output.status}</status>`)
    if (output.exitCode !== null && output.exitCode !== undefined) {
      parts.push(`<exit_code>${output.exitCode}</exit_code>`)
    }
    if (output.stdout.trim()) {
      parts.push(`<stdout>\n${output.stdout.trimEnd()}\n</stdout>`)
    }
    if (output.stderr.trim()) {
      parts.push(`<stderr>\n${output.stderr.trim()}\n</stderr>`)
    }
    parts.push(`<timestamp>${output.timestamp}</timestamp>`)
    return parts.join('\n\n')
  },
  async validateInput({ bash_id, filter }: Input) {
    if (filter) {
      try {
        new RegExp(filter, 'i')
      } catch (e) {
        return {
          result: false,
          message: `Invalid regex pattern "${filter}": ${e instanceof Error ? e.message : String(e)}`,
          errorCode: 1,
        }
      }
    }
    const bg = BunShell.getInstance().getBackgroundOutput(bash_id)
    if (!bg) {
      return {
        result: false,
        message: `No shell found with ID: ${bash_id}`,
        errorCode: 2,
      }
    }
    return { result: true }
  },
  async *call({ bash_id, filter }: Input) {
    const delta = BunShell.getInstance().readBackgroundOutput(bash_id, {
      filter,
    })
    if (!delta) {
      yield {
        type: 'result',
        data: {
          shellId: bash_id,
          command: '',
          status: 'failed' as const,
          exitCode: null,
          stdout: '',
          stderr: '',
          stdoutLines: 0,
          stderrLines: 0,
          timestamp: new Date().toISOString(),
        } satisfies Output,
        resultForAssistant: `No shell found with ID: ${bash_id}`,
      }
      return
    }

    const stdoutFormatted = formatOutput(delta.stdout.trimEnd())
    const stderrFormatted = formatOutput(delta.stderr.trimEnd())

    const output: Output = {
      shellId: delta.shellId,
      command: delta.command,
      status: delta.status,
      exitCode: delta.exitCode,
      stdout: stdoutFormatted.truncatedContent,
      stderr: stderrFormatted.truncatedContent,
      stdoutLines: delta.stdoutLines,
      stderrLines: delta.stderrLines,
      ...(delta.filterPattern ? { filterPattern: delta.filterPattern } : {}),
      timestamp: new Date().toISOString(),
    }

    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
