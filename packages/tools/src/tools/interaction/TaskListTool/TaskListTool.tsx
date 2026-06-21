import { z } from 'zod'
import type { Tool } from '#core/tooling/Tool'
import { listTaskSummaries } from '#core/utils/taskStorage'
import type { TaskSummary } from '#core/utils/taskStorage'
import { DESCRIPTION, PROMPT } from './prompt'

const inputSchema = z.strictObject({})

type Output = { tasks: TaskSummary[] }

export const TaskListTool = {
  name: 'TaskList',
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
    if (output.tasks.length === 0) return 'No tasks found'
    return output.tasks
      .map(t => {
        const owner = t.owner ? ` (${t.owner})` : ''
        const blocked =
          t.blockedBy.length > 0
            ? ` [blocked by ${t.blockedBy.map(id => `#${id}`).join(', ')}]`
            : ''
        return `#${t.id} [${t.status}] ${t.subject}${owner}${blocked}`
      })
      .join('\n')
  },
  async *call() {
    const tasks = listTaskSummaries()
    const output: Output = { tasks }
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
