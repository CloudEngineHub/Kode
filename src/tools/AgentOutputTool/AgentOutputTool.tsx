import { Box, Text } from 'ink'
import React from 'react'
import { z } from 'zod'
import { Cost } from '@components/Cost'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import type { Tool } from '@tool'
import { createAssistantMessage } from '@utils/messages'
import {
  getBackgroundAgentTaskSnapshot,
  markBackgroundAgentTaskRetrieved,
  waitForBackgroundAgentTask,
} from '@utils/backgroundTasks'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'

const inputSchema = z.strictObject({
  agentId: z.string().describe('The agent ID to retrieve results for'),
  block: z.boolean().optional().describe('Whether to block until results are ready'),
  wait_up_to: z
    .number()
    .min(0)
    .max(300)
    .optional()
    .describe('Maximum time to wait in seconds'),
})

type Input = z.infer<typeof inputSchema>

type AgentInfo = {
  status: string
  description: string
  prompt: string
  result?: string
  error?: string
}

type Output = {
  retrieval_status: 'success' | 'timeout' | 'not_ready'
  agents: Record<string, AgentInfo>
}

function taskToAgentInfo(task: ReturnType<typeof getBackgroundAgentTaskSnapshot>): AgentInfo | null {
  if (!task) return null
  return {
    status: task.status,
    description: task.description,
    prompt: task.prompt,
    ...(task.resultText ? { result: task.resultText } : {}),
    ...(task.error ? { error: task.error } : {}),
  }
}

export const AgentOutputTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return 'Agent Output'
  },
  async isEnabled() {
    return true
  },
  isReadOnly() {
    return true
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  async validateInput({ agentId }: Input) {
    if (!agentId?.trim()) {
      return { result: false, message: 'Agent ID is required', errorCode: 1 }
    }
    const task = getBackgroundAgentTaskSnapshot(agentId)
    if (!task) {
      return { result: false, message: `No agent found with ID: ${agentId}`, errorCode: 3 }
    }
    if (task.type !== 'async_agent') {
      return { result: false, message: `Task ${agentId} is not an async agent`, errorCode: 4 }
    }
    return { result: true }
  },
  renderToolUseMessage(input: Input) {
    const block = input.block ?? true
    if (!block) return 'non-blocking'
    return ''
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output: Output) {
    const agentCount = Object.keys(output.agents).length
    const label =
      output.retrieval_status === 'success'
        ? 'Agent output'
        : output.retrieval_status === 'timeout'
          ? 'Agent still running'
          : 'Agent not ready'

    return (
      <Box justifyContent="space-between" width="100%">
        <Box flexDirection="row">
          <Text>&nbsp;&nbsp;⎿ &nbsp;</Text>
          <Text bold>{label}</Text>
          <Text>{agentCount > 0 ? ` (${agentCount})` : ''}</Text>
        </Box>
        <Cost costUSD={0} durationMs={0} debug={false} />
      </Box>
    )
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async *call(
    { agentId, block, wait_up_to }: Input,
    { abortController }: any,
  ) {
    const shouldBlock = block ?? true
    const waitSeconds = wait_up_to ?? 150

    if (!shouldBlock) {
      const task = getBackgroundAgentTaskSnapshot(agentId)
      const agent = taskToAgentInfo(task)
      if (task && task.status !== 'running' && agent) {
        markBackgroundAgentTaskRetrieved(agentId)
        const output: Output = {
          retrieval_status: 'success',
          agents: { [agentId]: agent },
        }
        yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
        return
      }
      const output: Output = { retrieval_status: 'not_ready', agents: {} }
      yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
      return
    }

    yield {
      type: 'progress',
      content: createAssistantMessage('Listening to agent output'),
    }

    try {
      const task = await waitForBackgroundAgentTask(
        agentId,
        waitSeconds * 1000,
        abortController.signal,
      )
      const snapshot = task ? getBackgroundAgentTaskSnapshot(task.agentId) : null
      const agent = taskToAgentInfo(snapshot)
      markBackgroundAgentTaskRetrieved(agentId)
      const output: Output = {
        retrieval_status: 'success',
        agents: agent ? { [agentId]: agent } : {},
      }
      yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('Request timed out')) {
        const snapshot = getBackgroundAgentTaskSnapshot(agentId)
        const agent = taskToAgentInfo(snapshot)
        const output: Output = {
          retrieval_status: 'timeout',
          agents: agent ? { [agentId]: agent } : {},
        }
        yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
        return
      }
      const output: Output = { retrieval_status: 'not_ready', agents: {} }
      yield { type: 'result', data: output, resultForAssistant: this.renderResultForAssistant(output) }
    }
  },
} satisfies Tool<typeof inputSchema, Output>

