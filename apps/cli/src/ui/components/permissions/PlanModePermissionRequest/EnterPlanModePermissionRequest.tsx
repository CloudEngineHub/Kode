import { Box, Text } from 'ink'
import React from 'react'
import figures from 'figures'
import { getTheme } from '#core/utils/theme'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import type { ToolUseConfirm } from '#ui-ink/components/permissions/PermissionRequest'

type Props = {
  toolUseConfirm: ToolUseConfirm
  onDone(): void
}

export function EnterPlanModePermissionRequest({
  toolUseConfirm,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()

  useKeypress((_, key) => {
    if (key.escape) {
      toolUseConfirm.onReject()
      onDone()
      return true
    }

    if (key.return) {
      toolUseConfirm.onAllow('temporary')
      onDone()
      return true
    }
  })

  return (
    <Box flexDirection="column" marginTop={1}>
      <Box flexDirection="row">
        <Text color={theme.planMode}>{figures.pointerSmall}</Text>
        <Text> Enter plan mode?</Text>
      </Box>
      <Box paddingLeft={2}>
        <Text dimColor>Enter to confirm · Esc to exit</Text>
      </Box>
    </Box>
  )
}
