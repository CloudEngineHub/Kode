import * as React from 'react'
import { Tool } from '#core/tooling/Tool'
import { Message } from '#core/query'
import { FallbackToolUseRejectedMessage } from '#ui-ink/components/FallbackToolUseRejectedMessage'
import { useGetToolFromMessages } from './utils'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { usePermissionContext } from '#ui-ink/contexts/PermissionContext'
import { renderInkToolUseRejectedMessage } from '#ui-ink/toolPresenters/registry'

type Props = {
  toolUseID: string
  messages: Message[]
  tools: Tool[]
  verbose: boolean
}

export function UserToolRejectMessage({
  toolUseID,
  tools,
  messages,
  verbose,
}: Props): React.ReactNode {
  const { columns } = useTerminalSize()
  const { conversationKey } = usePermissionContext()
  const lookup = useGetToolFromMessages(toolUseID, tools, messages)
  if (!lookup) {
    return <FallbackToolUseRejectedMessage />
  }

  const input = lookup.tool.inputSchema.safeParse(lookup.toolUse.input)
  if (input.success) {
    return renderInkToolUseRejectedMessage(lookup.tool, input.data, {
      columns,
      verbose,
      conversationKey,
    })
  }
  return <FallbackToolUseRejectedMessage />
}
