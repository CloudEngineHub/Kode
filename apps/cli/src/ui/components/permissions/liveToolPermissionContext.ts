import type { ToolUseContext } from '#core/tooling/Tool'
import type { ToolPermissionContextUpdate } from '#core/types/toolPermissionContext'
import {
  applyToolPermissionContextUpdate,
  createDefaultToolPermissionContext,
  type ToolPermissionContext,
} from '#core/types/toolPermissionContext'

export function applyToolPermissionUpdatesToLiveToolUseContext(args: {
  toolUseContext: ToolUseContext
  updates: ToolPermissionContextUpdate[]
}): ToolPermissionContext | null {
  if (args.updates.length === 0) return null

  const toolUseContext = args.toolUseContext
  toolUseContext.options ??= {}

  const safeMode = toolUseContext.options.safeMode === true
  let next =
    toolUseContext.options.toolPermissionContext ??
    createDefaultToolPermissionContext({
      isBypassPermissionsModeAvailable: !safeMode,
    })

  for (const update of args.updates) {
    next = applyToolPermissionContextUpdate(next, update)
  }

  toolUseContext.options.toolPermissionContext = next
  return next
}
