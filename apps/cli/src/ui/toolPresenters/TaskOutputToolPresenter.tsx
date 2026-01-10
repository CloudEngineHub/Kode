import { Box, Text } from 'ink'
import React from 'react'

import { getTheme } from '#core/utils/theme'
import { maybeTruncateVerboseToolOutput } from '#core/utils/toolOutputDisplay'

type TaskType = 'local_bash' | 'local_agent' | 'remote_agent'
type TaskStatus = 'running' | 'pending' | 'completed' | 'failed' | 'killed'

type TaskSummary = {
  task_id: string
  task_type: TaskType
  status: TaskStatus
  description: string
  output?: string
  exitCode?: number | null
  prompt?: string
  result?: string
  error?: string
}

type Output = {
  retrieval_status: 'success' | 'timeout' | 'not_ready'
  task: TaskSummary | null
}

export function renderTaskOutputToolUseMessageFromNormalized(input: {
  block?: boolean
}): string {
  if (input.block === false) return 'non-blocking'
  return ''
}

export function renderTaskOutputToolResultMessage(
  output: Output,
  { verbose }: { verbose: boolean },
) {
  const theme = getTheme()

  if (
    output.retrieval_status === 'timeout' ||
    output.retrieval_status === 'not_ready'
  ) {
    return (
      <Box>
        <Text color={theme.secondaryText}>Task is still running…</Text>
      </Box>
    )
  }

  if (!output.task) {
    return (
      <Box>
        <Text color={theme.secondaryText}>No task output available</Text>
      </Box>
    )
  }

  if (output.task.task_type === 'local_agent') {
    const lines = output.task.result ? output.task.result.split('\n').length : 0
    if (!verbose) {
      return (
        <Box>
          <Text color={theme.secondaryText}>
            Read output (ctrl+o to expand)
          </Text>
        </Box>
      )
    }
    return (
      <Box flexDirection="column">
        <Text>
          {output.task.description} ({lines} lines)
        </Text>
        {output.task.prompt ? (
          <Box paddingLeft={2}>
            <Text color={theme.secondaryText}>{output.task.prompt}</Text>
          </Box>
        ) : null}
        {output.task.result ? (
          <Box paddingLeft={2} marginTop={1}>
            <Text>
              {
                maybeTruncateVerboseToolOutput(output.task.result, {
                  maxLines: 200,
                  maxChars: 40_000,
                }).text
              }
            </Text>
          </Box>
        ) : null}
        {output.task.error ? (
          <Box flexDirection="column" marginTop={1} paddingLeft={2}>
            <Text color={theme.error} bold>
              Error:
            </Text>
            <Text color={theme.error}>{output.task.error}</Text>
          </Box>
        ) : null}
      </Box>
    )
  }

  // local_bash
  const content = output.task.output?.trimEnd() ?? ''
  if (!verbose) {
    return (
      <Box>
        <Text color={theme.secondaryText}>
          {content.length > 0
            ? 'Read output (ctrl+o to expand)'
            : '(No content)'}
        </Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text color={theme.secondaryText}>{output.task.description}</Text>
      {content ? (
        <Box paddingLeft={2} marginTop={1}>
          <Text>
            {
              maybeTruncateVerboseToolOutput(content, {
                maxLines: 200,
                maxChars: 40_000,
              }).text
            }
          </Text>
        </Box>
      ) : null}
    </Box>
  )
}
