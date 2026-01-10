import { useStdout } from 'ink'
import { useEffect, useMemo, useState } from 'react'
import type { Writable } from 'node:stream'

type TerminalSize = { columns: number; rows: number }

type StreamState = {
  size: TerminalSize
  listeners: Set<(size: TerminalSize) => void>
  onResize: () => void
  attached: boolean
}

const streamStates = new WeakMap<Writable, StreamState>()

function readSize(stream: { columns?: number; rows?: number }): TerminalSize {
  return {
    columns: stream.columns || 80,
    rows: stream.rows || 24,
  }
}

function getStreamState(stream: Writable): StreamState {
  const existing = streamStates.get(stream)
  if (existing) return existing

  const state: StreamState = {
    size: readSize(stream as { columns?: number; rows?: number }),
    listeners: new Set(),
    onResize: () => {
      const next = readSize(stream as { columns?: number; rows?: number })
      state.size = next
      state.listeners.forEach(listener => listener(next))
    },
    attached: false,
  }

  streamStates.set(stream, state)
  return state
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout()
  const stream = useMemo(
    () => (stdout ?? process.stdout) as unknown as Writable,
    [stdout],
  )
  const state = getStreamState(stream)

  const [size, setSize] = useState<TerminalSize>(() => state.size)

  useEffect(() => {
    const streamState = getStreamState(stream)
    const listener = (next: TerminalSize) => {
      setSize(previous => {
        if (previous.columns === next.columns && previous.rows === next.rows) {
          return previous
        }
        return next
      })
    }

    streamState.listeners.add(listener)
    // Force-sync in case size changed between render and effect.
    listener(streamState.size)

    if (!streamState.attached) {
      streamState.attached = true
      stream.setMaxListeners?.(20)
      stream.on?.('resize', streamState.onResize)
    }

    return () => {
      streamState.listeners.delete(listener)
      if (streamState.listeners.size === 0 && streamState.attached) {
        streamState.attached = false
        stream.off?.('resize', streamState.onResize)
      }
    }
  }, [stream])

  return size
}
