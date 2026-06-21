import { getTodos } from '#core/utils/todoStorage'
import { listTaskSummaries } from '#core/utils/taskStorage'
import type { TaskSummary } from '#core/utils/taskStorage'
import { debug as debugLogger } from '#core/utils/debugLogger'
import { logError } from '#core/utils/log'

import { registerSystemReminderEvents } from './events'
import { collectMentionReminders, cacheMentionReminder } from './mentions'
import type { MentionReminderParams } from './mentions'
import type {
  ReminderConfig,
  ReminderMessage,
  SessionReminderState,
} from './types'
import { getTodoStateHash } from './types'

export class SystemReminderService {
  public sessionState: SessionReminderState = {
    sessionId: undefined,
    lastTaskUpdate: 0,
    lastTodoUpdate: 0,
    lastFileAccess: 0,
    sessionStartTime: Date.now(),
    remindersSent: new Set(),
    contextPresent: false,
    reminderCount: 0,
    config: {
      taskEmptyReminder: true,
      todoEmptyReminder: false,
      securityReminder: true,
      performanceReminder: true,
      maxRemindersPerSession: 10,
    },
  }

  private readonly eventDispatcher = new Map<
    string,
    Array<(context: unknown) => void>
  >()
  private readonly reminderCache = new Map<string, ReminderMessage>()
  private readonly injectedReminders: ReminderMessage[] = []

  constructor() {
    registerSystemReminderEvents({
      sessionState: this.sessionState,
      resetSession: () => this.resetSession(),
      clearTaskReminders: agentId => this.clearTaskReminders(agentId),
      clearTodoReminders: agentId => this.clearTodoReminders(agentId),
      enqueueInjectedReminder: params => this.enqueueInjectedReminder(params),
      generateFileChangeReminder: context =>
        this.generateFileChangeReminder(context),
      emitEvent: (event, context) => this.emitEvent(event, context),
      addEventListener: (event, cb) => this.addEventListener(event, cb),
      createMentionReminder: params => this.createMentionReminder(params),
    })
  }

  public generateReminders(
    hasContext: boolean = false,
    agentId?: string,
  ): ReminderMessage[] {
    this.sessionState.contextPresent = hasContext
    if (!hasContext) return []

    if (
      this.sessionState.reminderCount >=
      this.sessionState.config.maxRemindersPerSession
    ) {
      return []
    }

    const reminders: ReminderMessage[] = []

    const reminderGenerators: Array<
      () => ReminderMessage | ReminderMessage[] | null
    > = [
      () => this.drainInjectedReminders(),
      () => this.dispatchTaskEvent(agentId),
      () => this.dispatchTodoEvent(agentId),
      () => this.dispatchSecurityEvent(),
      () => this.dispatchPerformanceEvent(),
      () => collectMentionReminders({ reminderCache: this.reminderCache }),
    ]

    for (const generator of reminderGenerators) {
      if (reminders.length >= 5) break
      const result = generator()
      if (!result) continue
      const next = Array.isArray(result) ? result : [result]
      reminders.push(...next)
      this.sessionState.reminderCount += next.length
    }

    return reminders
  }

  private getTaskStateHash(tasks: TaskSummary[]): string {
    return tasks
      .map(
        t =>
          `${t.id}:${t.subject}:${t.status}:${t.owner ?? ''}:${t.blockedBy.join(',')}`,
      )
      .sort()
      .join('|')
  }

  private dispatchTaskEvent(agentId?: string): ReminderMessage | null {
    if (!this.sessionState.config.taskEmptyReminder) return null

    const tasks = listTaskSummaries()
    const currentTime = Date.now()
    const agentKey = agentId || 'default'

    if (
      tasks.length === 0 &&
      !this.sessionState.remindersSent.has(`task_empty_${agentKey}`)
    ) {
      this.sessionState.remindersSent.add(`task_empty_${agentKey}`)
      return this.createReminderMessage(
        'task',
        'task',
        'medium',
        'This is a reminder that your task list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a task list please use the TaskCreate tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.',
        currentTime,
      )
    }

    if (tasks.length > 0) {
      const reminderKey = `task_updated_${agentKey}_${tasks.length}_${this.getTaskStateHash(tasks)}`

      const cached = this.reminderCache.get(reminderKey)
      if (cached) return cached

      if (!this.sessionState.remindersSent.has(reminderKey)) {
        this.sessionState.remindersSent.add(reminderKey)
        this.clearTaskReminders(agentKey)

        const taskContent = JSON.stringify(
          tasks.map(t => ({
            id: t.id,
            content:
              t.subject.length > 100
                ? `${t.subject.substring(0, 100)}...`
                : t.subject,
            status: t.status,
            owner: t.owner,
            blockedBy: t.blockedBy,
          })),
        )

        const reminder = this.createReminderMessage(
          'task',
          'task',
          'medium',
          `Your task list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your task list:\n\n${taskContent}. Continue on with the tasks at hand if applicable.`,
          currentTime,
        )

        this.reminderCache.set(reminderKey, reminder)
        return reminder
      }
    }

    return null
  }

  private dispatchTodoEvent(agentId?: string): ReminderMessage | null {
    if (!this.sessionState.config.todoEmptyReminder) return null
    if (process.env.KODE_ENABLE_LEGACY_TODO !== '1') return null

    const todos = getTodos(agentId)
    const currentTime = Date.now()
    const agentKey = agentId || 'default'

    if (
      todos.length === 0 &&
      !this.sessionState.remindersSent.has(`todo_empty_${agentKey}`)
    ) {
      this.sessionState.remindersSent.add(`todo_empty_${agentKey}`)
      return this.createReminderMessage(
        'todo',
        'task',
        'medium',
        'This is a reminder that your legacy todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a legacy todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.',
        currentTime,
      )
    }

    if (todos.length > 0) {
      const reminderKey = `todo_updated_${agentKey}_${todos.length}_${getTodoStateHash(todos)}`

      const cached = this.reminderCache.get(reminderKey)
      if (cached) return cached

      if (!this.sessionState.remindersSent.has(reminderKey)) {
        this.sessionState.remindersSent.add(reminderKey)
        this.clearTodoReminders(agentKey)

        const todoContent = JSON.stringify(
          todos.map(todo => ({
            content:
              todo.content.length > 100
                ? `${todo.content.substring(0, 100)}...`
                : todo.content,
            status: todo.status,
            activeForm:
              todo.activeForm && todo.activeForm.length > 100
                ? `${todo.activeForm.substring(0, 100)}...`
                : todo.activeForm || todo.content,
          })),
        )

        const reminder = this.createReminderMessage(
          'todo',
          'task',
          'medium',
          `Your legacy todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your legacy todo list:\n\n${todoContent}. Continue on with the tasks at hand if applicable.`,
          currentTime,
        )

        this.reminderCache.set(reminderKey, reminder)
        return reminder
      }
    }

    return null
  }

  private drainInjectedReminders(): ReminderMessage[] | null {
    if (this.injectedReminders.length === 0) return null
    return this.injectedReminders.splice(0, 3)
  }

  public enqueueInjectedReminder(params: {
    key?: string
    type: string
    category: ReminderMessage['category']
    priority: ReminderMessage['priority']
    content: string
    timestamp: number
  }): void {
    const key =
      params.key?.trim() || `injected_${params.type}_${params.timestamp}`
    if (this.sessionState.remindersSent.has(key)) return
    this.sessionState.remindersSent.add(key)
    const trimmed = params.content.trim()
    const alreadyWrapped =
      trimmed.startsWith('<system-reminder>') &&
      trimmed.endsWith('</system-reminder>')

    this.injectedReminders.push({
      role: 'system',
      content: alreadyWrapped
        ? trimmed
        : `<system-reminder>\n${trimmed}\n</system-reminder>`,
      isMeta: true,
      timestamp: params.timestamp,
      type: params.type,
      priority: params.priority,
      category: params.category,
    })
  }

  private dispatchSecurityEvent(): ReminderMessage | null {
    if (!this.sessionState.config.securityReminder) return null

    const currentTime = Date.now()
    if (
      this.sessionState.lastFileAccess > 0 &&
      !this.sessionState.remindersSent.has('file_security')
    ) {
      this.sessionState.remindersSent.add('file_security')
      return this.createReminderMessage(
        'security',
        'security',
        'high',
        'Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.',
        currentTime,
      )
    }

    return null
  }

  private dispatchPerformanceEvent(): ReminderMessage | null {
    if (!this.sessionState.config.performanceReminder) return null

    const currentTime = Date.now()
    const sessionDuration = currentTime - this.sessionState.sessionStartTime

    if (
      sessionDuration > 30 * 60 * 1000 &&
      !this.sessionState.remindersSent.has('performance_long_session')
    ) {
      this.sessionState.remindersSent.add('performance_long_session')
      return this.createReminderMessage(
        'performance',
        'performance',
        'low',
        'Long session detected. Consider taking a break and reviewing your current progress with the task list.',
        currentTime,
      )
    }

    return null
  }

  public generateFileChangeReminder(context: unknown): ReminderMessage | null {
    const ctx = context as {
      agentId?: string
      filePath?: string
      reminder?: string
    } | null
    const agentId = ctx?.agentId
    const filePath = ctx?.filePath
    const reminder = ctx?.reminder

    if (!reminder) return null

    const currentTime = Date.now()
    const reminderKey = `file_changed_${agentId}_${filePath}_${currentTime}`

    if (this.sessionState.remindersSent.has(reminderKey)) return null
    this.sessionState.remindersSent.add(reminderKey)

    return this.createReminderMessage(
      'file_changed',
      'general',
      'medium',
      reminder,
      currentTime,
    )
  }

  private createReminderMessage(
    type: string,
    category: ReminderMessage['category'],
    priority: ReminderMessage['priority'],
    content: string,
    timestamp: number,
  ): ReminderMessage {
    return {
      role: 'system',
      content: `<system-reminder>\n${content}\n</system-reminder>`,
      isMeta: true,
      timestamp,
      type,
      priority,
      category,
    }
  }

  public clearTodoReminders(agentId?: string): void {
    const agentKey = agentId || 'default'
    for (const key of this.sessionState.remindersSent) {
      if (key.startsWith(`todo_updated_${agentKey}_`)) {
        this.sessionState.remindersSent.delete(key)
      }
    }
  }

  public clearTaskReminders(agentId?: string): void {
    const agentKey = agentId || 'default'
    for (const key of this.sessionState.remindersSent) {
      if (key.startsWith(`task_updated_${agentKey}_`)) {
        this.sessionState.remindersSent.delete(key)
      }
    }
  }

  public addEventListener(
    event: string,
    callback: (context: unknown) => void,
  ): void {
    if (!this.eventDispatcher.has(event)) {
      this.eventDispatcher.set(event, [])
    }
    this.eventDispatcher.get(event)!.push(callback)
  }

  public emitEvent(event: string, context: unknown): void {
    const listeners = this.eventDispatcher.get(event) || []
    for (const callback of listeners) {
      try {
        callback(context)
      } catch (error) {
        logError(error)
        debugLogger.warn('SYSTEM_REMINDER_LISTENER_ERROR', {
          event,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  public createMentionReminder(params: MentionReminderParams): void {
    cacheMentionReminder({
      sessionState: this.sessionState,
      reminderCache: this.reminderCache,
      params,
      createReminderMessage: (type, category, priority, content, timestamp) =>
        this.createReminderMessage(
          type,
          category,
          priority,
          content,
          timestamp,
        ),
    })
  }

  public resetSession(): void {
    const preservedConfig = { ...this.sessionState.config }
    const preservedSessionId = this.sessionState.sessionId
    this.sessionState.lastTaskUpdate = 0
    this.sessionState.lastTodoUpdate = 0
    this.sessionState.lastFileAccess = 0
    this.sessionState.sessionStartTime = Date.now()
    this.sessionState.remindersSent = new Set()
    this.sessionState.contextPresent = false
    this.sessionState.reminderCount = 0
    this.sessionState.config = preservedConfig
    this.sessionState.sessionId = preservedSessionId
    this.reminderCache.clear()
    this.injectedReminders.length = 0
  }

  public updateConfig(config: Partial<ReminderConfig>): void {
    this.sessionState.config = { ...this.sessionState.config, ...config }
  }

  public getSessionState(): SessionReminderState {
    return { ...this.sessionState }
  }
}
