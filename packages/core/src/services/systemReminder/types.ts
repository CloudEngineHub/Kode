import type { TodoItem } from '#core/utils/todoStorage'

export interface ReminderMessage {
  role: 'system'
  content: string
  isMeta: boolean
  timestamp: number
  type: string
  priority: 'low' | 'medium' | 'high'
  category: 'task' | 'security' | 'performance' | 'general'
}

export interface ReminderConfig {
  taskEmptyReminder: boolean
  todoEmptyReminder: boolean
  securityReminder: boolean
  performanceReminder: boolean
  maxRemindersPerSession: number
}

export interface SessionReminderState {
  sessionId?: string
  lastTaskUpdate: number
  lastTodoUpdate: number
  lastFileAccess: number
  sessionStartTime: number
  remindersSent: Set<string>
  contextPresent: boolean
  reminderCount: number
  config: ReminderConfig
}

export type TodoStateHash = string

export function getTodoStateHash(todos: TodoItem[]): TodoStateHash {
  return todos
    .map(t => `${t.content}:${t.status}:${t.activeForm || t.content}`)
    .sort()
    .join('|')
}
