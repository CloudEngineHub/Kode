import { existsSync } from 'fs'
import type { ToolUseContext } from '#core/tooling/Tool'

import {
  getPlanFilePath,
  isMainPlanFilePathForActiveConversation,
  isPathInPlanDirectory,
  isPlanFilePathForActiveConversation,
} from './paths'
import {
  getAgentKey,
  getConversationKey,
  getPlanModeAttachmentState,
  getPlanModeFlags,
  isPlanModeEnabled,
  setPlanModeAttachmentState,
} from './state'
import {
  buildPlanModeExitReminder,
  buildPlanModeMainReminder,
  buildPlanModeReentryReminder,
  buildPlanModeSubAgentReminder,
  wrapSystemReminder,
} from './reminders'

const TURNS_BETWEEN_ATTACHMENTS = 5

export {
  isPlanFilePathForActiveConversation,
  isMainPlanFilePathForActiveConversation,
  isPathInPlanDirectory,
}

export function getPlanModeSystemPromptAdditions(
  messages: Array<{ type?: string }>,
  context: ToolUseContext,
): string[] {
  const conversationKey = getConversationKey(context)
  const agentKey = getAgentKey(context)
  const flags = getPlanModeFlags(conversationKey)
  const additions: string[] = []

  const assistantTurns = messages.filter(m => m?.type === 'assistant').length

  if (isPlanModeEnabled(context)) {
    const previous = getPlanModeAttachmentState(agentKey) ?? {
      hasInjected: false,
      lastInjectedAssistantTurn: -Infinity,
    }

    if (
      previous.hasInjected &&
      assistantTurns - previous.lastInjectedAssistantTurn <
        TURNS_BETWEEN_ATTACHMENTS
    ) {
      return []
    }

    const planFilePath = getPlanFilePath(context.agentId, conversationKey)
    const planExists = existsSync(planFilePath)

    if (flags.hasExitedPlanMode && planExists) {
      additions.push(
        wrapSystemReminder(buildPlanModeReentryReminder(planFilePath)),
      )
      flags.hasExitedPlanMode = false
    }

    const isSubAgent = !!context.agentId
    additions.push(
      wrapSystemReminder(
        isSubAgent
          ? buildPlanModeSubAgentReminder({ planExists, planFilePath })
          : buildPlanModeMainReminder({ planExists, planFilePath }),
      ),
    )

    setPlanModeAttachmentState(agentKey, {
      hasInjected: true,
      lastInjectedAssistantTurn: assistantTurns,
    })

    return additions
  }

  if (flags.needsPlanModeExitAttachment) {
    const planFilePath = getPlanFilePath(context.agentId, conversationKey)
    additions.push(wrapSystemReminder(buildPlanModeExitReminder(planFilePath)))
    flags.needsPlanModeExitAttachment = false
  }

  return additions
}
