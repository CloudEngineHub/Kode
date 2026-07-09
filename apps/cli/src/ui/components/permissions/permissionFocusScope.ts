import type { ToolUseConfirm } from './PermissionRequest'

function safeInputKey(input: ToolUseConfirm['input']): string {
  try {
    return JSON.stringify(input)
  } catch {
    return 'input'
  }
}

export function permissionSelectFocusScope(
  toolUseConfirm: ToolUseConfirm,
  area: string,
): string {
  const contextId =
    toolUseConfirm.toolUseContext.toolUseId ??
    toolUseConfirm.toolUseContext.messageId ??
    toolUseConfirm.assistantMessage.message.id ??
    safeInputKey(toolUseConfirm.input)
  const toolName = toolUseConfirm.tool?.name ?? 'tool'

  return `permission:${toolName}:${contextId}:${area}`
}
