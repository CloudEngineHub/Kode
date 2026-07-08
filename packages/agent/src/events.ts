export type AgentReloadEvent = {
  changedPaths: string[]
  triggeredAt: number
}

type Listener = (event: AgentReloadEvent) => void

const listeners = new Set<Listener>()

export function subscribeAgentReloads(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitAgentReloaded(event?: {
  changedPaths?: string[]
  triggeredAt?: number
}): void {
  const record: AgentReloadEvent = {
    changedPaths: event?.changedPaths ?? [],
    triggeredAt: event?.triggeredAt ?? Date.now(),
  }

  for (const listener of listeners) {
    try {
      listener(record)
    } catch {
      // ignore listener errors
    }
  }
}
