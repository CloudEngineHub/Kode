import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '#core/utils/theme'
import { ASCII_LOGO } from '#core/constants/product'

export const MIN_LOGO_WIDTH = 70

export function Logo({
  mcpClients,
  updateBannerVersion,
  terminalColumns,
}: {
  mcpClients: any[]
  isDefaultModel?: boolean
  updateBannerVersion?: string | null
  updateBannerCommands?: string[] | null
  terminalColumns?: number
}): React.ReactNode {
  const theme = getTheme()

  const connected = mcpClients.filter(c => c.type === 'connected')
  const failed = mcpClients.filter(c => c.type !== 'connected')

  // Generate separator that fits terminal width
  const separatorWidth = Math.min(terminalColumns || 80, 80) - 16
  const separator = '─'.repeat(Math.max(separatorWidth, 20))

  return (
    <Box flexDirection="column">
      {/* Update notice at very top */}
      {updateBannerVersion && (
        <Box marginBottom={1}>
          <Text color="yellow">
            Update {updateBannerVersion} available: npm i -g
            @shareai-lab/kode@latest
          </Text>
        </Box>
      )}

      {/* ASCII Logo */}
      <Box flexDirection="column">
        <Text color={theme.kode}>{ASCII_LOGO}</Text>
      </Box>

      {/* Quick tips - single line */}
      <Box marginTop={1}>
        <Text dimColor>
          /init{'  '}/help{'  '}
          <Text color={theme.bashBorder}>!</Text>shell{'  '}
          <Text color={theme.notingBorder}>#</Text>note{'  '}
          @file{'  '}opt+m{'  '}opt+g
        </Text>
      </Box>

      {/* MCP Servers section */}
      <Box flexDirection="column" marginTop={2}>
        <Text dimColor>── MCP Servers {separator}</Text>
        <Box marginTop={1} paddingLeft={3}>
          {mcpClients.length === 0 ? (
            <Text dimColor>
              No servers configured - run: kode mcp add {'<name>'}
            </Text>
          ) : (
            <>
              {connected.map(c => (
                <Text key={c.name}>
                  <Text color={theme.success}>{c.name}</Text>
                  <Text dimColor> </Text>
                </Text>
              ))}
              {failed.map(c => (
                <Text key={c.name}>
                  <Text color={theme.error}>{c.name}</Text>
                  <Text dimColor> </Text>
                </Text>
              ))}
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
