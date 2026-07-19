import { useStdout } from 'ink'
import { useMemo, useSyncExternalStore } from 'react'
import type { Writable } from 'node:stream'
import { normalizeTerminalDimension } from '#ui-ink/primitives/layout/viewportRows'

export type TerminalSize = { columns: number; rows: number }

type StreamState = {
  size: TerminalSize
  listeners: Set<() => void>
  onResize: () => void
  attached: boolean
  debounceTimer: ReturnType<typeof setTimeout> | null
}

const streamStates = new WeakMap<Writable, StreamState>()

export function readTerminalSize(stream: {
  columns?: number
  rows?: number
}): TerminalSize {
  return {
    columns: normalizeTerminalDimension(stream.columns, 80),
    rows: normalizeTerminalDimension(stream.rows, 24),
  }
}

export function areTerminalSizesEqual(
  previous: TerminalSize,
  next: TerminalSize,
): boolean {
  return previous.columns === next.columns && previous.rows === next.rows
}

function isTransientZeroSize(size: TerminalSize): boolean {
  return size.columns <= 0 || size.rows <= 0
}

function readInitialTerminalSize(stream: Writable): TerminalSize {
  const size = readTerminalSize(stream as { columns?: number; rows?: number })
  if (!isTransientZeroSize(size)) return size
  return { columns: 80, rows: 24 }
}

function holdLastVisibleStreamSize(stream: Writable, size: TerminalSize): void {
  const target = stream as { columns?: number; rows?: number }
  try {
    if (typeof target.columns === 'number' && target.columns <= 0) {
      target.columns = size.columns
    }
    if (typeof target.rows === 'number' && target.rows <= 0) {
      target.rows = size.rows
    }
  } catch {
    // Some custom streams may expose readonly dimensions.
  }
}

function getStreamState(stream: Writable): StreamState {
  const existing = streamStates.get(stream)
  if (existing) return existing

  const state: StreamState = {
    size: readInitialTerminalSize(stream),
    listeners: new Set(),
    debounceTimer: null,
    onResize: () => {
      const next = readTerminalSize(
        stream as { columns?: number; rows?: number },
      )
      if (isTransientZeroSize(next)) {
        holdLastVisibleStreamSize(stream, state.size)
      }
      commitResize(state, next)
    },
    attached: false,
  }

  streamStates.set(stream, state)
  return state
}

const RESIZE_DEBOUNCE_MS = 150

function emit(state: StreamState): void {
  state.listeners.forEach(listener => listener())
}

function commitSize(state: StreamState, next: TerminalSize): void {
  if (areTerminalSizesEqual(state.size, next)) return
  state.size = next
  emit(state)
}

function commitResize(state: StreamState, next: TerminalSize): void {
  if (isTransientZeroSize(next)) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }
    return
  }

  if (areTerminalSizesEqual(state.size, next)) return

  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer)
    state.debounceTimer = null
  }

  const isShrinking =
    next.columns < state.size.columns || next.rows < state.size.rows
  if (isShrinking) {
    commitSize(state, next)
    return
  }

  // Debounce rapid expand/jitter resize events without rendering a stale wide
  // layout into a newly narrowed terminal.
  state.debounceTimer = setTimeout(() => {
    state.debounceTimer = null
    commitSize(state, next)
  }, RESIZE_DEBOUNCE_MS)
}

export function getTerminalSizeSnapshot(stream: Writable): TerminalSize {
  const state = getStreamState(stream)
  const streamSize = readTerminalSize(
    stream as { columns?: number; rows?: number },
  )
  if (isTransientZeroSize(streamSize)) {
    holdLastVisibleStreamSize(stream, state.size)
    return state.size
  }

  const isShrinking =
    streamSize.columns < state.size.columns || streamSize.rows < state.size.rows
  if (isShrinking) {
    if (state.debounceTimer) {
      clearTimeout(state.debounceTimer)
      state.debounceTimer = null
    }
    state.size = streamSize
  }
  return state.size
}

export function subscribeTerminalSize(
  stream: Writable,
  listener: () => void,
): () => void {
  const state = getStreamState(stream)
  state.listeners.add(listener)
  commitResize(
    state,
    readTerminalSize(stream as { columns?: number; rows?: number }),
  )

  if (!state.attached) {
    state.attached = true
    stream.setMaxListeners?.(20)
    if (typeof stream.prependListener === 'function') {
      stream.prependListener('resize', state.onResize)
    } else {
      stream.on?.('resize', state.onResize)
    }
  }

  return () => {
    state.listeners.delete(listener)
    if (state.listeners.size === 0 && state.attached) {
      state.attached = false
      stream.off?.('resize', state.onResize)
      if (state.debounceTimer) {
        clearTimeout(state.debounceTimer)
        state.debounceTimer = null
      }
    }
  }
}

export function useTerminalSize(): TerminalSize {
  const { stdout } = useStdout()
  const stream = useMemo(
    () => (stdout ?? process.stdout) as unknown as Writable,
    [stdout],
  )
  const store = useMemo(
    () => ({
      subscribe: (listener: () => void) =>
        subscribeTerminalSize(stream, listener),
      getSnapshot: () => getTerminalSizeSnapshot(stream),
    }),
    [stream],
  )

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}

export const __terminalSizeStoreForTests = {
  getStreamState,
}
