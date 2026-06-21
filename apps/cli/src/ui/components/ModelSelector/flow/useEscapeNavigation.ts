import { useRef } from 'react'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

export function useEscapeNavigation(
  onEscape: () => void,
  _abortController?: AbortController,
) {
  const handledRef = useRef(false)

  useKeypress(
    (_input, key) => {
      if (key.escape && !handledRef.current) {
        handledRef.current = true
        setTimeout(() => {
          handledRef.current = false
        }, 100)
        onEscape()
        return true
      }
    },
    { isActive: true },
  )
}
