import { randomUUID } from 'crypto'
import { z } from 'zod'
import { Tool, ValidationResult } from '#core/tooling/Tool'
import {
  setTodos,
  getTodos,
  TodoItem as StoredTodoItem,
} from '#core/utils/todoStorage'
import {
  getTodoRenderModel,
  TodoRenderModel,
} from '#core/utils/todoRenderModel'
import { emitReminderEvent } from '#core/services/systemReminder'
import { startWatchingTodoFile } from '#core/services/fileFreshness'
import { DESCRIPTION, PROMPT } from './prompt'

export function __getTodoRenderModelForTests(
  todos: StoredTodoItem[],
): TodoRenderModel {
  return getTodoRenderModel(todos)
}

const TodoItemSchema = z.object({
  content: z
    .string()
    .min(1, 'Content cannot be empty')
    .describe('The task description or content'),
  status: z
    .enum(['pending', 'in_progress', 'completed'])
    .describe('Current status of the task'),
  activeForm: z
    .string()
    .min(1, 'Active form cannot be empty')
    .describe('The active form of the task (e.g., "Writing tests")'),
})

const inputSchema = z.strictObject({
  todos: z.array(TodoItemSchema).describe('The updated todo list'),
})

type InputTodo = z.infer<typeof TodoItemSchema>
type Output =
  | {
      oldTodos: InputTodo[]
      newTodos: InputTodo[]
    }
  | string

function validateTodos(todos: InputTodo[]): ValidationResult {
  // Check for multiple in_progress tasks
  const inProgressTasks = todos.filter(todo => todo.status === 'in_progress')
  if (inProgressTasks.length > 1) {
    return {
      result: false,
      errorCode: 2,
      message: 'Only one task can be in_progress at a time',
      meta: { inProgressTasks: inProgressTasks.map(t => t.content) },
    }
  }

  // Validate each todo
  for (const todo of todos) {
    if (!todo.content?.trim()) {
      return {
        result: false,
        errorCode: 3,
        message: 'Todo has empty content',
      }
    }
    if (!['pending', 'in_progress', 'completed'].includes(todo.status)) {
      return {
        result: false,
        errorCode: 4,
        message: `Invalid status "${todo.status}" for todo "${todo.content}"`,
        meta: { invalidStatus: todo.status },
      }
    }
    if (!todo.activeForm?.trim()) {
      return {
        result: false,
        errorCode: 5,
        message: 'Todo has empty activeForm',
        meta: { todoContent: todo.content },
      }
    }
  }

  return { result: true }
}

function generateTodoSummary(todos: StoredTodoItem[]): string {
  const stats = {
    total: todos.length,
    pending: todos.filter(t => t.status === 'pending').length,
    inProgress: todos.filter(t => t.status === 'in_progress').length,
    completed: todos.filter(t => t.status === 'completed').length,
  }

  // Enhanced summary with statistics
  let summary = `Updated ${stats.total} todo(s)`
  if (stats.total > 0) {
    summary += ` (${stats.pending} pending, ${stats.inProgress} in progress, ${stats.completed} completed)`
  }
  summary += '. Continue tracking your progress with the todo list.'

  return summary
}

export const TodoWriteTool = {
  name: 'TodoWrite',
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
    const raw = process.env.KODE_ENABLE_LEGACY_TODO ?? ''
    const normalized = raw.trim().toLowerCase()
    return ['1', 'true', 'yes', 'y', 'on', 'enable', 'enabled'].includes(
      normalized,
    )
  },
  isReadOnly() {
    return false
  },
  isConcurrencySafe() {
    return false // TodoWrite modifies state, not safe for concurrent execution
  },
  needsPermissions() {
    return false
  },
  renderResultForAssistant() {
    return 'Todos have been modified successfully. Ensure that you continue to use the todo list to track your progress. Please proceed with the current tasks if applicable'
  },
  renderToolUseMessage(input, { verbose }) {
    return null
  },
  renderToolResultMessage(_output: Output, _options: { verbose: boolean }) {
    return null
  },
  async validateInput({ todos }: z.infer<typeof inputSchema>) {
    const validation = validateTodos(todos)
    if (!validation.result) {
      return validation
    }
    return { result: true }
  },
  async *call({ todos }: z.infer<typeof inputSchema>, context) {
    // Get agent ID from context
    const agentId = context?.agentId

    // Start watching todo file for this agent if not already watching
    if (agentId) {
      startWatchingTodoFile(agentId)
    }

    // Store previous todos for comparison (agent-scoped)
    const previousTodos = getTodos(agentId)
    const oldTodos: InputTodo[] = previousTodos.map(todo => ({
      content: todo.content,
      status: todo.status,
      activeForm: todo.activeForm || todo.content,
    }))

    // Default behavior: if all todos are completed, clear the list
    const shouldClear =
      todos.length > 0 && todos.every(todo => todo.status === 'completed')

    const reusable = new Map<string, StoredTodoItem[]>()
    for (const todo of previousTodos) {
      const key = `${todo.content}|||${todo.activeForm || todo.content}`
      const list = reusable.get(key) ?? []
      list.push(todo)
      reusable.set(key, list)
    }

    const todoItems: StoredTodoItem[] = shouldClear
      ? []
      : todos.map(todo => {
          const key = `${todo.content}|||${todo.activeForm}`
          const list = reusable.get(key)
          const reused = list && list.length > 0 ? list.shift() : undefined

          return {
            id: reused?.id ?? randomUUID(),
            content: todo.content,
            status: todo.status,
            activeForm: todo.activeForm,
            priority: reused?.priority ?? 'medium',
            ...(reused?.createdAt ? { createdAt: reused.createdAt } : {}),
          }
        })

    try {
      // Update the todos in storage (agent-scoped)
      setTodos(todoItems, agentId)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'

      emitReminderEvent('todo:error', {
        error: errorMessage,
        timestamp: Date.now(),
        agentId: context?.agentId || 'default',
        context: 'TodoWriteTool.call',
      })

      throw error instanceof Error ? error : new Error(errorMessage)
    }

    // Emit todo change event for system reminders (optimized - only if todos actually changed)
    const hasChanged =
      JSON.stringify(previousTodos) !== JSON.stringify(todoItems)
    if (hasChanged) {
      emitReminderEvent('todo:changed', {
        previousTodos,
        newTodos: todoItems,
        timestamp: Date.now(),
        agentId: agentId || 'default',
        changeType:
          todoItems.length > previousTodos.length
            ? 'added'
            : todoItems.length < previousTodos.length
              ? 'removed'
              : 'modified',
      })
    }

    yield {
      type: 'result',
      data: {
        oldTodos,
        newTodos: todos,
      },
      resultForAssistant: this.renderResultForAssistant(),
    }
  },
} satisfies Tool<typeof inputSchema, Output>
