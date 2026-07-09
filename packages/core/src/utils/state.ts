import {
  getCwd as getRuntimeCwd,
  getOriginalCwd,
  setCwd as setRuntimeCwd,
  setOriginalCwd,
} from '#runtime/cwd'

type CwdChangedEvent = {
  previousCwd: string
  cwd: string
}

type CwdChangedListener = (event: CwdChangedEvent) => void

const cwdChangedListeners = new Set<CwdChangedListener>()

export function getCwd(): string {
  return getRuntimeCwd()
}

export { getOriginalCwd, setOriginalCwd }

export function subscribeCwdChanged(listener: CwdChangedListener): () => void {
  cwdChangedListeners.add(listener)
  return () => {
    cwdChangedListeners.delete(listener)
  }
}

export async function setCwd(cwd: string): Promise<void> {
  const previousCwd = getRuntimeCwd()
  await setRuntimeCwd(cwd)
  const nextCwd = getRuntimeCwd()

  if (nextCwd === previousCwd) return

  const event = { previousCwd, cwd: nextCwd }
  for (const listener of cwdChangedListeners) {
    try {
      listener(event)
    } catch {
      // State observers must not break cwd changes.
    }
  }
}

export function __resetCwdChangedListenersForTests(): void {
  cwdChangedListeners.clear()
}
