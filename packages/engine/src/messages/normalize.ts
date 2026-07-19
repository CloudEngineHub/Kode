import {
  isNotEmptyMessage as isCoreNotEmptyMessage,
  normalizeMessage as normalizeCoreMessage,
  normalizeMessages as normalizeCoreMessages,
  normalizeMessagesIncremental as normalizeCoreMessagesIncremental,
} from '#core/message-utils/normalize'
import type {
  IncrementalNormalizeMessagesCache as CoreIncrementalNormalizeMessagesCache,
  NormalizedMessage as CoreNormalizedMessage,
} from '#core/message-utils/normalize'
import type { Message as CoreMessage } from '#core/query'

import type { Message } from '../pipeline/types'

export type NormalizedMessage = CoreNormalizedMessage

export type IncrementalNormalizeMessagesCache =
  CoreIncrementalNormalizeMessagesCache

export function isNotEmptyMessage(message: Message): boolean {
  return isCoreNotEmptyMessage(message as unknown as CoreMessage)
}

export function normalizeMessage(message: Message): NormalizedMessage[] {
  return normalizeCoreMessage(message as unknown as CoreMessage)
}

export function normalizeMessages(messages: Message[]): NormalizedMessage[] {
  return normalizeCoreMessages(messages as unknown as CoreMessage[])
}

export function normalizeMessagesIncremental(args: {
  messages: Message[]
  previous: IncrementalNormalizeMessagesCache | null | undefined
  tailWindow?: number
}): IncrementalNormalizeMessagesCache {
  return normalizeCoreMessagesIncremental({
    ...args,
    messages: args.messages as unknown as CoreMessage[],
  })
}
