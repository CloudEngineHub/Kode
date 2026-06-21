import { z } from 'zod'
import type { Tool, ToolUseContext } from '#core/tooling/Tool'
import { emitReminderEvent } from '#core/services/systemReminder'
import { createTask } from '#core/utils/taskStorage'
import { DESCRIPTION, PROMPT } from './prompt'

const inputSchema = z.strictObject({
  subject: z
    .string()
    .min(1, 'Subject cannot be empty')
    .describe('Task title (imperative form, e.g., "Run tests")'),
  description: z
    .string()
    .min(1, 'Description cannot be empty')
    .describe('Detailed task requirements and context'),
  activeForm: z
    .string()
    .optional()
    .describe(
      'Present continuous form shown while in_progress (e.g., "Running tests"). Always provide when creating tasks.',
    ),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Arbitrary metadata to attach to the task'),
})

type Input = z.infer<typeof inputSchema>
type Output = { task: { id: string; subject: string } }

export const TaskCreateTool = {
  name: 'TaskCreate',
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
    return false
  },
  isConcurrencySafe() {
    return true
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant(output: Output) {
    return `Task #${output.task.id} created: ${output.task.subject}`
  },
  renderToolUseMessage() {
    return null
  },
  renderToolResultMessage(output: Output) {
    return `✔ Task #${output.task.id} created: ${output.task.subject}`
  },
  async *call(input: Input, context?: ToolUseContext) {
    const subject = input.subject.trim()
    const description = input.description.trim()
    const activeForm =
      typeof input.activeForm === 'string' ? input.activeForm.trim() : ''

    const { id } = createTask({
      subject,
      description,
      ...(activeForm ? { activeForm } : {}),
      ...(input.metadata ? { metadata: input.metadata } : {}),
    })

    const output: Output = { task: { id, subject } }
    emitReminderEvent('task:changed', {
      agentId: context?.agentId,
      timestamp: Date.now(),
    })
    yield {
      type: 'result',
      data: output,
      resultForAssistant: this.renderResultForAssistant(output),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
