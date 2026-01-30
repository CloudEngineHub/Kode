import { z } from 'zod'
import type { Tool, ToolUseContext, ValidationResult } from '#core/tooling/Tool'
import { BunShell } from '#runtime/shell'
import {
  getBackgroundAgentTaskSnapshot,
  waitForBackgroundAgentTask,
} from '#core/utils/backgroundTasks'
import { createAssistantMessage } from '#core/utils/messages'
import { DESCRIPTION, PROMPT, TOOL_NAME_FOR_PROMPT } from './prompt'
import { getTaskOutputFilePath, readTaskOutput } from '#runtime/taskOutputStore'

const inputSchema = z.strictObject({
  task_id: z.string().describe('The task ID to get output from'),
  block: z
    .boolean()
    .optional()
    .default(true)
    .describe('Whether to wait for completion'),
  timeout: z
    .number()
    .min(0)
    .max(600000)
    .optional()
    .default(30000)
    .describe('Max wait time in ms'),
})

type Input = z.infer<typeof inputSchema>

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

const DEFAULT_TASK_MAX_OUTPUT_LENGTH = 100_000
const MIN_TASK_MAX_OUTPUT_LENGTH = 1_000
const MAX_TASK_MAX_OUTPUT_LENGTH = 200_000

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)))
}

function getTaskMaxOutputLength(): number {
  const raw =
    process.env.KODE_TASK_MAX_OUTPUT_LENGTH ??
    process.env.TASK_MAX_OUTPUT_LENGTH
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed <= 0)
    return DEFAULT_TASK_MAX_OUTPUT_LENGTH
  return clampInt(
    parsed,
    MIN_TASK_MAX_OUTPUT_LENGTH,
    MAX_TASK_MAX_OUTPUT_LENGTH,
  )
}

function truncateTaskOutput(args: { taskId: string; output: string }): {
  output: string
  wasTruncated: boolean
} {
  const limit = getTaskMaxOutputLength()
  if (args.output.length <= limit)
    return { output: args.output, wasTruncated: false }

  const prefix = `[Truncated. Full output: ${getTaskOutputFilePath(args.taskId)}]\n`
  const remaining = limit - prefix.length
  if (remaining <= 0)
    return { output: prefix.slice(0, limit), wasTruncated: true }
  return {
    output: prefix + args.output.slice(-remaining),
    wasTruncated: true,
  }
}

function normalizeTaskOutputInput(input: Input): Input {
  return input
}

function taskStatusFromBash(
  bg: ReturnType<BunShell['getBackgroundOutput']>,
): TaskStatus {
  if (!bg) return 'failed'
  if (bg.killed) return 'killed'
  if (bg.code === null) return 'running'
  return bg.code === 0 ? 'completed' : 'failed'
}

function buildTaskSummary(taskId: string): TaskSummary | null {
  const bg = BunShell.getInstance().getBackgroundOutput(taskId)
  if (bg) {
    const rawOutput = readTaskOutput(taskId)
    const { output } = truncateTaskOutput({ taskId, output: rawOutput })
    return {
      task_id: taskId,
      task_type: 'local_bash',
      status: taskStatusFromBash(bg),
      description: bg.command,
      output,
      exitCode: bg.code,
    }
  }

  const agent = getBackgroundAgentTaskSnapshot(taskId)
  if (agent) {
    const rawOutput = readTaskOutput(taskId) || agent.resultText || ''
    const { output } = truncateTaskOutput({ taskId, output: rawOutput })
    return {
      task_id: taskId,
      task_type: 'local_agent',
      status: agent.status,
      description: agent.description,
      output,
      prompt: agent.prompt,
      result: output,
      error: agent.error,
    }
  }

  return null
}

async function waitForBashTaskCompletion(args: {
  taskId: string
  timeoutMs: number
  signal: AbortSignal
}): Promise<TaskSummary | null> {
  const { taskId, timeoutMs, signal } = args
  const startedAt = Date.now()

  while (Date.now() - startedAt < timeoutMs) {
    if (signal.aborted) return null
    const summary = buildTaskSummary(taskId)
    if (!summary) return null
    if (summary.status !== 'running' && summary.status !== 'pending')
      return summary
    await new Promise(resolve => setTimeout(resolve, 100))
  }

  return buildTaskSummary(taskId)
}

export const TaskOutputTool = {
  name: TOOL_NAME_FOR_PROMPT,
  async description() {
    return DESCRIPTION
  },
  userFacingName() {
    return 'Task Output'
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
  renderToolUseMessage(input: Input) {
    if (input.block === false) return 'non-blocking'
    return ''
  },
  renderToolUseRejectedMessage() {
    return null
  },
  renderResultForAssistant(output: Output) {
    const parts: string[] = []
    parts.push(
      `<retrieval_status>${output.retrieval_status}</retrieval_status>`,
    )

    if (output.task) {
      parts.push(`<task_id>${output.task.task_id}</task_id>`)
      parts.push(`<task_type>${output.task.task_type}</task_type>`)
      parts.push(`<status>${output.task.status}</status>`)
      if (output.task.exitCode !== undefined && output.task.exitCode !== null) {
        parts.push(`<exit_code>${output.task.exitCode}</exit_code>`)
      }
      if (output.task.output?.trim()) {
        parts.push(`<output>\n${output.task.output.trimEnd()}\n</output>`)
      }
      if (output.task.error) {
        parts.push(`<error>${output.task.error}</error>`)
      }
    }

    return parts.join('\n\n')
  },
  async validateInput(input: Input): Promise<ValidationResult> {
    if (!input.task_id) {
      return { result: false, message: 'Task ID is required', errorCode: 1 }
    }

    const task = buildTaskSummary(input.task_id)
    if (!task) {
      return {
        result: false,
        message: `No task found with ID: ${input.task_id}`,
        errorCode: 2,
      }
    }

    return { result: true }
  },
  async *call(input: Input, context: ToolUseContext) {
    const normalized = normalizeTaskOutputInput(input)
    const taskId = normalized.task_id
    const block = normalized.block
    const timeoutMs = normalized.timeout

    const initial = buildTaskSummary(taskId)
    if (!initial) {
      throw new Error(`No task found with ID: ${taskId}`)
    }

    if (!block) {
      const isDone =
        initial.status !== 'running' && initial.status !== 'pending'
      const out: Output = {
        retrieval_status: isDone ? 'success' : 'not_ready',
        task: initial,
      }
      yield {
        type: 'result',
        data: out,
        resultForAssistant: this.renderResultForAssistant(out),
      }
      return
    }

    yield {
      type: 'progress',
      content: createAssistantMessage(
        `<tool-progress>${initial.description ? `  ${initial.description}\n` : ''}     Waiting for task (esc to give additional instructions)</tool-progress>`,
      ),
    }

    let finalTask: TaskSummary | null = null

    if (initial.task_type === 'local_agent') {
      try {
        const task = await waitForBackgroundAgentTask(
          taskId,
          timeoutMs,
          context.abortController.signal,
        )
        finalTask = task ? buildTaskSummary(taskId) : null
      } catch {
        finalTask = buildTaskSummary(taskId)
      }
    } else {
      finalTask = await waitForBashTaskCompletion({
        taskId,
        timeoutMs,
        signal: context.abortController.signal,
      })
    }

    if (!finalTask) {
      const out: Output = { retrieval_status: 'timeout', task: null }
      yield {
        type: 'result',
        data: out,
        resultForAssistant: this.renderResultForAssistant(out),
      }
      return
    }

    if (finalTask.status === 'running' || finalTask.status === 'pending') {
      const out: Output = { retrieval_status: 'timeout', task: finalTask }
      yield {
        type: 'result',
        data: out,
        resultForAssistant: this.renderResultForAssistant(out),
      }
      return
    }

    const out: Output = { retrieval_status: 'success', task: finalTask }
    yield {
      type: 'result',
      data: out,
      resultForAssistant: this.renderResultForAssistant(out),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
