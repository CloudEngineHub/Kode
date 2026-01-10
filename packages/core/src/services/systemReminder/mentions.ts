import type { ReminderMessage, SessionReminderState } from './types'

export type MentionReminderParams = {
  type: string
  key: string
  category: ReminderMessage['category']
  priority: ReminderMessage['priority']
  content: string
  timestamp: number
}

const MENTION_TYPES = new Set([
  'agent_mention',
  'file_mention',
  'ask_model_mention',
])

function isMentionReminder(reminder: ReminderMessage): boolean {
  return MENTION_TYPES.has(reminder.type)
}

export function collectMentionReminders(args: {
  reminderCache: Map<string, ReminderMessage>
  now?: number
}): ReminderMessage[] {
  const currentTime = args.now ?? Date.now()
  const MENTION_FRESHNESS_WINDOW = 5000
  const reminders: ReminderMessage[] = []
  const expiredKeys: string[] = []

  for (const [key, reminder] of args.reminderCache.entries()) {
    if (!isMentionReminder(reminder)) continue
    const age = currentTime - reminder.timestamp
    if (age <= MENTION_FRESHNESS_WINDOW) {
      reminders.push(reminder)
    } else {
      expiredKeys.push(key)
    }
  }

  for (const key of expiredKeys) {
    args.reminderCache.delete(key)
  }

  return reminders
}

export function cacheMentionReminder(args: {
  sessionState: SessionReminderState
  reminderCache: Map<string, ReminderMessage>
  params: MentionReminderParams
  createReminderMessage: (
    type: string,
    category: ReminderMessage['category'],
    priority: ReminderMessage['priority'],
    content: string,
    timestamp: number,
  ) => ReminderMessage
}): void {
  if (args.sessionState.remindersSent.has(args.params.key)) return
  args.sessionState.remindersSent.add(args.params.key)

  const reminder = args.createReminderMessage(
    args.params.type,
    args.params.category,
    args.params.priority,
    args.params.content,
    args.params.timestamp,
  )
  args.reminderCache.set(args.params.key, reminder)
}
