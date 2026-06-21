import { SystemReminderService } from './service'

export type {
  ReminderMessage,
  ReminderConfig,
  SessionReminderState,
} from './types'

export const systemReminderService = new SystemReminderService()

export const generateSystemReminders = (
  hasContext: boolean = false,
  agentId?: string,
) => systemReminderService.generateReminders(hasContext, agentId)

export const generateFileChangeReminder = (context: unknown) =>
  systemReminderService.generateFileChangeReminder(context)

export const emitReminderEvent = (event: string, context: unknown) =>
  systemReminderService.emitEvent(event, context)

export const resetReminderSession = () => systemReminderService.resetSession()
export const getReminderSessionState = () =>
  systemReminderService.getSessionState()
