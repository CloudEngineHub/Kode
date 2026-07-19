import type { NormalizedMessage } from '#core/utils/messages'
import { getToolUseID } from '#core/utils/messages'
import type { ProgressMessage } from '#core/query'

function intersects<A>(a: Set<A>, b: Set<A>): boolean {
  if (a.size === 0 || b.size === 0) return false
  for (const item of a) {
    if (b.has(item)) return true
  }
  return false
}

type ProgressMessageLookup = (toolUseID: string) => ProgressMessage | undefined

function indexProgressMessages(
  messages: NormalizedMessage[],
): Map<string, ProgressMessage> {
  const progressMessages = new Map<string, ProgressMessage>()
  for (const message of messages) {
    if (
      message.type === 'progress' &&
      !progressMessages.has(message.toolUseID)
    ) {
      // Preserve Array.find semantics when duplicate progress records exist.
      progressMessages.set(message.toolUseID, message)
    }
  }
  return progressMessages
}

function shouldRenderWithProgressLookup(
  message: NormalizedMessage,
  unresolvedToolUseIDs: Set<string>,
  getProgressMessage: ProgressMessageLookup,
): boolean {
  switch (message.type) {
    case 'user':
    case 'assistant': {
      const toolUseID = getToolUseID(message)
      if (!toolUseID) {
        return true
      }
      if (unresolvedToolUseIDs.has(toolUseID)) {
        return false
      }

      const correspondingProgressMessage = getProgressMessage(toolUseID)
      if (!correspondingProgressMessage) {
        return true
      }

      return !intersects(
        unresolvedToolUseIDs,
        correspondingProgressMessage.siblingToolUseIDs,
      )
    }
    case 'progress':
      return !intersects(unresolvedToolUseIDs, message.siblingToolUseIDs)
  }
}

export function shouldRenderReplMessageStatically(
  message: NormalizedMessage,
  messages: NormalizedMessage[],
  unresolvedToolUseIDs: Set<string>,
): boolean {
  let progressMessages: Map<string, ProgressMessage> | undefined
  return shouldRenderWithProgressLookup(
    message,
    unresolvedToolUseIDs,
    toolUseID => {
      progressMessages ??= indexProgressMessages(messages)
      return progressMessages.get(toolUseID)
    },
  )
}

/**
 * Ink <Static> expects its `items` list to be append-only.
 *
 * If we include static-eligible messages that appear *after* a transient message,
 * later transitions (transient -> static) would insert into the middle of the list,
 * causing Ink to replay tail items into the scrollback (duplicates).
 *
 * To prevent this, the static portion must always be a prefix of the ordered
 * message list.
 */
export function getReplStaticPrefixLength(
  orderedMessages: NormalizedMessage[],
  allMessages: NormalizedMessage[],
  unresolvedToolUseIDs: Set<string>,
): number {
  const progressMessages = indexProgressMessages(allMessages)
  const getProgressMessage = (toolUseID: string) =>
    progressMessages.get(toolUseID)
  for (let i = 0; i < orderedMessages.length; i++) {
    const message = orderedMessages[i]!
    if (
      !shouldRenderWithProgressLookup(
        message,
        unresolvedToolUseIDs,
        getProgressMessage,
      )
    ) {
      return i
    }
  }
  return orderedMessages.length
}
