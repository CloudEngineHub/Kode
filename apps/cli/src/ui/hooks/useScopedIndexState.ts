import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'

type ScopedIndexSnapshot = {
  index: number
  updatedAt: number
}

const SCOPED_INDEX_TTL_MS = 5_000
const scopedIndexSnapshots = new Map<string, ScopedIndexSnapshot>()

function clampIndex(value: number, itemCount: number): number {
  if (!Number.isFinite(value) || itemCount <= 0) return 0
  return Math.max(0, Math.min(Math.trunc(value), itemCount - 1))
}

function getScopedInitialIndex(args: {
  scope: string
  initialIndex: number
  itemCount: number
  ttlMs: number
}): number {
  const snapshot = scopedIndexSnapshots.get(args.scope)
  if (snapshot && Date.now() - snapshot.updatedAt <= args.ttlMs) {
    return clampIndex(snapshot.index, args.itemCount)
  }
  return clampIndex(args.initialIndex, args.itemCount)
}

function rememberScopedIndex(scope: string, index: number): void {
  scopedIndexSnapshots.set(scope, {
    index,
    updatedAt: Date.now(),
  })
}

export function useScopedIndexState({
  scope,
  itemCount,
  initialIndex = 0,
  ttlMs = SCOPED_INDEX_TTL_MS,
}: {
  scope: string
  itemCount: number
  initialIndex?: number
  ttlMs?: number
}): [number, Dispatch<SetStateAction<number>>] {
  const initial = useMemo(
    () => getScopedInitialIndex({ scope, initialIndex, itemCount, ttlMs }),
    // This is the mount-time restore point. Later changes are clamped by
    // effects and updater refs so remounts do not pull focus back to zero.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [index, setIndexState] = useState(initial)
  const itemCountRef = useRef(itemCount)
  const scopeRef = useRef(scope)
  const indexRef = useRef(index)
  const previousScopeRef = useRef(scope)

  itemCountRef.current = itemCount
  scopeRef.current = scope
  indexRef.current = index

  useEffect(() => {
    const scopeChanged = previousScopeRef.current !== scope
    previousScopeRef.current = scope

    const currentIndex = indexRef.current
    const next = scopeChanged
      ? getScopedInitialIndex({ scope, initialIndex, itemCount, ttlMs })
      : clampIndex(currentIndex, itemCount)

    rememberScopedIndex(scope, next)
    if (next === currentIndex) return

    indexRef.current = next
    setIndexState(next)
  }, [initialIndex, itemCount, scope, ttlMs])

  const setIndex = useCallback<Dispatch<SetStateAction<number>>>(next => {
    setIndexState(prev => {
      const raw = typeof next === 'function' ? next(prev) : next
      const clamped = clampIndex(raw, itemCountRef.current)
      indexRef.current = clamped
      rememberScopedIndex(scopeRef.current, clamped)
      return clamped
    })
  }, [])

  useEffect(() => {
    rememberScopedIndex(scope, index)
  }, [index, scope])

  return [index, setIndex]
}
