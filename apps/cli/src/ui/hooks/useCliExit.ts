import { useApp } from 'ink'
import { useCallback } from 'react'
import { requestCliExit } from '#cli-utils/exit'

export function useCliExit(): (code?: number) => void {
  const { exit } = useApp()

  return useCallback(
    (code = 0) => {
      try {
        exit()
      } catch {
        // If the component is rendered outside Ink in a test, still use the
        // process-level exit handler.
      }
      requestCliExit(code)
    },
    [exit],
  )
}
