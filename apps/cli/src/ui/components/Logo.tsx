import { Box, Text } from 'ink'
import * as React from 'react'
import { getTheme } from '#core/utils/theme'
import { ASCII_LOGO, PRODUCT_NAME } from '#core/constants/product'

export const MIN_LOGO_WIDTH = 70
const DEFAULT_TERMINAL_COLUMNS = 80
const DEFAULT_TERMINAL_ROWS = 24
const FULL_LOGO_MIN_ROWS = 18
const DISPLAY_ASCII_LOGO = ASCII_LOGO.trimStart()

function normalizeDimension(value: number | undefined, fallback: number) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.max(1, Math.floor(value))
}

export function Logo({
  mcpClients,
  updateBannerVersion,
  terminalColumns,
  terminalRows,
}: {
  mcpClients: any[]
  isDefaultModel?: boolean
  updateBannerVersion?: string | null
  updateBannerCommands?: string[] | null
  terminalColumns?: number
  terminalRows?: number
}): React.ReactNode {
  const theme = getTheme()

  const connected = mcpClients.filter(c => c.type === 'connected')
  const failed = mcpClients.filter(c => c.type !== 'connected')
  const columns = normalizeDimension(terminalColumns, DEFAULT_TERMINAL_COLUMNS)
  const rows = normalizeDimension(terminalRows, DEFAULT_TERMINAL_ROWS)
  const isCompact = columns < MIN_LOGO_WIDTH || rows < FULL_LOGO_MIN_ROWS

  // Generate separator that fits terminal width
  const separatorWidth = isCompact
    ? Math.max(0, Math.min(columns, 80) - 'MCP Servers '.length)
    : Math.min(columns, 80) - 16
  const separator = (isCompact ? '-' : '─').repeat(
    Math.max(separatorWidth, isCompact ? 0 : 20),
  )

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
        {isCompact ? (
          <Text bold color={theme.kode}>
            {PRODUCT_NAME.toUpperCase()} CLI
          </Text>
        ) : (
          <Text color={theme.kode}>{DISPLAY_ASCII_LOGO}</Text>
        )}
      </Box>

      {/* Quick tips - single line */}
      <Box marginTop={isCompact ? 0 : 1}>
        <Text dimColor>
          {isCompact ? null : <>/init{'  '}</>}
          /help{'  '}
          {!isCompact ? <Text color={theme.bashBorder}>/bash</Text> : null}
          {!isCompact ? ' ' : null}
          <Text color={theme.notingBorder}>/note</Text>
          {'  '}
          @file{'  '}opt+m{isCompact ? null : '  opt+g'}
        </Text>
      </Box>

      {/* MCP Servers section */}
      <Box flexDirection="column" marginTop={isCompact ? 1 : 2}>
        <Text dimColor>
          {isCompact
            ? `MCP Servers ${separator}`
            : `── MCP Servers ${separator}`}
        </Text>
        <Box marginTop={isCompact ? 0 : 1} paddingLeft={isCompact ? 1 : 3}>
          {mcpClients.length === 0 ? (
            <Text dimColor wrap={isCompact ? 'truncate-end' : 'wrap'}>
              {isCompact
                ? 'No servers configured'
                : 'No servers configured - run: kode mcp add <name>'}
            </Text>
          ) : isCompact ? (
            <Text wrap="truncate-end">
              {connected.map((c, index) => (
                <React.Fragment key={c.name}>
                  {index > 0 ? <Text dimColor>, </Text> : null}
                  <Text color={theme.success}>{c.name}</Text>
                </React.Fragment>
              ))}
              {failed.map((c, index) => (
                <React.Fragment key={c.name}>
                  {connected.length > 0 || index > 0 ? (
                    <Text dimColor>, </Text>
                  ) : null}
                  <Text color={theme.error}>{c.name}</Text>
                </React.Fragment>
              ))}
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
