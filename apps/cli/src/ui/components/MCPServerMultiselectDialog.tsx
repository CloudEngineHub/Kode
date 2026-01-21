import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { MultiSelect } from '@inkjs/ui'
import {
  saveCurrentProjectConfig,
  getCurrentProjectConfig,
} from '#core/utils/config'
import { partition } from 'lodash-es'
import { MCPServerDialogCopy } from './MCPServerDialogCopy'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'

type Props = {
  serverNames: string[]
  onDone(): void
}

export function MCPServerMultiselectDialog({
  serverNames,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()
  const { rows, columns } = useTerminalSize()
  const tightLayout = rows <= 18 || columns <= 72
  const compactLayout = tightLayout || rows <= 22
  const paddingY = tightLayout ? 0 : 1
  const gap = tightLayout ? 0 : 1
  const paddingX = tightLayout || compactLayout ? 1 : 2

  function onSubmit(selectedServers: string[]) {
    const config = getCurrentProjectConfig()

    // Initialize arrays if they don't exist
    if (!config.approvedMcprcServers) {
      config.approvedMcprcServers = []
    }
    if (!config.rejectedMcprcServers) {
      config.rejectedMcprcServers = []
    }

    // Use partition to separate approved and rejected servers
    const [approvedServers, rejectedServers] = partition(serverNames, server =>
      selectedServers.includes(server),
    )

    // Add new servers directly to the respective lists
    config.approvedMcprcServers.push(...approvedServers)
    config.rejectedMcprcServers.push(...rejectedServers)

    saveCurrentProjectConfig(config)
    onDone()
  }

  const exitState = useExitOnCtrlCD(() => process.exit())

  useKeypress((_input, key) => {
    if (key.escape) {
      // On escape, treat all servers as rejected
      const config = getCurrentProjectConfig()
      if (!config.rejectedMcprcServers) {
        config.rejectedMcprcServers = []
      }

      for (const server of serverNames) {
        if (!config.rejectedMcprcServers.includes(server)) {
          config.rejectedMcprcServers.push(server)
        }
      }

      saveCurrentProjectConfig(config)
      onDone()
      return
    }
  })

  const reservedLines =
    (tightLayout ? 10 : compactLayout ? 12 : 14) + paddingY * 2 + gap * 4
  const visibleOptionCount = Math.max(
    3,
    Math.min(12, serverNames.length || 12, rows - reservedLines),
  )

  return (
    <ScreenFrame
      title="New MCP Servers Detected"
      exitState={exitState}
      paddingX={paddingX}
      paddingY={paddingY}
      gap={gap}
    >
      <Box flexDirection="column" gap={gap}>
        <Text color={theme.warning} wrap="truncate-end">
          This project contains an MCP config file (.mcp.json or .mcprc) with{' '}
          {serverNames.length} MCP servers that require your approval.
        </Text>

        <MCPServerDialogCopy />

        <Text wrap="truncate-end">
          Select the servers you want to enable (space toggles):
        </Text>

        <MultiSelect
          options={serverNames.map(server => ({
            label: server,
            value: server,
          }))}
          defaultValue={serverNames}
          visibleOptionCount={visibleOptionCount}
          onSubmit={onSubmit}
        />

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Space select · Enter confirm · Esc reject all'}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
