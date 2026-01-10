import type { PermissionMode } from '#core/types/PermissionMode'
import {
  enterPlanModeForConversationKey,
  exitPlanModeForConversationKey,
} from '#core/utils/planMode'
import { setPermissionModeForConversationKey } from '#core/utils/permissionModeState'
import { getGlobalConfig, saveGlobalConfig } from '#core/utils/config'

export function __applyPermissionModeSideEffectsForTests(args: {
  conversationKey: string
  previousMode: PermissionMode
  nextMode: PermissionMode
  recordPlanModeUse: boolean
  now?: () => number
}): void {
  const now = args.now ?? Date.now

  if (
    args.recordPlanModeUse &&
    args.previousMode !== args.nextMode &&
    args.nextMode === 'plan'
  ) {
    const config = getGlobalConfig()
    saveGlobalConfig({ ...config, lastPlanModeUse: now() })
  }

  setPermissionModeForConversationKey({
    conversationKey: args.conversationKey,
    mode: args.nextMode,
  })

  if (args.previousMode !== 'plan' && args.nextMode === 'plan') {
    enterPlanModeForConversationKey(args.conversationKey)
  } else if (args.previousMode === 'plan' && args.nextMode !== 'plan') {
    exitPlanModeForConversationKey(args.conversationKey)
  }
}
