import { useCallback, useEffect, useRef, useState } from 'react'
import { getHistoryWithPastes } from '#core/history'
import type { PromptMode } from '#ui-ink/components/PromptInput/types'

const FAST_BROWSE_WINDOW_MS = 1500

export type ArrowKeyHistorySnapshot<Extra> = {
  text: string
  mode: PromptMode
  cursorOffset: number
  extra: Extra
}

export function useArrowKeyHistory<Extra>(args: {
  current: ArrowKeyHistorySnapshot<Extra>
  emptyExtra: Extra
  onRestore: (snapshot: ArrowKeyHistorySnapshot<Extra>) => void
  buildExtraFromHistoryEntry?: (entry: {
    display: string
    pastedTexts: Array<{ placeholder: string; text: string }>
  }) => Extra
}) {
  const { current, emptyExtra, onRestore, buildExtraFromHistoryEntry } = args

  const [historyIndex, setHistoryIndex] = useState(0)
  const historyIndexRef = useRef(0)
  useEffect(() => {
    historyIndexRef.current = historyIndex
  }, [historyIndex])

  const draftSnapshotRef = useRef<ArrowKeyHistorySnapshot<Extra> | null>(null)
  const historySnapshotRef = useRef<Array<{
    display: string
    pastedTexts: Array<{ placeholder: string; text: string }>
  }> | null>(null)
  const lastHistoryNavTimeRef = useRef(0)

  const currentRef = useRef(current)
  useEffect(() => {
    currentRef.current = current
  }, [current])

  const getHistorySnapshot = () => {
    if (!historySnapshotRef.current) {
      historySnapshotRef.current = getHistoryWithPastes()
    }
    return historySnapshotRef.current
  }

  const updateFromHistoryEntry = (
    entry:
      | {
          display: string
          pastedTexts: Array<{ placeholder: string; text: string }>
        }
      | undefined,
    cursor: 'start' | 'end',
  ) => {
    if (entry === undefined) return
    let mode: PromptMode = 'prompt'
    let text = entry.display
    if (entry.display.startsWith('!')) {
      mode = 'bash'
      text = entry.display.slice(1)
    } else if (entry.display.startsWith('&')) {
      mode = 'background'
      text = entry.display.slice(1)
    } else if (entry.display.startsWith('#')) {
      mode = 'koding'
      text = entry.display.slice(1)
    }
    onRestore({
      text,
      mode,
      cursorOffset: cursor === 'start' ? 0 : text.length,
      extra: buildExtraFromHistoryEntry
        ? buildExtraFromHistoryEntry(entry)
        : emptyExtra,
    })
  }

  function onHistoryUp() {
    const latestHistory = getHistorySnapshot()
    const prev = historyIndexRef.current
    if (prev >= latestHistory.length) return

    if (prev === 0) draftSnapshotRef.current = currentRef.current
    updateFromHistoryEntry(latestHistory[prev], 'start')

    const next = prev + 1
    historyIndexRef.current = next
    lastHistoryNavTimeRef.current = Date.now()
    setHistoryIndex(next)
  }

  function onHistoryDown() {
    const latestHistory = getHistorySnapshot()
    const prev = historyIndexRef.current
    if (prev > 1) {
      const next = prev - 1
      updateFromHistoryEntry(latestHistory[next - 1], 'end')
      historyIndexRef.current = next
      lastHistoryNavTimeRef.current = Date.now()
      setHistoryIndex(next)
      return
    }

    if (prev === 1) {
      onRestore(draftSnapshotRef.current ?? currentRef.current)
      draftSnapshotRef.current = null
      historyIndexRef.current = 0
      lastHistoryNavTimeRef.current = Date.now()
      setHistoryIndex(0)
      return
    }
  }

  const isInFastBrowseMode = useCallback(() => {
    return Date.now() - lastHistoryNavTimeRef.current < FAST_BROWSE_WINDOW_MS
  }, [])

  const onUserInput = useCallback(() => {
    if (historyIndexRef.current === 0) return
    historyIndexRef.current = 0
    draftSnapshotRef.current = null
    historySnapshotRef.current = null
    setHistoryIndex(0)
  }, [])

  function resetHistory() {
    historyIndexRef.current = 0
    setHistoryIndex(0)
    draftSnapshotRef.current = null
    historySnapshotRef.current = null
  }

  return {
    historyIndex,
    setHistoryIndex,
    onHistoryUp,
    onHistoryDown,
    onUserInput,
    resetHistory,
    isInFastBrowseMode,
  }
}
