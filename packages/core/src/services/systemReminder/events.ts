import type { ReminderMessage, SessionReminderState } from './types'
import type { MentionReminderParams } from './mentions'

export type SystemReminderEventBindings = {
  sessionState: SessionReminderState
  resetSession: () => void
  clearTaskReminders: (agentId?: string) => void
  clearTodoReminders: (agentId?: string) => void
  enqueueInjectedReminder: (params: {
    key?: string
    type: string
    category: ReminderMessage['category']
    priority: ReminderMessage['priority']
    content: string
    timestamp: number
  }) => void
  generateFileChangeReminder: (context: unknown) => ReminderMessage | null
  emitEvent: (event: string, context: unknown) => void
  addEventListener: (
    event: string,
    callback: (context: unknown) => void,
  ) => void
  createMentionReminder: (params: MentionReminderParams) => void
}

export function registerSystemReminderEvents(
  service: SystemReminderEventBindings,
): void {
  service.addEventListener('session:startup', context => {
    const ctx = context as {
      sessionId?: string
      context?: Record<string, unknown>
    } | null

    const sessionId =
      typeof ctx?.sessionId === 'string' && ctx.sessionId.trim()
        ? ctx.sessionId.trim()
        : undefined

    // Only reset when the session identity actually changes. Session startup
    // events can be emitted multiple times (e.g., per turn or per agent).
    if (sessionId && service.sessionState.sessionId === sessionId) return

    service.resetSession()
    service.sessionState.sessionId = sessionId
    service.sessionState.sessionStartTime = Date.now()
    service.sessionState.contextPresent =
      Object.keys(ctx?.context ?? {}).length > 0
  })

  service.addEventListener('todo:changed', context => {
    const ctx = context as { agentId?: string } | null
    service.sessionState.lastTodoUpdate = Date.now()
    service.clearTodoReminders(ctx?.agentId)
  })

  service.addEventListener('task:changed', context => {
    const ctx = context as { agentId?: string } | null
    service.sessionState.lastTaskUpdate = Date.now()
    service.clearTaskReminders(ctx?.agentId)
  })

  service.addEventListener('todo:file_changed', context => {
    const ctx = context as { agentId?: string; filePath?: string } | null
    const agentId = ctx?.agentId || 'default'
    service.clearTodoReminders(agentId)
    service.sessionState.lastTodoUpdate = Date.now()

    const reminder = service.generateFileChangeReminder(context)
    if (reminder) {
      service.emitEvent('reminder:inject', {
        reminder: reminder.content,
        agentId,
        type: 'file_changed',
        timestamp: Date.now(),
      })
    }
  })

  service.addEventListener('reminder:inject', context => {
    const ctx = context as {
      key?: string
      type?: string
      category?: ReminderMessage['category']
      priority?: ReminderMessage['priority']
      reminder?: string
      content?: string
      timestamp?: number
    } | null
    const content =
      typeof ctx?.reminder === 'string'
        ? ctx.reminder
        : typeof ctx?.content === 'string'
          ? ctx.content
          : ''
    if (!content.trim()) return

    service.enqueueInjectedReminder({
      key: ctx?.key,
      type:
        typeof ctx?.type === 'string' && ctx.type.trim()
          ? ctx.type.trim()
          : 'general',
      category: ctx?.category ?? 'general',
      priority: ctx?.priority ?? 'medium',
      content: content.trim(),
      timestamp:
        typeof ctx?.timestamp === 'number' ? ctx.timestamp : Date.now(),
    })
  })

  service.addEventListener('file:read', () => {
    service.sessionState.lastFileAccess = Date.now()
  })

  service.addEventListener('file:edited', () => {
    // intentionally left blank (reserved for freshness detection)
  })

  service.addEventListener('agent:mentioned', context => {
    const ctx = context as {
      agentType: string
      originalMention: string
      timestamp: number
    }
    service.createMentionReminder({
      type: 'agent_mention',
      key: `agent_mention_${ctx.agentType}_${ctx.timestamp}`,
      category: 'task',
      priority: 'high',
      content: `The user mentioned @${ctx.originalMention}. You MUST use the Task tool with subagent_type="${ctx.agentType}" to delegate this task to the specified agent. Provide a detailed, self-contained task description that fully captures the user's intent for the ${ctx.agentType} agent to execute.`,
      timestamp: ctx.timestamp,
    })
  })

  service.addEventListener('file:mentioned', context => {
    const ctx = context as {
      filePath: string
      originalMention: string
      timestamp: number
    }
    service.createMentionReminder({
      type: 'file_mention',
      key: `file_mention_${ctx.filePath}_${ctx.timestamp}`,
      category: 'general',
      priority: 'high',
      content: `The user mentioned @${ctx.originalMention}. You MUST read the entire content of the file at path: ${ctx.filePath} using the Read tool to understand the full context before proceeding with the user's request.`,
      timestamp: ctx.timestamp,
    })
  })

  service.addEventListener('ask-model:mentioned', context => {
    const ctx = context as { modelName: string; timestamp: number }
    service.createMentionReminder({
      type: 'ask_model_mention',
      key: `ask_model_mention_${ctx.modelName}_${ctx.timestamp}`,
      category: 'task',
      priority: 'high',
      content: `The user mentioned @${ctx.modelName}. You MUST use the AskExpertModelTool to consult this specific model for expert opinions and analysis. Provide the user's question or context clearly to get the most relevant response from ${ctx.modelName}.`,
      timestamp: ctx.timestamp,
    })
  })
}
