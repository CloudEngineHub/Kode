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
const TOKEN_NOTIFICATION_INTERVAL_MS = 200
let tokenNotificationTimer: ReturnType<typeof setTimeout> | null = null
let lastTokenNotificationAt = 0

function notifyListeners(): void {
  for (const listener of listeners) listener(current)
}

function clearTokenNotificationTimer(): void {
  if (!tokenNotificationTimer) return
  clearTimeout(tokenNotificationTimer)
  tokenNotificationTimer = null
}

function notifyTokenListenersThrottled(): void {
  const now = Date.now()
  const elapsed = now - lastTokenNotificationAt
  if (
    lastTokenNotificationAt === 0 ||
    elapsed >= TOKEN_NOTIFICATION_INTERVAL_MS
  ) {
    clearTokenNotificationTimer()
    lastTokenNotificationAt = now
    notifyListeners()
    return
  }

  if (tokenNotificationTimer) return
  tokenNotificationTimer = setTimeout(() => {
    tokenNotificationTimer = null
    lastTokenNotificationAt = Date.now()
    notifyListeners()
  }, TOKEN_NOTIFICATION_INTERVAL_MS - elapsed)
}

export function getRequestStatus(): RequestStatus {
  return current
}

export function setRequestStatus(
  status: Omit<RequestStatus, 'updatedAt'>,
): void {
  clearTokenNotificationTimer()
  if (status.kind === 'idle') lastTokenNotificationAt = 0
  current = { ...current, ...status, updatedAt: Date.now() }
  notifyListeners()
}

export function setRequestInputTokens(inputTokens: number): void {
  if (current.kind !== 'idle') {
    clearTokenNotificationTimer()
    current = {
      ...current,
      inputTokens,
      outputTokens: undefined,
      updatedAt: Date.now(),
    }
    notifyListeners()
  }
}

export function updateRequestTokens(outputTokens: number): void {
  if (current.kind !== 'idle') {
    current = { ...current, outputTokens, updatedAt: Date.now() }
    notifyTokenListenersThrottled()
  }
}

export function subscribeRequestStatus(
  listener: (status: RequestStatus) => void,
): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
