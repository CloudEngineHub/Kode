import { z } from 'zod'
import type { Tool } from '#core/tooling/Tool'
import { getTask } from '#core/utils/taskStorage'
import type { Task } from '#core/utils/taskStorage'
import { DESCRIPTION, PROMPT } from './prompt'

const inputSchema = z.strictObject({
  taskId: z.string().min(1).describe('The ID of the task to retrieve'),
})

type Input = z.infer<typeof inputSchema>
type Output = { task: Task | null }

export const TaskGetTool = {
  name: 'TaskGet',
  async description() {
    return DESCRIPTION
  },
  async prompt() {
    return PROMPT
  },
  inputSchema,
  userFacingName() {
    return ''
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
  renderToolUseMessage() {
    return null
  },
  renderToolResultMessage() {
    return null
  },
  renderResultForAssistant(output: Output) {
    if (!output.task) return 'Task not found'
    const task = output.task
    const lines = [
      `Task #${task.id}: ${task.subject}`,
      `Status: ${task.status}`,
      `Description: ${task.description}`,
    ]
    if (task.blockedBy.length > 0) {
      lines.push(`Blocked by: ${task.blockedBy.map(id => `#${id}`).join(', ')}`)
    }
    if (task.blocks.length > 0) {
      lines.push(`Blocks: ${task.blocks.map(id => `#${id}`).join(', ')}`)
    }
    return lines.join('\n')
  },
  async *call(input: Input) {
    const taskId = input.taskId.trim()
    const task = getTask(taskId)
    const output: Output = { task }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
