import { useStdout } from 'ink'
import { useEffect, useMemo, useRef, useState } from 'react'
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

const RESIZE_DEBOUNCE_MS = 150

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout()
  const stream = useMemo(
    () => (stdout ?? process.stdout) as unknown as Writable,
    [stdout],
  )
  const state = getStreamState(stream)

  const [size, setSize] = useState<TerminalSize>(() => state.size)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const streamState = getStreamState(stream)
    const listener = (next: TerminalSize) => {
      // Debounce rapid resize events
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null
        setSize(previous => {
          if (
            previous.columns === next.columns &&
            previous.rows === next.rows
          ) {
            return previous
          }
          return next
        })
      }, RESIZE_DEBOUNCE_MS)
    }

    streamState.listeners.add(listener)
    // Force-sync in case size changed between render and effect.
    setSize(streamState.size)

    if (!streamState.attached) {
      streamState.attached = true
      stream.setMaxListeners?.(20)
      stream.on?.('resize', streamState.onResize)
    }

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      streamState.listeners.delete(listener)
      if (streamState.listeners.size === 0 && streamState.attached) {
        streamState.attached = false
        stream.off?.('resize', streamState.onResize)
      }
    }
  }, [stream])

  return size
}
