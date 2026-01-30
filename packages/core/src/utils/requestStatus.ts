export type RequestStatusKind = 'idle' | 'thinking' | 'streaming' | 'tool'

export type RequestStatus = {
  kind: RequestStatusKind
  detail?: string
  updatedAt: number
  inputTokens?: number
  outputTokens?: number
  thinkingDurationMs?: number
}

let current: RequestStatus = { kind: 'idle', updatedAt: Date.now() }
const listeners = new Set<(status: RequestStatus) => void>()

export function getRequestStatus(): RequestStatus {
  return current
}

export function setRequestStatus(
  status: Omit<RequestStatus, 'updatedAt'>,
): void {
  current = { ...current, ...status, updatedAt: Date.now() }
  for (const listener of listeners) listener(current)
}

export function setRequestInputTokens(inputTokens: number): void {
  if (current.kind !== 'idle') {
    current = {
      ...current,
      inputTokens,
      outputTokens: undefined,
      updatedAt: Date.now(),
    }
    for (const listener of listeners) listener(current)
  }
}

export function updateRequestTokens(outputTokens: number): void {
  if (current.kind !== 'idle') {
    current = { ...current, outputTokens, updatedAt: Date.now() }
    for (const listener of listeners) listener(current)
  }
}

export function subscribeRequestStatus(
  listener: (status: RequestStatus) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
