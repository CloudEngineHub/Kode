import { useEffect } from 'react'
import { type Message } from '#core/query'
import { overwriteLog, getMessagesPath } from '#core/utils/log'

export function useLogMessages(
  messages: Message[],
  messageLogName: string,
  forkNumber: number,
): void {
  useEffect(() => {
    overwriteLog(
      getMessagesPath(messageLogName, forkNumber, 0),
      messages.filter(_ => _.type !== 'progress'),
      { conversationKey: `${messageLogName}:${forkNumber}` },
    )
  }, [messages, messageLogName, forkNumber])
}
