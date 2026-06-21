import React, { useCallback, useMemo, useRef } from 'react'
import { Box, Text } from 'ink'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'
import { useScreenLayout } from '#ui-ink/primitives/layout/useScreenLayout'
import { getTheme } from '#core/utils/theme'
import { getPermissionModeCycleShortcut } from '#ui-ink/utils/permissionModeCycleShortcut'

type Props = {
  onDone: () => void
}

export function ShortcutsScreen({ onDone }: Props): React.ReactNode {
  const theme = getTheme()
  const layout = useScreenLayout()
  const exitState = { pending: false, keyName: null } as const
  const didDoneRef = useRef(false)

  const safeOnDone = useCallback(() => {
    if (didDoneRef.current) return
    didDoneRef.current = true
    onDone()
  }, [onDone])

  const modeCycleShortcut = useMemo(() => getPermissionModeCycleShortcut(), [])

  useKeypress((input, key) => {
    const inputChar = input.length === 1 ? input : ''
    if (key.escape || inputChar === '?' || (key.ctrl && inputChar === 'c')) {
      safeOnDone()
      return true
    }
  })

  const leftWidth = 22
  const middleWidth = 35

  return (
    <ScreenFrame
      title="Shortcuts"
      exitState={exitState}
      paddingX={layout.paddingX}
      paddingY={layout.paddingY}
      gap={layout.gap}
    >
      <Box flexDirection="row" gap={Math.max(2, layout.gap)} paddingX={1}>
        <Box flexDirection="column" width={leftWidth}>
          <Text dimColor>! for bash mode</Text>
          <Text dimColor>/ for commands</Text>
          <Text dimColor>@ for file paths</Text>
          <Text dimColor>&amp; for background</Text>
          <Text dimColor>ctrl/opt + b bash mode</Text>
        </Box>

        <Box flexDirection="column" width={middleWidth}>
          <Text dimColor>double tap esc to clear input</Text>
          <Text dimColor>
            {modeCycleShortcut.displayText.replace('+', ' + ')} to auto-accept
            edits
          </Text>
          <Text dimColor>ctrl + o for transcript output</Text>
          <Text dimColor>ctrl + t to show work tasks</Text>
          <Text dimColor>shift/ctrl + enter newline</Text>
        </Box>

        <Box flexDirection="column">
          <Text dimColor>ctrl + _ to undo</Text>
          <Text dimColor>ctrl + v to paste images</Text>
          <Text dimColor>ctrl/opt + m switch model</Text>
          <Text dimColor>ctrl/opt + g ext editor</Text>
          <Text dimColor>
            <Text color={theme.secondaryText}>Esc</Text> to close
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
