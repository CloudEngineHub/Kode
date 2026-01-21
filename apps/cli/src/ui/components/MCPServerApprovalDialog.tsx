import React from 'react'
import { Box, Text } from 'ink'
import { getTheme } from '#core/utils/theme'
import { Select } from './CustomSelect/select'
import {
  saveCurrentProjectConfig,
  getCurrentProjectConfig,
} from '#core/utils/config'
import { MCPServerDialogCopy } from './MCPServerDialogCopy'
import { useExitOnCtrlCD } from '#ui-ink/hooks/useExitOnCtrlCD'
import { useKeypress } from '#ui-ink/hooks/useKeypress'
import { useTerminalSize } from '#ui-ink/hooks/useTerminalSize'
import { ScreenFrame } from '#ui-ink/primitives/layout/ScreenFrame'

type Props = {
  serverName: string
  onDone(): void
}

export function MCPServerApprovalDialog({
  serverName,
  onDone,
}: Props): React.ReactNode {
  const theme = getTheme()
  const { rows, columns } = useTerminalSize()
  const tightLayout = rows <= 18 || columns <= 72
  const compactLayout = tightLayout || rows <= 22
  const paddingY = tightLayout ? 0 : 1
  const gap = tightLayout ? 0 : 1
  const paddingX = tightLayout || compactLayout ? 1 : 2

  function onChange(value: 'yes' | 'no') {
    const config = getCurrentProjectConfig()
    switch (value) {
      case 'yes': {
        if (!config.approvedMcprcServers) {
          config.approvedMcprcServers = []
        }
        if (!config.approvedMcprcServers.includes(serverName)) {
          config.approvedMcprcServers.push(serverName)
        }
        saveCurrentProjectConfig(config)
        onDone()
        break
      }
      case 'no': {
        if (!config.rejectedMcprcServers) {
          config.rejectedMcprcServers = []
        }
        if (!config.rejectedMcprcServers.includes(serverName)) {
          config.rejectedMcprcServers.push(serverName)
        }
        saveCurrentProjectConfig(config)
        onDone()
        break
      }
    }
  }

  const exitState = useExitOnCtrlCD(() => process.exit(0))

  useKeypress((_input, key) => {
    if (key.escape) {
      onChange('no')
      return
    }
  })

  return (
    <ScreenFrame
      title="New MCP Server Detected"
      exitState={exitState}
      paddingX={paddingX}
      paddingY={paddingY}
      gap={gap}
    >
      <Box flexDirection="column" gap={gap}>
        <Text color={theme.warning} wrap="truncate-end">
          This project contains an MCP config file (.mcp.json or .mcprc) with an
          MCP server that requires your approval:
        </Text>

        <Text bold wrap="truncate-end">
          {serverName}
        </Text>

        <MCPServerDialogCopy />

        <Text wrap="truncate-end">Do you want to approve this MCP server?</Text>

        <Select
          options={[
            { label: 'Yes, approve this server', value: 'yes' },
            { label: 'No, reject this server', value: 'no' },
          ]}
          onChange={value => onChange(value as 'yes' | 'no')}
        />

        <Box marginTop={tightLayout ? 0 : 1}>
          <Text dimColor wrap="truncate-end">
            {exitState.pending
              ? `Press ${exitState.keyName} again to exit`
              : 'Enter confirm · Esc reject'}
          </Text>
        </Box>
      </Box>
    </ScreenFrame>
  )
}
