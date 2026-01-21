import type React from 'react'
import { useCallback } from 'react'
import { clearTerminal } from '#cli-utils/terminal'
import type { Message as MessageType } from '#core/query'

function getMessageUuid(message: MessageType): string | undefined {
  const record = message as unknown as { uuid?: unknown }
  return typeof record.uuid === 'string' ? record.uuid : undefined
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  const parts: string[] = []
  for (const block of content) {
    if (!block || typeof block !== 'object') continue
    const record = block as Record<string, unknown>
    if (record.type !== 'text') continue
    parts.push(String(record.text ?? ''))
  }

  return parts.join('\n')
}

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

      const selectedUuid = getMessageUuid(message)
      const selectedIndex =
        selectedUuid === undefined
          ? args.messages.indexOf(message)
          : args.messages.findIndex(m => getMessageUuid(m) === selectedUuid)
      if (selectedIndex < 0) return

      args.onCancel()

      setImmediate(async () => {
        await clearTerminal()
        args.setMessages([])
        const forkMessages = args.messages
          .slice(0, selectedIndex)
          .filter(m => m.type !== 'progress')
        args.setForkConvoWithMessagesOnTheNextRender(forkMessages)
        if (message.type === 'user') {
          args.setInputValue(extractMessageText(message.message.content))
        }
      })
    },
    [args],
  )
}
