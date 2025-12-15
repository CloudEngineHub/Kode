import { Box, Text } from 'ink'
import * as React from 'react'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { FallbackToolUseRejectedMessage } from '@components/FallbackToolUseRejectedMessage'
import { TodoItem as TodoItemComponent } from '@components/TodoItem'
import { Tool, ValidationResult } from '@tool'
import { setTodos, getTodos, TodoItem as StoredTodoItem } from '@utils/todoStorage'
import { emitReminderEvent } from '@services/systemReminder'
import { startWatchingTodoFile } from '@services/fileFreshness'
import { DESCRIPTION, PROMPT } from './prompt'
import { getTheme } from '@utils/theme'

const TodoItemSchema = z
  .object({
    content: z.string().min(1).describe('The task description or content'),
    status: z
      .enum(['pending', 'in_progress', 'completed'])
      .describe('Current status of the task'),
    activeForm: z
      .string()
      .min(1)
      .describe('The active form of the task (e.g., "Writing tests")'),
  })
  .strict()

const inputSchema = z.strictObject({
  todos: z.array(TodoItemSchema).describe('The updated todo list'),
})

type InputTodo = z.infer<typeof TodoItemSchema>
type Output =
  | {
      oldTodos: InputTodo[]
      newTodos: InputTodo[]
      agentId?: string
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
    return true
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
    return `Update todo list (${input.todos.length} items)`
  },
  renderToolUseRejectedMessage() {
    return <FallbackToolUseRejectedMessage />
  },
  renderToolResultMessage(output) {
    const isError = typeof output === 'string' && output.startsWith('Error')

    // For non-error output, get current todos from storage and render them
    if (!isError) {
      const agentId =
        output && typeof output === 'object' && 'agentId' in output
          ? (output as any).agentId
          : undefined
      const currentTodos = getTodos(agentId)
      
      if (currentTodos.length === 0) {
        return (
          <Box flexDirection="column" width="100%">
            <Box flexDirection="row">
              <Text color="#6B7280">&nbsp;&nbsp;⎿ &nbsp;</Text>
              <Text color="#9CA3AF">No todos currently</Text>
            </Box>
          </Box>
        )
      }

      // Render in storage order (already smart-sorted by status/priority/updatedAt)
      const displayedTodos = currentTodos

      // Find the next pending task
      const nextPendingIndex = displayedTodos.findIndex(
        todo => todo.status === 'pending',
      )

      return (
        <Box flexDirection="column" width="100%">
          {displayedTodos.map((todo: StoredTodoItem, index: number) => {
            // Determine checkbox symbol and colors
            let checkbox: string
            let textColor: string
            let isBold = false
            let isStrikethrough = false

            if (todo.status === 'completed') {
              checkbox = '☒'
              textColor = '#6B7280' // Professional gray for completed
              isStrikethrough = true
            } else if (todo.status === 'in_progress') {
              checkbox = '☐'
              textColor = '#10B981' // Professional green for in progress
              isBold = true
            } else if (todo.status === 'pending') {
              checkbox = '☐'
              // Only the FIRST pending task gets purple highlight
              if (index === nextPendingIndex) {
                textColor = '#8B5CF6' // Professional purple for next pending
                isBold = true
              } else {
                textColor = '#9CA3AF' // Muted gray for other pending
              }
            }

            return (
              <Box key={todo.id || index} flexDirection="row" marginBottom={0}>
                <Text color="#6B7280">&nbsp;&nbsp;⎿ &nbsp;</Text>
                <Box flexDirection="row" flexGrow={1}>
                  <Text color={textColor} bold={isBold} strikethrough={isStrikethrough}>
                    {checkbox}
                  </Text>
                  <Text> </Text>
                  <Text color={textColor} bold={isBold} strikethrough={isStrikethrough}>
                    {todo.content}
                  </Text>
                </Box>
              </Box>
            )
          })}
        </Box>
      )
    }

    // Fallback to simple text rendering for errors or string output
    return (
      <Box justifyContent="space-between" overflowX="hidden" width="100%">
        <Box flexDirection="row">
          <Text color={isError ? getTheme().error : getTheme().success}>
            &nbsp;&nbsp;⎿ &nbsp;
            {typeof output === 'string' ? output : JSON.stringify(output)}
          </Text>
        </Box>
      </Box>
    )
  },
  async validateInput({ todos }: z.infer<typeof inputSchema>) {
    const validation = validateTodos(todos)
    if (!validation.result) {
      return validation
    }
    return { result: true }
  },
  async *call({ todos }: z.infer<typeof inputSchema>, context) {
    try {
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

      // Note: Validation already done in validateInput, no need for duplicate validation
      // This eliminates the double validation issue

      // Update the todos in storage (agent-scoped)
      setTodos(todoItems, agentId)

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
          agentId: agentId || undefined,
        },
        resultForAssistant: this.renderResultForAssistant(),
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'
      const errorResult = `Error updating todos: ${errorMessage}`

      // Emit error event for system monitoring
      emitReminderEvent('todo:error', {
        error: errorMessage,
        timestamp: Date.now(),
        agentId: context?.agentId || 'default',
        context: 'TodoWriteTool.call',
      })

      yield {
        type: 'result',
        data: errorResult,
        resultForAssistant: errorResult,
      }
    }
  },
} satisfies Tool<typeof inputSchema, Output>
