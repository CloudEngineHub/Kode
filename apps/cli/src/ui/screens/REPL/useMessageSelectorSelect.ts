import type React from 'react'
import { useCallback } from 'react'
import { clearTerminal } from '#cli-utils/terminal'
import type { Message as MessageType } from '#core/query'

export function useMessageSelectorSelect(args: {
  messages: MessageType[]
  setIsMessageSelectorVisible: React.Dispatch<React.SetStateAction<boolean>>
  setMessages: React.Dispatch<React.SetStateAction<MessageType[]>>
  setForkConvoWithMessagesOnTheNextRender: React.Dispatch<
    React.SetStateAction<MessageType[] | null>
  >
  setInputValue: React.Dispatch<React.SetStateAction<string>>
  onCancel: () => void
}) {
  return useCallback(
    async (message: MessageType) => {
      args.setIsMessageSelectorVisible(false)
      if (!args.messages.includes(message)) return
      args.onCancel()

      setImmediate(async () => {
        await clearTerminal()
        args.setMessages([])
        args.setForkConvoWithMessagesOnTheNextRender(
          args.messages.slice(0, args.messages.indexOf(message)),
        )
        if (
          message.type === 'user' &&
          typeof message.message.content === 'string'
        ) {
          args.setInputValue(message.message.content)
        }
      })
    },
    [args],
  )
}
