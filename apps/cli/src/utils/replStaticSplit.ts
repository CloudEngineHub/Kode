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

export function shouldRenderReplMessageStatically(
  message: NormalizedMessage,
  messages: NormalizedMessage[],
  unresolvedToolUseIDs: Set<string>,
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

      const correspondingProgressMessage = messages.find(
        _ => _.type === 'progress' && _.toolUseID === toolUseID,
      ) as ProgressMessage | null
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
  for (let i = 0; i < orderedMessages.length; i++) {
    const message = orderedMessages[i]!
    if (
      !shouldRenderReplMessageStatically(
        message,
        allMessages,
        unresolvedToolUseIDs,
      )
    ) {
      return i
    }
  }
  return orderedMessages.length
}
