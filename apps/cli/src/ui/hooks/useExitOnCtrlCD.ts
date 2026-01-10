import { useDoublePress } from './useDoublePress'
import { useState } from 'react'
import { useKeypress } from '#ui-ink/hooks/useKeypress'

type ExitState = {
  pending: boolean
  keyName: 'Ctrl-C' | 'Ctrl-D' | null
}

export function useExitOnCtrlCD(onExit: () => void): ExitState {
  const [exitState, setExitState] = useState<ExitState>({
    pending: false,
    keyName: null,
  })

  const handleCtrlC = useDoublePress(
    pending => setExitState({ pending, keyName: 'Ctrl-C' }),
    onExit,
  )
  const handleCtrlD = useDoublePress(
    pending => setExitState({ pending, keyName: 'Ctrl-D' }),
    onExit,
  )

  useKeypress((input, key) => {
    if (key.ctrl && input === 'c') {
      handleCtrlC()
      return true
    }
    if (key.ctrl && input === 'd') {
      handleCtrlD()
      return true
    }
  })

  return exitState
}
