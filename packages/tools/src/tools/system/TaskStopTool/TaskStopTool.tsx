import { z } from 'zod'
import { Tool } from '#core/tooling/Tool'
import { BunShell } from '#runtime/shell'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'
import {
  getBackgroundAgentTaskSnapshot,
  killBackgroundAgentTask,
} from '#core/utils/backgroundTasks'

const inputSchema = z.strictObject({
  task_id: z
    .string()
    .optional()
    .describe('The ID of the background task to stop'),
  shell_id: z.string().optional().describe('Deprecated: use task_id instead'),
})

type Input = z.infer<typeof inputSchema>
type Output = {
  message: string
  task_id: string
  task_type: 'local_bash' | 'local_agent'
}

function resolveTaskId(input: Input): string | null {
  return input.task_id ?? input.shell_id ?? null
}

type TaskStatus = 'running' | 'pending' | 'completed' | 'failed' | 'killed'

function bashStatusFromRuntime(task: {
  code: number | null
  killed: boolean
  interrupted: boolean
}): TaskStatus {
  if (task.killed) return 'killed'
  if (task.code === null && !task.interrupted) return 'running'
  return task.code === 0 ? 'completed' : 'failed'
}

export const TaskStopTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Stop Task'
  },
  inputSchema,
  isReadOnly() {
    return false
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
  renderToolUseMessage(input: Input) {
    return resolveTaskId(input)
  },
  renderResultForAssistant(output: Output) {
    return JSON.stringify(output)
  },
  async validateInput(input: Input) {
    const taskId = resolveTaskId(input)
    if (!taskId) {
      return {
        result: false,
        message: 'Missing required parameter: task_id',
        errorCode: 1,
      }
    }

    const bg = BunShell.getInstance().getBackgroundOutput(taskId)
    if (bg) {
      const status = bashStatusFromRuntime(bg)
      if (status !== 'running') {
        return {
          result: false,
          message: `Task ${taskId} is not running (status: ${status})`,
          errorCode: 3,
        }
      }
      return { result: true }
    }

    const agent = getBackgroundAgentTaskSnapshot(taskId)
    if (agent) {
      if (agent.status !== 'running') {
        return {
          result: false,
          message: `Task ${taskId} is not running (status: ${agent.status})`,
          errorCode: 3,
        }
      }
      return { result: true }
    }

    return {
      result: false,
      message: `No task found with ID: ${taskId}`,
      errorCode: 1,
    }
  },
  async *call(input: Input) {
    const taskId = resolveTaskId(input)
    if (!taskId) throw new Error('Missing required parameter: task_id')

    const bg = BunShell.getInstance().getBackgroundOutput(taskId)
    if (bg) {
      const status = bashStatusFromRuntime(bg)
      if (status !== 'running') {
        throw new Error(
          `Task ${taskId} is not running, so cannot be stopped (status: ${status})`,
        )
      }

      const killed = BunShell.getInstance().killBackgroundShell(taskId)
      const output: Output = {
        message: killed
          ? `Successfully stopped task: ${taskId} (${bg.command})`
          : `No task found with ID: ${taskId}`,
        task_id: taskId,
        task_type: 'local_bash',
      }

      yield {
        type: 'result',
        data: output,
        resultForAssistant: this.renderResultForAssistant(output),
      }
      return
    }

    const agent = getBackgroundAgentTaskSnapshot(taskId)
    if (!agent) {
      throw new Error(`No task found with ID: ${taskId}`)
    }

    if (agent.status !== 'running') {
      throw new Error(
        `Task ${taskId} is not running, so cannot be stopped (status: ${agent.status})`,
      )
    }

    const killed = killBackgroundAgentTask(taskId)
    const output: Output = {
      message: killed
        ? `Successfully stopped task: ${taskId} (${agent.description})`
        : `No task found with ID: ${taskId}`,
      task_id: taskId,
      task_type: 'local_agent',
    }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
