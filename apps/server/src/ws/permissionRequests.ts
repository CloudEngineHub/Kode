import type {
  DaemonClient,
  DaemonSession,
  InflightPermissionDecision,
  InflightPermissionRequest,
} from './types'

export const DEFAULT_PERMISSION_DECISION_TIMEOUT_MS = 5 * 60 * 1_000

function deniedPermissionDecision(message: string): InflightPermissionDecision {
  return {
    decision: 'deny',
    rejectionMessage: message,
    updatedInput: null,
  }
}

function isClientAvailable(
  session: DaemonSession,
  client: DaemonClient,
): boolean {
  if (!session.clients.has(client)) return false
  const readyState = (client as DaemonClient & { readyState?: unknown })
    .readyState
  return typeof readyState !== 'number' || readyState === 1
}

function hasAvailableRecipient(
  session: DaemonSession,
  owner: DaemonClient | null,
): boolean {
  if (owner) return isClientAvailable(session, owner)
  return Array.from(session.clients).some(client =>
    isClientAvailable(session, client),
  )
}

export async function waitForPermissionDecision(args: {
  session: DaemonSession
  requestId: string
  owner: DaemonClient | null
  signal?: AbortSignal
  timeoutMs?: number
  sendRequest: () => void
}): Promise<InflightPermissionDecision> {
  if (args.signal?.aborted) {
    return deniedPermissionDecision('Cancelled')
  }
  if (!hasAvailableRecipient(args.session, args.owner)) {
    return deniedPermissionDecision('Disconnected')
  }

  let resolveDecision: (value: InflightPermissionDecision) => void = () => {}
  const decisionPromise = new Promise<InflightPermissionDecision>(resolve => {
    resolveDecision = resolve
  })
  const entry: InflightPermissionRequest = {
    owner: args.owner,
    resolve: resolveDecision,
  }

  const previous = args.session.inflightPermissionRequests.get(args.requestId)
  if (previous) {
    args.session.inflightPermissionRequests.delete(args.requestId)
    previous.resolve(deniedPermissionDecision('Superseded'))
  }
  args.session.inflightPermissionRequests.set(args.requestId, entry)

  const settleDenied = (message: string) => {
    if (args.session.inflightPermissionRequests.get(args.requestId) === entry) {
      args.session.inflightPermissionRequests.delete(args.requestId)
    }
    entry.resolve(deniedPermissionDecision(message))
  }
  const onAbort = () => settleDenied('Cancelled')

  const configuredTimeout =
    args.timeoutMs ?? DEFAULT_PERMISSION_DECISION_TIMEOUT_MS
  const timeoutMs = Number.isFinite(configuredTimeout)
    ? Math.max(1, Math.floor(configuredTimeout))
    : DEFAULT_PERMISSION_DECISION_TIMEOUT_MS
  const timeout = setTimeout(() => {
    settleDenied('Permission request timed out')
  }, timeoutMs)
  timeout.unref?.()

  if (args.signal?.aborted) onAbort()
  else args.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    if (
      !args.signal?.aborted &&
      hasAvailableRecipient(args.session, args.owner)
    ) {
      try {
        args.sendRequest()
      } catch {
        settleDenied('Permission request could not be delivered')
      }
    } else {
      settleDenied(args.signal?.aborted ? 'Cancelled' : 'Disconnected')
    }

    if (!hasAvailableRecipient(args.session, args.owner)) {
      settleDenied('Disconnected')
    }
    return await decisionPromise
  } finally {
    clearTimeout(timeout)
    args.signal?.removeEventListener('abort', onAbort)
    if (args.session.inflightPermissionRequests.get(args.requestId) === entry) {
      args.session.inflightPermissionRequests.delete(args.requestId)
    }
  }
}

export function resolvePermissionRequest(
  session: DaemonSession,
  requestId: string,
  actor: DaemonClient,
  decision: InflightPermissionDecision,
): boolean {
  const entry = session.inflightPermissionRequests.get(requestId)
  if (!entry) return false
  if (!isClientAvailable(session, actor)) return false
  if (entry.owner !== null && entry.owner !== actor) return false
  session.inflightPermissionRequests.delete(requestId)
  entry.resolve(decision)
  return true
}

export function denyAllPermissionRequests(
  session: DaemonSession,
  message: string,
): void {
  for (const [requestId, entry] of session.inflightPermissionRequests) {
    session.inflightPermissionRequests.delete(requestId)
    entry.resolve(deniedPermissionDecision(message))
  }
}

export function denyPermissionRequestsOwnedBy(
  session: DaemonSession,
  owner: DaemonClient,
  message: string,
): void {
  for (const [requestId, entry] of session.inflightPermissionRequests) {
    if (entry.owner !== owner) continue
    session.inflightPermissionRequests.delete(requestId)
    entry.resolve(deniedPermissionDecision(message))
  }
}
