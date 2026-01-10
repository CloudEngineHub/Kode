import type { AgentEvent } from '#protocol/agentEvent'
import { kodeMessageToSdkMessage } from '#protocol/utils/kodeAgentStreamJson'

import type { Message } from './index'

export function messageToAgentEvent(
  message: Message,
  sessionId: string,
): AgentEvent | null {
  return kodeMessageToSdkMessage(
    message as Parameters<typeof kodeMessageToSdkMessage>[0],
    sessionId,
  )
}

export async function* messagesToAgentEvents(args: {
  source: AsyncIterable<Message>
  sessionId: string
}): AsyncGenerator<AgentEvent, void> {
  for await (const message of args.source) {
    const event = messageToAgentEvent(message, args.sessionId)
    if (event) yield event
  }
}
