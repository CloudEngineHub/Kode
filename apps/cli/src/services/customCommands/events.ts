export type CustomCommandReloadEvent = {
  changedPaths: string[]
  triggeredAt: number
}

type Listener = (event: CustomCommandReloadEvent) => void

const listeners = new Set<Listener>()

export function subscribeCustomCommandReloads(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function emitCustomCommandReloaded(event?: {
  changedPaths?: string[]
  triggeredAt?: number
}): void {
  const record: CustomCommandReloadEvent = {
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
