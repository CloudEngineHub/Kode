/**
 * Response state management for Responses API
 * Tracks previous_response_id for conversation chaining
 */

// Store the last response ID for each conversation
const responseIdCache = new Map<string, string>()

export function getLastResponseId(conversationId: string): string | undefined {
  return responseIdCache.get(conversationId)
}

export function setLastResponseId(conversationId: string, responseId: string): void {
  responseIdCache.set(conversationId, responseId)
}

export function clearResponseId(conversationId: string): void {
  responseIdCache.delete(conversationId)
}

export function clearAllResponseIds(): void {
  responseIdCache.clear()
}